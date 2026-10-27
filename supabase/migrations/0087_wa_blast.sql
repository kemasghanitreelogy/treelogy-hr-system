-- ============================================================
-- Treelogy Workspace — Blast WhatsApp (Qontak)
--
-- Antrean kirim pesan template WhatsApp lewat Qontak (gateway Mekari, HMAC).
-- Jalur "direct" dibatasi Qontak 60 request/menit PER AKUN, jadi:
--
--   • Antreannya di database, bukan di browser — blast 1.000 nomor makan
--     ±18 menit dan tidak boleh bergantung pada tab yang tetap terbuka.
--   • Satu worker global (lease di tabel, bukan advisory lock: koneksi
--     PostgREST di-pool, kunci level sesi tidak bisa diandalkan). Dua orang
--     yang blast bersamaan berbagi SATU kuota, tidak saling memicu 429.
--   • Anggaran rate dihitung dari DB (request dalam 60 detik terakhir), jadi
--     dua pemanggilan worker berurutan tidak bisa menumpuk melewati batas.
--
-- Akses mengikuti menu Receipt Sales: siapa pun yang punya `receipt.view`.
-- ============================================================

create table if not exists wa_campaigns (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  source                  text not null check (source in ('receipt','upload')),
  template_id             text not null,
  template_name           text not null,
  language                text not null default 'id',
  channel_integration_id  text not null,
  channel_phone           text,
  /** Salinan template saat kampanye dibuat — pratinjau riwayat tetap benar
   *  walau template di Qontak kemudian diubah. */
  template_body           text not null default '',
  engine                  text not null default 'direct' check (engine in ('bulk','direct')),
  status                  text not null default 'draft'
                          check (status in ('draft','sending','done','partial','failed','cancelled')),
  /** Alasan kampanye berhenti total (kredensial/scope dicabut, dsb). */
  stop_reason             text,
  qontak_broadcast_id     text,
  created_by              uuid references auth.users(id) on delete set null,
  created_by_name         text,
  created_at              timestamptz not null default now(),
  started_at              timestamptz,
  finished_at             timestamptz
);

create table if not exists wa_campaign_recipients (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid not null references wa_campaigns(id) on delete cascade,
  seq              int not null,
  /** Digit saja, berawalan kode negara: 6281234567890. */
  phone            text not null,
  name             text not null default '',
  /** Nomor resi — kunci anti-blast-ganda. '' bila bukan blast resi. */
  awb              text not null default '',
  /** Nilai per slot ("body:1" → "JD0123…") — untuk pratinjau & riwayat. */
  vals             jsonb not null default '{}'::jsonb,
  /** `parameters` siap kirim, dibangun server saat kampanye dibuat. */
  params           jsonb not null default '{}'::jsonb,
  status           text not null default 'queued'
                   check (status in ('queued','sending','sent','failed','skipped','unknown')),
  attempts         int not null default 0,
  next_attempt_at  timestamptz,
  last_attempt_at  timestamptz,
  last_error       text,
  qontak_ref       text,
  sent_at          timestamptz,
  unique (campaign_id, phone, awb)
);

create index if not exists wa_recipients_queue_idx
  on wa_campaign_recipients (status, next_attempt_at, seq)
  where status in ('queued','sending');
create index if not exists wa_recipients_attempt_idx
  on wa_campaign_recipients (last_attempt_at)
  where last_attempt_at is not null;
create index if not exists wa_recipients_awb_sent_idx
  on wa_campaign_recipients (awb, sent_at)
  where status = 'sent' and awb <> '';
create index if not exists wa_recipients_campaign_idx on wa_campaign_recipients (campaign_id, seq);
create index if not exists wa_campaigns_created_idx on wa_campaigns (created_at desc);

-- Lease worker: satu baris, satu pemegang.
create table if not exists wa_worker_lease (
  id      int primary key default 1 check (id = 1),
  holder  text,
  until   timestamptz not null default 'epoch'
);
insert into wa_worker_lease (id) values (1) on conflict do nothing;

alter table wa_campaigns enable row level security;
alter table wa_campaign_recipients enable row level security;
alter table wa_worker_lease enable row level security;

drop policy if exists wa_campaigns_read on wa_campaigns;
create policy wa_campaigns_read on wa_campaigns for select using (has_perm('receipt.view'));
drop policy if exists wa_recipients_read on wa_campaign_recipients;
create policy wa_recipients_read on wa_campaign_recipients for select using (has_perm('receipt.view'));
-- Tulis hanya lewat server (service role). Lease tidak terbaca siapa pun.

