# Workflow — Blast WhatsApp via Qontak

> `/sc:workflow --strategy systematic --depth deep` · 27 Oktober 2026
> Status: **RENCANA** — belum ada kode yang ditulis. Eksekusi lewat `/sc:implement`.

---

## 0. Tujuan dalam satu kalimat

Menghapus rutinitas harian "ekspor Excel dari Receipt Sales → upload CSV ke Qontak → pilih template → blast"
menjadi **baca label → klik "Blast WA" → lihat preview → OK → terkirim**, plus satu halaman umum
untuk template lain.

## 1. Fakta yang sudah diverifikasi (bukan asumsi)

| # | Fakta | Sumber |
|---|---|---|
| F1 | Auth = **Mekari HMAC**: `Authorization: hmac username="<CLIENT_ID>", algorithm="hmac-sha256", headers="date request-line", signature=base64(HMAC_SHA256(secret, "date: <RFC7231>\n<METHOD> <path+query> HTTP/1.1"))` + header `Date`. Query string WAJIB ikut ditandatangani (changelog Mekari Des 2023). | developers.mekari.com + SDK `mekari-engineering/qontak-api-js` + uji live |
| F2 | Base URL `https://api.mekari.com/qontak/chat/v1`. `CLIENT_ID_QONTAK` / `CLIENT_SECRET_QONTAK` di `.env.local` **berfungsi** (GET 200). | uji live read-only |
| F3 | 23 template, semua APPROVED. 1 channel aktif: `wa_cloud` `6747c227-…` (+62 811-3960-3993). | uji live |
| F4 | **Direct** `POST /broadcasts/whatsapp/direct` = 1 request per nomor, **60 req/menit** (dokumen resmi; SDK menyebut 100 — yang resmi dipakai). | `Qontak-API-v1.0.3.yaml` baris 570 |
| F5 | **Bulk** `POST /broadcasts/whatsapp` (`contact_list_id`, `parameters.body[{key:"1", value:"<nama kolom>"}]`) = 1 request untuk ribuan nomor. Dokumen resmi MENYARANKAN bulk untuk blast. | yaml baris 571, skema `postV1BroadcastsWhatsapp` |
| F6 | Kontak list `POST /contacts/contact_lists/async` (multipart, `source_type=spreadsheet`). Dengan kredensial sekarang: **`MAG-008: Current scope is not allowed`** → bulk BELUM bisa sampai scope `qontak-chat:all` diaktifkan di Mekari Developer Center. | uji live GET contact_lists |
| F7 | **Urutan variabel beda per template**: `blast_resi_lion` → `{{1}}`=resi, `{{2}}`=nama; `blast_resi_jnt`/`blast_resi_jne` → `{{1}}`=nama, `{{2}}`=resi. Tanpa tombol, tanpa header. | uji live template + 15 broadcast terakhir |
| F8 | Tim blast resi **setiap hari** manual (Lion hampir tiap hari, JNT sesekali), nama kolom berganti-ganti ("resi" / "No. Resi"). | `GET /broadcasts/whatsapp` |
| F9 | Respons GET tidak membawa header `X-RateLimit-*` → limiter harus **proaktif** (token bucket), bukan reaktif. | uji live |
| F10 | Vercel function maks 300 dtk; tsc lokal macet karena iCloud → gerbang typecheck = build Vercel. | memori proyek |

**Konsekuensi jujur ke pengguna:** paralelisme TIDAK bisa menembus 60/menit di jalur direct — batasnya per akun.
1.000 nomor via direct ≈ 17–18 menit. Kecepatan sebenarnya datang dari **bulk** (F5), jadi desainnya hybrid.

## 2. Keputusan desain (sudah disetujui)

- **Penerima: otomatis**, bukan upload manual. Sumber utama = hasil Receipt Sales (nama + HP + AWB + kurir
  sudah ada di memori browser). Upload CSV/XLSX tetap ada sebagai jalur cadangan untuk template non-resi.
