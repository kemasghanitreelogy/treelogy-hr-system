-- Jalur BULK Qontak: satu contact list + SATU broadcast per kampanye (bukan
-- satu broadcast per penerima seperti jalur direct). Lihat lib/qontak/bulk.ts.
--
-- Selama contact list diimpor Qontak, penerima tetap 'queued' tetapi ditandai
-- bulk_list_id — mereka belum dikirimi apa pun. Baru tepat sebelum POST
-- broadcast mereka menjadi 'sending'; bila worker mati di tengahnya, aturan
-- 2 menit di claim_wa_recipients menjadikannya 'unknown' (mungkin terkirim),
-- bukan dikirim ulang otomatis.
alter table wa_campaign_recipients add column if not exists bulk_list_id text;
alter table wa_campaigns add column if not exists bulk_list_id text;

-- Worker direct TIDAK boleh menyentuh antrean kampanye bulk.
create or replace function claim_wa_recipients(p_limit int)
returns setof wa_campaign_recipients
language plpgsql security definer set search_path = public as $$
begin
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
        and c.engine = 'direct'
        and coalesce(x.next_attempt_at, '-infinity') <= now()
      order by c.started_at, x.seq
      limit p_limit
      for update of x skip locked)
  returning r.*;
end $$;

revoke all on function claim_wa_recipients(int) from public, anon, authenticated;