-- ---- Lease ----
create or replace function acquire_wa_lease(p_holder text, p_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  update wa_worker_lease
     set holder = p_holder, until = now() + make_interval(secs => p_seconds)
   where id = 1 and (until < now() or holder = p_holder)
  returning true into ok;
  return coalesce(ok, false);
end $$;

create or replace function release_wa_lease(p_holder text)
returns void language sql security definer set search_path = public as $$
  -- 'epoch', bukan now(): di transaksi yang sama now() bernilai identik dan
  -- acquire (until < now()) tidak akan pernah melihat lease ini lepas.
  update wa_worker_lease set until = 'epoch' where id = 1 and holder = p_holder;
$$;

-- ---- Anggaran rate: berapa request boleh dilepas sekarang ----
create or replace function wa_rate_budget(p_per_minute int)
returns int language sql stable security definer set search_path = public as $$
  select greatest(0, p_per_minute - count(*)::int)
    from wa_campaign_recipients
   where last_attempt_at > now() - interval '60 seconds';
$$;

-- ---- Ambil N baris antrean (FIFO lintas kampanye) ----
create or replace function claim_wa_recipients(p_limit int)
returns setof wa_campaign_recipients
language plpgsql security definer set search_path = public as $$
begin
  -- Baris yang tertahan 'sending' > 2 menit: worker sebelumnya mati di
  -- tengah kiriman. Pesannya MUNGKIN sudah terkirim — jadi 'unknown',
  -- TIDAK dikirim ulang otomatis. Mengirim dua kali lebih buruk daripada
  -- meminta manusia menekan "Coba lagi".
  update wa_campaign_recipients
     set status = 'unknown', last_error = 'worker_interrupted'
   where status = 'sending' and last_attempt_at < now() - interval '2 minutes';

  return query
  update wa_campaign_recipients r
     set status = 'sending', attempts = r.attempts + 1, last_attempt_at = now()
   where r.id in (
     select x.id
       from wa_campaign_recipients x
       join wa_campaigns c on c.id = x.campaign_id
      where x.status = 'queued'
        and c.status = 'sending'
        and coalesce(x.next_attempt_at, '-infinity') <= now()
      order by c.started_at, x.seq
      limit p_limit
      for update of x skip locked)
  returning r.*;
end $$;

-- ---- Tutup kampanye yang antreannya sudah habis ----
create or replace function finalize_wa_campaigns()
returns void language sql security definer set search_path = public as $$
  update wa_campaigns c
     set status = case
                    when s.sent = 0 and s.bad > 0 then 'failed'
                    when s.bad > 0 then 'partial'
                    else 'done'
                  end,
         finished_at = now()
    from (
      select campaign_id,
             count(*) filter (where status = 'sent') as sent,
             count(*) filter (where status in ('failed','unknown')) as bad,
             count(*) filter (where status in ('queued','sending')) as open
        from wa_campaign_recipients
       where campaign_id in (select id from wa_campaigns where status = 'sending')
       group by campaign_id
    ) s
   where s.campaign_id = c.id and c.status = 'sending' and s.open = 0;
$$;

revoke all on function acquire_wa_lease(text,int), release_wa_lease(text), wa_rate_budget(int),
  claim_wa_recipients(int), finalize_wa_campaigns() from public, anon, authenticated;

-- Token untuk pg_cron (pola clock-reminders).
insert into cron_secrets (name, token)
select 'wa-blast-worker', encode(extensions.gen_random_bytes(32), 'hex')
 where not exists (select 1 from cron_secrets where name = 'wa-blast-worker');

-- ---- Status pengiriman (diuji live 27 Okt 2026) ----
-- 201 dari /broadcasts/whatsapp/direct hanya berarti Qontak MENERIMA
-- permintaan (execute_status 'todo'). Apakah pesannya benar-benar sampai —
-- delivered / read / failed (mis. nomor tidak terdaftar WhatsApp) — baru
-- terlihat di GET /broadcasts/{id}/whatsapp/log beberapa detik kemudian.
-- "Terkirim ke Qontak" dan "diterima pelanggan" adalah dua hal berbeda.
alter table wa_campaign_recipients
  add column if not exists delivery_status text,
  add column if not exists delivery_error text,
  add column if not exists delivery_checked_at timestamptz;
create index if not exists wa_recipients_delivery_idx
  on wa_campaign_recipients (sent_at)
  where status = 'sent' and (delivery_status is null or delivery_status in ('todo','pending','sent'));