- **Mesin: Hybrid.** Bulk bila scope contact list aktif (deteksi otomatis); kalau tidak, direct lewat
  **antrean server** 55/menit yang tetap jalan walau tab ditutup.

## 3. Arsitektur

```
Receipt Sales ──"Blast WA"──┐                ┌──────────────── Supabase ────────────────┐
                            ├─► POST /api/wa-blast/campaigns ─►│ wa_campaigns (draft)              │
/wa-blast (CSV/XLSX/paste) ─┘    (validasi, normalisasi HP,    │ wa_campaign_recipients (queued)   │
                                  dedupe, render preview)      └───────────────────────────────────┘
                                         │
              /wa-blast/[id]  ◄──────────┘  PREVIEW (bubble WA per penerima) → ConfirmDialog
                                         │
                       POST /api/wa-blast/campaigns/[id]/send
                         │ capability = bulk?            │ tidak
                         ▼                               ▼
          CSV → contact_lists/async → poll     status=sending → after(): kick worker
          → POST /broadcasts/whatsapp (1x)      /api/wa-blast/worker (≤50 dtk/panggilan)
                                                  ├ advisory lock (1 worker global)
                                                  ├ claim N baris FOR UPDATE SKIP LOCKED
                                                  ├ token bucket 55/mnt, ≤5 in-flight
                                                  └ pg_cron tiap menit menguras sisa antrean
                         │                               │
                         └──────► UI polling 2 dtk ◄─────┘  (progres, per-baris centang, gagal + alasan)
```

### 3.1 Kenapa antrean di server, bukan loop di browser

Loop di browser (pola fulfill Receipt Sales) bergantung pada tab tetap terbuka selama ±17 menit, dan
dua orang yang blast bersamaan akan sama-sama menghabiskan kuota 60/menit lalu saling memicu 429.
Antrean di DB + **satu worker global** (advisory lock) membuat limiter berlaku untuk seluruh akun,
tahan tab ditutup, dan tahan function timeout (worker berhenti di 50 dtk, pg_cron melanjutkan).

### 3.2 Jalur bulk (begitu scope aktif)

1. Server membuat CSV `phone_number,full_name,<kolom variabel…>` dari baris penerima.
2. `POST /contacts/contact_lists/async` (multipart) → poll sampai list siap.
3. `POST /broadcasts/whatsapp` dengan `parameters.body = [{key:"1", value:"resi"}, …]`.
4. Status dibaca dari `GET /broadcasts/{id}/whatsapp/log`.
> ⚠️ Format kolom CSV spreadsheet Qontak **belum terverifikasi** (dokumen tidak mencantumkannya) —
> wajib diuji dengan list berisi nomor sendiri sebelum dipakai (lihat Fase 6).

## 4. Model data — migrasi `0087_wa_blast.sql`

```sql
wa_campaigns (
  id uuid pk, name text, source text check (source in ('receipt','upload')),
  template_id text, template_name text, language text, channel_integration_id text,
  param_map jsonb,          -- {"1":"awb","2":"name"}  ← per template (F7)
  engine text check (engine in ('bulk','direct')),
  status text check (status in ('draft','sending','done','partial','failed','cancelled')),
  total int, sent int, failed int, skipped int,
  qontak_broadcast_id text, qontak_contact_list_id text,
  created_by uuid → employees, created_at, started_at, finished_at
)
wa_campaign_recipients (
  id uuid pk, campaign_id uuid fk on delete cascade,
  phone text,               -- E.164 tanpa '+': 62812…
  name text, params jsonb,  -- {"1":"JD0123…","2":"Siti"}
  awb text null,
  status text check (status in ('queued','sending','sent','failed','skipped','unknown')),
  attempts int default 0, next_attempt_at timestamptz, last_error text,
  qontak_ref text, sent_at timestamptz,
  unique (campaign_id, phone, coalesce(awb,''))
)
index on wa_campaign_recipients (status, next_attempt_at) where status in ('queued','sending')
```

