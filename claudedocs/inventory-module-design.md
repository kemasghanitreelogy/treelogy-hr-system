# Modul Inventaris Kantor — Design Spec

Status: implemented (migration `0043_inventory.sql`)
Scope: CRUD inventaris kantor + QR code unik per barang, terintegrasi RBAC & motion system.

---

## 1. Domain model

Satu tabel: `inventory_items`. Tidak ada ledger pergerakan (di luar scope) — pemegang
barang direpresentasikan lewat kolom `assigned_to` + `status`.

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid PK | identitas internal |
| `code` | text UNIQUE | **kunci QR**, dibuat DB: `INV-0001`, `INV-0002`, … |
| `name` | text | nama barang |
| `category` | enum | elektronik · furnitur · atk · kendaraan · mesin · perlengkapan · lainnya |
| `brand`, `serial_no` | text | merk / nomor seri pabrikan |
| `quantity`, `unit` | int, text | jumlah + satuan (unit/pcs/box/set/rim) |
| `condition` | enum | baik · perlu_servis · rusak · hilang |
| `status` | enum | tersedia · dipakai · perawatan · pensiun |
| `location` | text | ruang/lokasi fisik |
| `assigned_to` | uuid → employees | penanggung jawab (nullable, `on delete set null`) |
| `purchase_date`, `purchase_price` | date, numeric | data aset |
| `photo_path` | text | objek di bucket privat `inventory-photos` |
| `note` | text | catatan bebas |
| `created_at`, `updated_at` | timestamptz | `updated_at` di-touch trigger |

### Keunikan kode (syarat "pastikan unique")
Tiga lapis, bukan satu:
1. `create sequence inventory_code_seq` + default `inventory_next_code()` → tidak ada
   race antar user; nomor tidak pernah dipakai ulang.
2. `unique` constraint di kolom `code` → benteng terakhir di DB.
3. Payload QR = URL absolut yang memuat `code` → satu barang = satu URL = satu QR.

## 2. RBAC

Modul permission baru `inventory`:
- `inventory.view` — lihat daftar & detail (Admin, HR, Manager, Karyawan)
- `inventory.manage` — tambah/edit/hapus + cetak label (Admin, HR)

Nav `/inventory` di-gate `inventory.view`; ditaruh setelah `/holidays` (frekuensi
pemakaian rendah–menengah, sesuai urutan Hick's Law yang sudah dipakai `nav-items.ts`).

RLS `inventory_items`:
- `select` → `has_perm('inventory.view') or has_perm('inventory.manage') or is_hr()`
- `insert/update/delete` → `has_perm('inventory.manage') or is_hr()`

Bucket `inventory-photos` (privat): tulis butuh `inventory.manage`/HR, baca cukup
authenticated; disajikan lewat signed URL 60 detik dari `/api/inventory/photo`.

## 3. QR engine — nayuki/QR-Code-generator

Sumber di-*vendor* verbatim ke `src/lib/qr/qrcodegen.ts` dari
`nayuki/QR-Code-generator@master:typescript-javascript/qrcodegen.ts` (MIT).
Satu-satunya perubahan: `namespace` → `export namespace` (3 baris) supaya bisa
di-`import` sebagai ES module. Alasan vendor, bukan npm: engine ter-pin, auditable,
nol dependency runtime, dan tree-shake-able.

Wrapper `src/lib/qr/index.ts`:
- `qrMatrix(text, ecc)` → matriks boolean (sekali hitung, dipakai semua renderer)
- `qrSvgPath(text, opts)` → satu `<path d>` (bukan ribuan `<rect>`) → DOM ringan
- `qrSvgMarkup()` → SVG standalone untuk unduh/cetak
- `qrPngDataUrl()` → render canvas untuk unduh PNG
- `itemQrPayload(origin, code)` → `https://host/inventory?item=INV-0001`

ECC level **QUARTILE (25%)** — label ditempel di barang yang tergores/berdebu, jadi
toleransi error dinaikkan dari default MEDIUM. Quiet zone 4 modul untuk cetak,
2 untuk pratinjau layar.

Alur pakai:
- **Scan** kamera HP → buka `/inventory?item=INV-0001` → sheet detail langsung terbuka.
- **Dalam app** → tombol Scan pakai `BarcodeDetector` bila tersedia; kalau tidak,
  fallback ke input kode manual (bukan blank state).
- **Cetak** → jsPDF (sudah jadi dependency untuk slip gaji) membuat lembar label
  A4 3×8, QR digambar sebagai vektor `rect` → tajam di berapa pun DPI.

## 4. Motion / transition system

Prinsip yang dipakai (dipinjam dari motion doctrine HyperFrames, diadaptasi ke DOM
web — HyperFrames sendiri adalah renderer video, bukan runtime UI):
- hanya `transform` + `opacity` (tidak pernah width/height/top/left)
- semua animasi **finite & deterministik** (tanpa loop tak berujung)
- stagger satu grup dibatasi ≤ 0.5 s total supaya kedatangan terbaca satu ketukan
- durasi micro-interaction 150–300 ms
- `prefers-reduced-motion` sudah dimatikan global di `globals.css`

Keyframes baru (`globals.css`, prefix `inv-`):

| Utility | Dipakai untuk |
|---|---|
| `.stagger-item` + `--i` | kedatangan kartu/baris (delay = i × 40 ms, di-cap 8 item) |
| `.animate-qr-in` | QR muncul: scale + rotate ringan lalu settle |
| `.animate-qr-scan` | garis sweep sekali jalan di atas QR (afirmasi "ini bisa dipindai") |
| `.animate-flip-in` | pergantian state kartu detail |
| `.animate-row-out` | baris menghilang saat dihapus (collapse + fade) |
| `.animate-count-up` | angka statistik naik saat filter berubah |
| `.animate-pulse-ring` | ring pada tombol scan saat kamera aktif |

## 5. File map

```
supabase/migrations/0043_inventory.sql   schema + RLS + permissions + bucket
src/lib/qr/qrcodegen.ts                  vendored nayuki (MIT)
src/lib/qr/index.ts                      wrapper: matrix → SVG/PNG/payload
src/lib/inventory.ts                     enum labels, tone map, format helper
src/lib/types.ts                         InventoryItem + enums
src/lib/seed.ts                          demo dataset (mode tanpa Supabase)
src/lib/data.ts                          mapInventoryItem + getInventoryItems
src/lib/rbac.ts                          permission group `inventory`
src/app/api/inventory/route.ts           POST / PATCH / DELETE
src/app/api/inventory/photo/route.ts     signed URL foto
src/app/(dashboard)/inventory/page.tsx   server page (+ loading.tsx)
src/components/inventory/*               view, form, detail, QR panel, scanner, labels PDF
src/components/layout/nav-items.ts       menu entry
```

## 6. Keputusan yang sengaja diambil

- **Tanpa tabel mutasi/peminjaman.** Permintaan = "CRUD + QR". Riwayat pergerakan
  adalah modul tersendiri; `assigned_to` + `status` sudah menjawab "siapa pegang".
- **Kode dibuat DB, bukan client.** Client tidak pernah menebak kode → tidak ada
  peluang duplikat walau dua HR menambah barang bersamaan.
- **QR di-render on-the-fly, tidak disimpan.** Kode unik sudah persisten; menyimpan
  gambar QR hanya menambah storage & risiko basi.
