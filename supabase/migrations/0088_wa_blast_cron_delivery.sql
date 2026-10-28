-- Worker blast WA dibangunkan selama masih ada pesan yang laporan WhatsApp-nya
-- belum FINAL (delivered/read/failed) dalam 48 jam — status antara apa pun dari
-- Qontak (todo, pending, sent, processing, …), bukan daftar tetap. Selaras
-- dengan lib/qontak/delivery.ts: status di layar tidak boleh membeku di
-- "diterima Qontak" hanya karena Qontak memakai nama status yang tidak dikenal.
select cron.schedule(
  'wa-blast-worker',
  '* * * * *',
  $$
  select net.http_get(
    url := 'https://treelogy-hr-system.vercel.app/api/cron/wa-blast-worker',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select token from public.cron_secrets where name = 'wa-blast-worker')),
    timeout_milliseconds := 60000
  )
  where exists (
    select 1 from public.wa_campaign_recipients r
      join public.wa_campaigns c on c.id = r.campaign_id
     where (r.status = 'queued' and c.status = 'sending')
        or r.status = 'sending'
        or (r.status = 'sent' and r.sent_at > now() - interval '48 hours'
            and (r.delivery_status is null or r.delivery_status not in ('delivered','read','failed')))
  );
  $$
);