- **RPC** `claim_wa_recipients(n int)` — `UPDATE … SET status='sending', attempts=attempts+1 WHERE id IN
  (SELECT … WHERE status='queued' AND coalesce(next_attempt_at, now()) <= now() ORDER BY created_at
  LIMIT n FOR UPDATE SKIP LOCKED) RETURNING *`.
- **Anti blast ganda**: sebelum masuk antrean, AWB yang sudah `sent` dalam 14 hari → `skipped`
  ("resi ini sudah dikirimi pada …"). Melindungi dari klik dua kali dan batch yang dibaca ulang.
- **RLS**: baca/tulis hanya pemegang `wa.blast`; worker memakai service role.
- **Retensi PII**: cron `cleanup-storage` menghapus baris penerima > 30 hari (kampanye & angka tetap).
- **Izin** baru `wa.blast` — default ke role-admin, role-ops, role-receipt, role-manager-receipt
  (mengikuti pola `receipt.fulfill`, migrasi 0076). **Konfirmasi daftar peran sebelum migrasi.**

## 5. Modul kode

| Berkas | Isi |
|---|---|
| `src/lib/qontak/client.ts` | `qontakFetch(method, path, {query, json, form})`: tanda tangan HMAC (F1, query ikut), timeout 15 dtk, error bertipe `QontakError{status, code, retryAfterMs}`; MAG-008 → `scope_missing`. Server-only. |
| `src/lib/qontak/templates.ts` | `listTemplates()` (cache 5 mnt, hanya APPROVED), `parseVariables(tpl)` → slot body/header/tombol, `guessSlotMeaning()` dari teks di sekitarnya (`Halo Kak {{n}}`→`name`, `resi: {{n}}`→`awb`), `renderPreview(tpl, params)`. |
| `src/lib/qontak/phone.ts` | normalisasi `08…`/`+62…`/`62…`/`8…` → `62…`, validasi panjang 10–15 digit; tolak yang tidak valid **dengan alasan**. Pakai ulang `formatPhoneId` bila cocok. |
| `src/lib/qontak/limiter.ts` | token bucket 55/menit (margin 5 dari F4) + semafor ≤5 in-flight; 429 → jeda sesuai `Retry-After`/reset, baris dikembalikan ke `queued` + `next_attempt_at`. |
| `src/lib/qontak/engine.ts` | `detectCapability()` (cache 10 mnt: bulk ⇔ contact_lists tidak MAG-008), `sendBulk(campaign)`, `drainDirect(deadlineMs)`. |
| `src/app/api/wa-blast/templates/route.ts` | GET daftar template + slot + makna tebakan + channel. |
| `src/app/api/wa-blast/campaigns/route.ts` | POST buat draft (validasi, normalisasi, dedupe, anti-ganda) · GET riwayat. |
| `src/app/api/wa-blast/campaigns/[id]/route.ts` | GET detail + progres (dipoll UI) · DELETE batalkan (baris `queued` → `skipped`). |
| `src/app/api/wa-blast/campaigns/[id]/send/route.ts` | Konfirmasi → pilih engine → bulk langsung / direct: set `sending` + `after(() => drainDirect())`. Idempoten (kirim ulang draft yang sudah `sending` = no-op). |
| `src/app/api/wa-blast/campaigns/[id]/retry/route.ts` | Baris `failed`/`unknown` → `queued` (keputusan manusia, bukan otomatis). |
| `src/app/api/cron/wa-blast-worker/route.ts` | Dipanggil pg_cron tiap menit (token `cron_secrets`, pola clock-reminders) → `drainDirect(50_000)`. |

### 5.1 Aturan kegagalan (worker)

| Respons | Tindakan |
|---|---|
| 201 | `sent`, simpan ref |
| 429 | kembali `queued`, `next_attempt_at = now + reset`, bucket dikosongkan |
| 5xx / timeout / jaringan | maks 3 percobaan, backoff 15s → 60s → 180s, lalu `failed` |
| 422 | `failed` permanen + pesan Qontak apa adanya (nomor tak terdaftar WA, parameter kurang) |
| 401 / MAG-xxx | hentikan kampanye → `failed`, notifikasi "kredensial/scope" |
| Worker mati saat `sending` > 2 mnt | `unknown` — **TIDAK dikirim ulang otomatis** (bisa jadi pesan sudah terkirim; kirim dua kali lebih buruk daripada meminta manusia menekan "Coba lagi") |

## 6. Alur & UX (ui-ux-pro-max + kelas motion `hf-*` yang sudah ada)

### 6.1 Dari Receipt Sales (jalur utama, 3 ketukan)

1. Toolbar hasil: tombol **"Blast WA resi (N)"** di samping "Tandai terkirim di Shopify".
   Hanya baris dengan HP valid + AWB pasti (barcode/PDF atau "sudah diperiksa") — aturan yang sama
   dengan fulfill. Baris lain disebut angkanya ("12 tanpa nomor HP — tidak ikut"), tidak disembunyikan.
2. Template dipilih **otomatis per kurir** (J&T→`blast_resi_jnt`, Lion→`blast_resi_lion`,
   JNE→`blast_resi_jne`); campuran kurir → satu kampanye per kurir, satu layar konfirmasi.
   Pemetaan `{{n}}` diambil dari makna slot (F7), jadi urutan Lion vs JNT tidak pernah tertukar.
3. Sheet preview → **OK** → progres live di sheet yang sama; boleh ditutup, antrean jalan terus.

### 6.2 Halaman `/wa-blast` (jalur umum)

Wizard 3 langkah, mobile-first:

1. **Template** — grid kartu: nama manusiawi, badge kategori (MARKETING/UTILITY), mini bubble WA,
   jumlah variabel. Pencarian. Template berheader gambar/dokumen menampilkan kolom URL media.
2. **Penerima** — tempel dari spreadsheet / unggah CSV/XLSX (`prepareUpload()`); kolom dicocokkan
   otomatis ke slot (nama, HP, resi…) dan bisa diganti lewat chip; baris tidak valid dikelompokkan
   dengan alasan (nomor kurang digit, variabel kosong, duplikat).
3. **Preview** — mockup ponsel WhatsApp (bubble hijau, jam, centang) dengan pesan ter-render untuk
   penerima terpilih; panah ‹ › / geser untuk memeriksa satu per satu; daftar penerima tervirtualisasi
   dengan pencarian. Ringkasan: jumlah, engine, **ETA jujur** ("± 4 menit — 230 pesan @ 55/menit" atau
   "beberapa detik — bulk").

**Konfirmasi** — `ConfirmDialog` menyebut angka pasti: "Kirim 230 pesan WhatsApp dari +62 811-3960-3993
memakai template blast_resi_lion?". Tombol utama berlabel tindakan ("Kirim 230 pesan"), bukan "OK".

**Progres** — `hf-progress-fill` + hitungan terkirim/gagal/antre, baris menetes dengan `hf-check-draw`,
sheen `hf-checking` pada baris yang sedang dikirim; selesai → `hf-done-panel` + `hf-done-ring`.
Gagal dikelompokkan per alasan + tombol "Coba lagi yang gagal". Semua mutasi → `useToast()`.

**Riwayat** — daftar kampanye (tanggal, template, sumber, terkirim/gagal, siapa) di `/wa-blast`.

### 6.3 Aksesibilitas & performa

- Kontras AA, target sentuh ≥44px, `prefers-reduced-motion` mematikan sheen/draw.
- Daftar penerima > 200 baris → virtualisasi; preview dirender di klien dari template yang sama
  dengan yang dipakai server (satu fungsi `renderPreview`, dipakai dua sisi).
- Overlay/sheet: portal ke body + `lockBodyScroll()` (gotcha `.fade-up`).

## 7. Fase eksekusi & dependensi

| Fase | Isi | Bergantung | Gerbang lolos |
|---|---|---|---|
| **1. Fondasi Qontak** | `client.ts`, `phone.ts`, `templates.ts` + `scripts/qa-qontak-core.mts` | — | Vektor HMAC dari contoh dokumen Mekari cocok; parse Lion/JNT/JNE memetakan nama↔resi dengan benar; normalisasi HP 12 kasus |
| **2. Data** | migrasi 0087, RPC claim, izin `wa.blast`, RLS | 1 | Migrasi jalan di Supabase; RLS diuji dengan akun tanpa izin |
| **3. Engine direct** | `limiter.ts`, `engine.drainDirect`, worker route, pg_cron job | 1,2 | `scripts/qa-qontak-limiter.mts` (fetch di-stub): 300 penerima ≤55/menit, 429 dihormati, crash → `unknown`, tidak ada kiriman ganda |
| **4. API kampanye** | create / detail / send / retry / cancel | 2,3 | Draft→send idempoten; anti-ganda AWB; batas 5.000/kampanye |
| **5. UI** | `/wa-blast` wizard + preview + progres + riwayat; tombol & sheet di Receipt Sales; nav + izin | 4 | Build Vercel hijau; uji Playwright alur penuh dengan fetch Qontak di-mock |
| **6. Uji live** | **1 pesan** ke nomor Anda sendiri via direct (butuh izin eksplisit); bila scope bulk aktif: list 1 nomor via bulk untuk memastikan format CSV | 5 | Pesan diterima & ter-render benar; status di riwayat = sent |
| **7. Bulk** | `sendBulk` + deteksi capability, diaktifkan setelah scope `qontak-chat:all` ada | 6 + aksi Anda di Mekari | Kampanye 2–3 nomor internal lewat bulk sukses |
| **8. Penutup** | memori proyek, catatan di `claudedocs`, commit per-path (JANGAN `git add -A` — ada PDF pelanggan & yaml di root) | semua | — |

Fase 1–4 bisa dibangun tanpa menyentuh Qontak sungguhan (semua di-stub). **Tidak ada pesan nyata
yang terkirim sebelum Fase 6, dan Fase 6 menunggu izin Anda.**

## 8. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Pesan terkirim ganda (retry, klik dua kali, batch dibaca ulang) | unique (campaign, phone, awb) · anti-ganda AWB 14 hari · `unknown` tidak diulang otomatis · endpoint send idempoten |
| Salah variabel (nama ↔ resi tertukar) | pemetaan per template dari makna slot; preview WAJIB sebelum kirim; uji QA khusus Lion vs JNT |
| 429 / kuota habis saat dua orang blast | satu worker global + bucket 55/menit; antrean FIFO lintas kampanye |
| Blast marketing kena kualitas akun WA (Meta) | tampilkan kategori template; peringatan bila MARKETING > 1.000 penerima |
| Kredensial bocor | hanya server; tidak pernah di respons/log; `wa.blast` + RLS |
| PII pelanggan menumpuk | hapus baris penerima > 30 hari |
| Format CSV bulk tidak sesuai | Fase 6 uji dengan nomor sendiri sebelum bulk dinyalakan |
| `Qontak-API-v1.0.3.yaml` di root ikut ter-commit | tambahkan ke `.gitignore` / commit per-path |

## 9. Yang dibutuhkan dari Anda

1. **(Opsional, untuk kecepatan)** Aktifkan scope `qontak-chat:all` untuk aplikasi HMAC ini di
   Mekari Developer Center → membuka jalur bulk. Tanpa ini semuanya tetap jalan lewat direct 55/menit.
2. Konfirmasi peran yang boleh blast (`wa.blast`): admin, ops, tim receipt?
3. Nomor WhatsApp Anda sendiri untuk uji live 1 pesan di Fase 6.
4. Env `CLIENT_ID_QONTAK` / `CLIENT_SECRET_QONTAK` dipasang di Vercel production (Sensitive).

**Langkah berikutnya:** `/sc:implement claudedocs/workflow_qontak_wa_blast.md` — mulai Fase 1.
