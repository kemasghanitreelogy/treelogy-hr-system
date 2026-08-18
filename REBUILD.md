# Rebuild Guide — Resi → Kurir · AWB · No. HP

Panduan **end-to-end** untuk membangun ulang aplikasi ini dari nol di project baru.
Dokumen ini berisi: arsitektur, urutan langkah, **seluruh source code**, penjelasan
"kenapa begini", tuning knobs, gotchas, dan checklist verifikasi.

Target akhir: sebuah Next.js App Router app yang bisa —

1. Menerima **PDF multi-halaman atau foto** label pengiriman (J&T / Lion Parcel).
2. Membaca **AWB (nomor resi) dari barcode** — eksak, bukan hasil OCR.
3. Membaca teks label dengan **OCR di browser** (Tesseract, `ind+eng`) dan mem-parse field.
4. Mencocokkan penerima ke **order Shopify** untuk menarik **nomor HP + nama + alamat bersih**.
5. Menampilkan panel review (kartu per halaman, editable) + export **CSV / JSON**.
6. Opsional: **push AWB + kurir ke Jubelio** (ERP) dengan pencocokan eksak `ref_no`.

Prinsip desain yang wajib dipertahankan saat rebuild:

- **Semua yang berat jalan di browser.** File PDF/foto tidak pernah di-upload. Server hanya
  menerima potongan teks kecil (nama, kodepos, 4 digit HP) → app muat di free serverless tier,
  tanpa limit ukuran upload dan tanpa risiko timeout.
- **Digit-first matching.** OCR membaca angka jauh lebih andal daripada nama. Jadi kunci
  pencocokan adalah angka (4 digit terakhir HP, kodepos); nama hanya jadi *anchor*.
- **Jangan pernah menebak dengan percaya diri.** Kalau bukti tidak cukup, tandai
  `Manual / WA` dan kosongkan HP — lebih baik kosong daripada salah orang.

---

## 1. Arsitektur & alur data

```
                         ┌──────────────────────── BROWSER (client) ────────────────────────┐
  PDF / foto  ──────────▶│                                                                  │
                         │  pdf.js  ──render 400dpi──▶ <canvas>                             │
                         │                               │                                  │
                         │                 ┌─────────────┴──────────────┐                   │
                         │                 ▼                            ▼                   │
                         │        zxing-wasm (barcode)        tesseract.js (ind+eng)         │
                         │        Code128 / Code39            raw OCR text                   │
                         │                 │                            │                    │
                         │           AWB eksak                localExtract.parseLabelFields   │
                         │                 │                            │                    │
                         │                 └────────► labelCore.reconcile() ◄─────────────┐   │
                         │                                   │                            │   │
                         │                          LabelRecord[] (per halaman)            │   │
                         └───────────────────────────────────┼────────────────────────────┘   │
                                                             │                                 │
                    POST /api/match  { name, zip, phoneLast4, shipDate }  (payload kecil)      │
                                                             ▼                                 │
                         ┌──────────────────────── SERVER (Vercel Function) ─────────────┐    │
                         │  shopify.matchAll()                                            │    │
                         │   1. fetchPool()  → Admin GraphQL 2026-07, orders window       │    │
                         │   2. matchAgainstPool() → skor phone-4 / kodepos / nama        │    │
                         │   3. confidence: certain | low  (+ reasons)                    │    │
                         └───────────────────────────────┬───────────────────────────────┘    │
                                                         │  { phone, name, address, orderName, legacyId }
                                                         └─────────────────────────────────────┘
                                                             │
                                            merge ke record (hanya kalau "certain")
                                                             │
                                    ReviewPanel (edit + verify + export CSV/JSON)
                                                             │
                                    JubelioPanel → POST /api/jubelio (preview → push)
                                                             ▼
                                         Jubelio: cari order by ref_no == legacyId,
                                         lalu POST /sales/orders/save-airwaybill/
```

Kenapa `legacyResourceId` dibawa-bawa? Karena order Jubelio yang tersinkron dari Shopify
menyimpan **`ref_no` == numeric order id Shopify** (`legacyResourceId`). Itu yang membuat
pencocokan Shopify→Jubelio bisa **eksak**, bukan fuzzy.

---

## 2. Prasyarat

| Item | Keterangan |
|---|---|
| Node.js | 20 LTS atau lebih baru (24 LTS = default Vercel sekarang) |
| Shopify custom app | Admin API access token (`shpat_…`) dengan scope **`read_orders`** |
| Protected customer data | Di Shopify Partner/Admin, akses `shippingAddress.phone` & `.name` termasuk **protected customer data** — untuk custom app di admin biasanya sudah aktif, untuk public app harus di-request |
| API version | Kode ini pin ke **`2026-07`** (sudah divalidasi ke live schema) |
| Jubelio (opsional) | Email + password API Jubelio (`https://api2.jubelio.com/login`) |
| Hosting | Vercel (free tier cukup — server work-nya sangat ringan) |

Query Shopify yang dipakai (sudah lolos validasi schema `2026-07`, scope terdeteksi:
`read_orders`):

```graphql
query Pool($q: String!, $c: String) {
  orders(first: 100, after: $c, query: $q, sortKey: CREATED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        name
        legacyResourceId
        createdAt
        shippingAddress { name address1 city province zip phone }
      }
    }
  }
}
```

---

## 3. Langkah 1 — scaffold project

```bash
mkdir resi-app && cd resi-app
npm init -y
npm install next@^15.1.0 react@^19 react-dom@^19 pdfjs-dist@^6.1.200 tesseract.js@^7 zxing-wasm@^3.1.0
npm install -D typescript@^5.7 @types/node@^22 @types/react@^19 @types/react-dom@^19
mkdir -p app/lib app/components app/api/match app/api/jubelio public
```

Versi yang terbukti jalan bersama (kunci ini kalau mau aman):
`next 15.5.x`, `react 19.2.x`, `pdfjs-dist 6.1.200`, `tesseract.js 7.0.0`, `zxing-wasm 3.1.0`.

### `package.json`

```json
{
  "name": "resi-app",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^15.1.0",
    "pdfjs-dist": "^6.1.200",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tesseract.js": "^7.0.0",
    "zxing-wasm": "^3.1.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.7.0"
  }
}
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`paths: {"@/*": ["./*"]}` **wajib** — route handler meng-import `@/app/lib/shopify`.

### `next.config.mjs`

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // OCR jalan di browser; satu-satunya server route (/api/match) cuma memanggil
  // Shopify API, jadi tidak perlu serverExternalPackages / webpack tweak apa pun.
};

export default nextConfig;
```

### `.gitignore` (bagian pentingnya)

```
/node_modules
/.next/
next-env.d.ts
.env
.env*.local
.vercel

# file kerja: PDF/foto label berisi PII pelanggan — JANGAN pernah di-commit
*.pdf
*.png
*.jpg
*.jpeg

# tesseract language data (di-download runtime)
*.traineddata
```

---

## 4. Langkah 2 — salin PDF.js worker ke `public/`

pdf.js butuh worker file yang di-host sendiri (biar tidak tergantung CDN eksternal):

```bash
cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs
```

> **Gotcha #1:** versi `pdf.worker.min.mjs` di `public/` **harus sama persis** dengan versi
> `pdfjs-dist` di `node_modules`. Kalau `npm update` menaikkan pdfjs-dist tapi file di `public/`
> tidak ikut diperbarui, pdf.js melempar *"The API version does not match the Worker version"*.
> Tambahkan ke `postinstall` kalau mau otomatis:
> `"postinstall": "cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/"`

---

## 5. Langkah 3 — environment variables

`.env.local` (jangan di-commit) / `.env.example` (boleh di-commit):

```bash
# Shopify Admin API — wajib untuk cross-check nomor HP
STORE_NAME=your-store.myshopify.com          # TANPA https://
ADMIN_API_KEY=shpat_xxxxxxxxxxxxxxxxxxxxxxxx  # scope read_orders

# Jubelio (opsional — hanya kalau pakai fitur push AWB)
JUBELIO_API_USERNAME=email@domain.com
JUBELIO_API_PASSWORD=xxxxxxxx

# Opsional gate akses — LIHAT Gotcha #2 sebelum mengisi ini
# APP_PASSWORD=
```

Di Vercel: `vercel env add STORE_NAME production` dst., atau lewat dashboard →
Settings → Environment Variables. Semua variabel ini **server-only** (tanpa prefix
`NEXT_PUBLIC_`), jadi tidak pernah bocor ke bundle browser.

---

## 6. Langkah 4 — file per file

Urutan penulisan mengikuti dependency (paling bawah dulu). Setiap file di bawah ini
**lengkap dan siap copy-paste**.

### 6.1 `app/lib/labelCore.ts` — tipe + logika murni

Tidak boleh punya dependensi Node/browser sama sekali, supaya aman dipakai di bundle browser
*dan* (kalau suatu saat perlu) di server. Isinya: tipe `Field`/`LabelRecord`, regex AWB,
normalisasi nama kurir, dan `reconcile()` yang menggabungkan hasil barcode + hasil OCR.

Aturan `reconcile()` untuk `tracking_number`:

| Kondisi | source | confidence |
|---|---|---|
| barcode terbaca ≥2× dengan nilai sama | `barcode` | `certain` |
| barcode terbaca 1× | `barcode` | `high` (flag "single barcode read") |
| tidak ada barcode | `ocr` / `none` | `low` (flag "no barcode — verify") |

Field OCR sekunder (biaya, berat, dsb.) **sengaja tidak pernah** memicu review — mereka
berbeda-beda per kurir dan bukan deliverable. Hanya `recipient_name` yang wajib ada.

```ts
// Pure label logic — NO Node/browser-specific deps, so it runs in the browser
// bundle and (if ever needed) on the server. Rendering/OCR lives elsewhere.

export type Field = {
  value: string | null;
  source: "barcode" | "shopify" | "ocr" | "none";
  confidence: "certain" | "high" | "low";
  flag: string | null;
};

export type PageVisual = {
  page: number;
  barcodes: string[];
  tracking: string | null;
  trackingConfirmed: boolean;
  thumbnail: string;
};

export type LabelRecord = {
  page: number;
  fields: { [k: string]: Field };
  barcodes: string[];
  thumbnail: string;
  needsReview: boolean;
  phoneLast4?: string;
  matchedOrder?: string | null;
  matchReasons?: string[];
  matchStatus?: "shopify" | "manual" | null;
  legacyId?: string | null; // Shopify numeric order id, for the Jubelio link
};

// Known airwaybill formats — J&T (JD…), Lion Parcel (…LP…). Extend as needed.
export const AWB_RE = /(JD\d{8,}|\d{0,3}LP\d{8,})/i;

const FIELD_KEYS = [
  "tracking_number", "order_code", "service_code",
  "recipient_name", "recipient_address", "sender_name", "sender_address",
  "shipping_cost", "weight", "payment_method", "item", "notes", "ship_date",
] as const;

function mkField(value: string | null, source: Field["source"], confidence: Field["confidence"], flag: string | null): Field {
  return { value: value ?? null, source, confidence, flag };
}

function validate(key: string, value: string | null): string | null {
  const v = (value ?? "").trim();
  // Deliverable is Courier · AWB · Phone. AWB is barcode-certain, the phone
  // drives review via the Shopify match, so secondary OCR fields never force a
  // review — they vary by courier.
  if (!v && key === "recipient_name") return "missing";
  return null;
}

export function normalizeCourier(raw: string | null): string | null {
  if (!raw) return null;
  const u = raw.toUpperCase();
  if (u.includes("LION PARCEL") || u.includes("LIONPARCEL") || /\bLP\d{6,}/.test(u.replace(/\s/g, ""))) return "Lion Parcel";
  if (u.includes("GLOBAL JET") || u.includes("J&T") || /\bJET\b/.test(u)) return "J&T Express";
  if (u.includes("JNE")) return "JNE";
  if (u.includes("SICEPAT")) return "SiCepat";
  if (u.includes("ANTERAJA")) return "AnterAja";
  if (u.includes("NINJA")) return "Ninja Xpress";
  if (u.includes("SAP EXPRESS")) return "SAP Express";
  return raw.trim();
}

// Merge parsed OCR rows with barcode visuals into review records.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function reconcile(rows: any[], visuals: PageVisual[]): LabelRecord[] {
  const byPage = new Map<number, any>();
  for (const row of rows || []) if (row && typeof row.page === "number") byPage.set(row.page, row);

  return visuals.map((vis) => {
    const row = byPage.get(vis.page) || {};
    const fields: { [k: string]: Field } = {};

    for (const key of FIELD_KEYS) {
      const ocrVal: string | null = row[key] ?? null;
      if (key === "tracking_number") {
        if (vis.tracking) {
          const match = ocrVal && ocrVal.replace(/\s/g, "") === vis.tracking;
          fields[key] = vis.trackingConfirmed
            ? mkField(vis.tracking, "barcode", "certain", match || !ocrVal ? null : "OCR said " + ocrVal)
            : mkField(vis.tracking, "barcode", "high", "single barcode read");
        } else {
          fields[key] = mkField(ocrVal, ocrVal ? "ocr" : "none", "low", "no barcode — verify");
        }
        continue;
      }
      const flag = validate(key, ocrVal);
      const conf: Field["confidence"] = flag ? "low" : "high";
      fields[key] = mkField(ocrVal, ocrVal ? "ocr" : "none", conf, flag);
    }

    const courierRaw: string | null = row.courier ?? null;
    fields["courier"] = mkField(normalizeCourier(courierRaw), courierRaw ? "ocr" : "none", "high", null);
    fields["phone"] = mkField(null, "none", "low", "not matched yet");

    const phoneLast4 = (row.recipient_phone_last4 ?? "").toString().replace(/\D/g, "").slice(-4);
    const needsReview = Object.values(fields).some((f) => f.confidence === "low");
    return { page: vis.page, fields, barcodes: vis.barcodes, thumbnail: vis.thumbnail, needsReview, phoneLast4, matchedOrder: null, matchReasons: [] };
  });
}
```

**Tuning knob:** `AWB_RE` = `/(JD\d{8,}|\d{0,3}LP\d{8,})/i`. Mau tambah kurir lain
(SiCepat `00xxxxxxxx`, JNE, Anteraja)? Tambahkan alternasinya di sini **dan** pastikan format
barcode-nya ada di daftar `formats` pada `browserOcr.ts`.

---

### 6.2 `app/lib/localExtract.ts` — parser teks OCR (tanpa LLM)

Mem-parse teks mentah Tesseract menjadi field terstruktur. Dua template label yang ditangani:

- **J&T** — `Penerima: NAMA ****1234` lalu alamat di baris-baris berikutnya.
- **Lion Parcel** — `PENERIMA: NAMA ****1234, alamat lengkap … 15419` dalam satu baris.

Strateginya: cari baris `Penerima`, potong di masker telepon (`****` atau grup 3–4 digit) →
kiri = nama, kanan + baris berikutnya (sampai boundary kata seperti `pengirim|biaya|total|…`)
= alamat.

```ts
// Parse structured label fields from raw Tesseract OCR text — no LLM involved.
// Digits (postcode, phone last-4, cost, weight) OCR reliably and are the fields
// the Shopify matcher leans on; the name is captured best-effort (the matcher
// tolerates OCR noise via token overlap, and clean contact data comes back from
// the matched Shopify order).

export type ParsedRow = {
  page: number;
  order_code: string | null;
  service_code: string | null;
  recipient_name: string | null;
  recipient_address: string | null;
  recipient_phone_last4: string | null;
  courier: string | null;
  sender_name: string | null;
  sender_address: string | null;
  shipping_cost: string | null;
  weight: string | null;
  payment_method: string | null;
  item: string | null;
  notes: string | null;
  ship_date: string | null;
};

// Strip leading/trailing single-char OCR noise from a line.
function scrub(line: string): string {
  return line
    .replace(/^[^A-Za-z0-9(]+/, "")
    .replace(/[^A-Za-z0-9).,]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const pick = (re: RegExp, text: string, group = 1): string | null => {
  const m = text.match(re);
  return m ? (m[group] ?? m[0]).trim() : null;
};

// Drop dates whose OCR'd year is implausible (e.g. 2026 → 2626) so the UI never
// shows an obviously wrong date.
function sanitizeDate(d: string | null): string | null {
  if (!d) return null;
  const y = d.match(/(\d{4})\s*$/);
  if (y) {
    const yr = +y[1];
    if (yr < 2023 || yr > 2028) return null;
  }
  return d;
}

// Last 5-digit run that ends at a non-digit boundary → the postcode
// (handles "5117510" → "17510" where a stray barcode digit prefixes it).
function extractZip(addr: string): string | null {
  const matches = [...addr.matchAll(/(\d{5})(?=\D|$)/g)].map((m) => m[1]);
  return matches.length ? matches[matches.length - 1] : null;
}

function normalizeCourier(text: string): string | null {
  const u = text.toUpperCase();
  if (u.includes("LION PARCEL") || u.includes("LIONPARCEL") || /\bLP\d{6,}/.test(u.replace(/\s/g, ""))) return "Lion Parcel";
  if (u.includes("GLOBAL JET") || u.includes("J&T") || /\bJET\b/.test(u)) return "J&T Express";
  if (u.includes("JNE")) return "JNE";
  if (u.includes("SICEPAT")) return "SiCepat";
  if (u.includes("ANTERAJA")) return "AnterAja";
  if (u.includes("NINJA")) return "Ninja Xpress";
  if (u.includes("SAP EXPRESS")) return "SAP Express";
  return null;
}

export function parseLabelFields(rawText: string, page: number): ParsedRow {
  const lines = rawText.split("\n").map(scrub).filter(Boolean);
  const flat = lines.join(" ");

  // Recipient block. Handles both templates:
  //   • J&T   — "Penerima: NAME ****1234" then address on following lines.
  //   • Lion  — "PENERIMA: NAME ****1234, full address … 15419" on one line.
  // We build a block from the Penerima line + following lines up to a boundary,
  // then split it at the masked phone: name is before, address is after.
  const penIdx = lines.findIndex((l) => /penerima/i.test(l));
  let recipient_name: string | null = null;
  let recipient_address: string | null = null;
  let recipient_phone_last4: string | null = null;

  if (penIdx >= 0) {
    // The masked phone sits on the "Penerima" line itself (right after the name)
    // for both templates — so look for it there only, never in later address
    // lines (whose house numbers / postcodes would otherwise be mistaken for it).
    const penLine = lines[penIdx].replace(/.*penerima\s*:?/i, "").trim();
    const pm = penLine.match(/\d{3,4}/);
    if (pm) recipient_phone_last4 = pm[0].slice(-4);

    // Name = penLine text before the mask ("****" or the first digit group).
    // Only drop a trailing token as mask-noise when the mask was OCR'd as a word
    // (no visible "****") — otherwise a genuine 3-word name would lose its last
    // word.
    const hadStars = /\*{2,}/.test(penLine);
    let nm = penLine.split(/\*{2,}|\d{3,4}/)[0];
    const parts = nm.split(/\s+/).filter(Boolean);
    if (parts.length >= 3 && !hadStars) parts.pop();
    nm = parts.join(" ").replace(/[^A-Za-z .'-]/g, "").replace(/\s+/g, " ").trim();
    recipient_name = nm || null;

    // Address = (rest of the Penerima line after the phone, for Lion's one-line
    // format) + following lines (J&T's wrapped address), up to a boundary.
    const addrParts: string[] = [];
    if (pm) {
      const after = penLine.slice(penLine.indexOf(pm[0]) + pm[0].length);
      if (after.replace(/[\s,*.-]/g, "")) addrParts.push(after);
    }
    for (let i = penIdx + 1; i < lines.length && addrParts.length < 6; i++) {
      if (/pengirim|biaya|total|syarat|bayar|kota tujuan|lacak|estimasi|dibuat|berat|lebih praktis|ditagihkan/i.test(lines[i]))
        break;
      addrParts.push(lines[i]);
    }
    recipient_address =
      addrParts
        .join(", ")
        .replace(/\d+\s*x\s*\d+\s*x\s*\d+\s*cm/gi, "")
        .replace(/\bCW\s*:?\s*[\d.]+\s*kg/gi, "")
        .replace(/\b[\d.]+\s*kg\b/gi, "")
        .replace(/\b\d+\s*\/\s*\d+\b/g, "")
        .replace(/^[\s,*.-]+/, "")
        .replace(/[\s,]+$/, "")
        .replace(/(,\s*)+/g, ", ")
        .replace(/\s+/g, " ")
        .trim() || null;
  }

  // Sender (Pengirim) — usually TREELOGY; capture for completeness.
  const sengIdx = lines.findIndex((l) => /pengirim/i.test(l));
  let sender_name: string | null = null;
  if (sengIdx >= 0) {
    sender_name = lines[sengIdx]
      .replace(/.*pengirim\s*:?/i, "")
      .replace(/\s*\S*\d{2,4}\s*$/, "")
      .replace(/[^A-Za-z .'-]/g, "")
      .replace(/\s+/g, " ")
      .trim() || null;
  }

  return {
    page,
    order_code: pick(/\b(\d{3}-[A-Z0-9]{3,}-[A-Z0-9]{2,})\b/i, flat),
    service_code: pick(/\b(EZ|NP|REG|EZBIG)\b/, flat),
    recipient_name,
    recipient_address,
    recipient_phone_last4,
    courier: normalizeCourier(flat),
    sender_name,
    sender_address: null,
    shipping_cost: pick(/((?:IDR|Rp)\s*[\d.,]+)/i, flat),
    weight: pick(/([\d.]+\s*KG)/i, flat),
    payment_method: pick(/\b(TUNAI|NON TUNAI|COD)\b/i, flat),
    item: pick(/Barang\s*:?\s*([A-Za-z]+(?:\s[A-Za-z]+)?)/i, flat),
    notes: pick(/Notes?\s*:?\s*([A-Za-z]{2,})/i, flat),
    ship_date: sanitizeDate(
      pick(/(?:Ship|Cetak|Dibuat)\s*:?\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i, flat) ||
        pick(/(\d{1,2}[-/]\d{1,2}[-/]\d{4})/, flat),
    ),
  };
}

// Expose the postcode helper for the matcher.
export { extractZip };
```

Detail yang penting (jangan disederhanakan saat rebuild):

- **`hadStars`** — kalau masker `****` terbaca, jangan buang token terakhir nama; kalau
  masker ter-OCR jadi kata (tanpa bintang) dan nama ≥3 kata, token terakhir dibuang sebagai noise.
- **4 digit HP hanya dicari di baris `Penerima`**, tidak pernah di baris alamat — kalau tidak,
  nomor rumah / kodepos akan salah dianggap sebagai digit telepon.
- **`extractZip`** mengambil run 5-digit **terakhir** yang berakhir di batas non-digit
  (menangani `5117510` → `17510`, di mana digit barcode nyasar jadi prefix).
- **`sanitizeDate`** membuang tahun tak masuk akal (`2626`) supaya window pencarian order
  tidak melenceng jauh.

---

### 6.3 `app/lib/browserOcr.ts` — pipeline OCR di browser

Render → decode barcode → OCR → parse. Semua di device pengguna.

Parameter yang menentukan kualitas:

| Parameter | Nilai | Alasan |
|---|---|---|
| PDF render scale | `400 / 72` (≈400 dpi) | cukup tajam untuk barcode Code128 tipis |
| Foto (bukan PDF) | di-upscale ke lebar 3400–4400 px | foto HP sering terlalu kecil untuk zxing |
| Barcode formats | Code128, Code39, ITF, QRCode, DataMatrix | J&T/Lion pakai Code128/39 |
| Region scan | 6 crop bertingkat + `tryHarder` | crop kecil di area barcode jauh lebih akurat daripada full-page |
| Early exit | berhenti kalau ≥2 pembacaan dan semuanya identik | 2 barcode yang setuju = `trackingConfirmed` |
| Thumbnail | 520 px, JPEG q=0.72 | cukup untuk verifikasi mata, hemat memori |
| Tesseract lang | `ind+eng` | label Indonesia + istilah Inggris |

```ts
// Browser-side OCR pipeline — runs entirely on the user's machine (no upload of
// the PDF/photo to any server): pdf.js renders pages, zxing decodes the AWB
// barcode, tesseract.js reads the label, and localExtract parses the fields.
// Only the small extracted text (name/postcode/phone-4) is later sent to the
// server for the Shopify lookup.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { readBarcodes } from "zxing-wasm/reader";
import { createWorker } from "tesseract.js";
import { AWB_RE, type PageVisual } from "./labelCore";
import { parseLabelFields, type ParsedRow } from "./localExtract";

export type Progress = { stage: string; page?: number; total?: number };

let pdfjsPromise: Promise<any> | null = null;
async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      // Self-hosted worker (copied into /public) — no external CDN for the core.
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

function cropImageData(canvas: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number, scale: number): ImageData {
  const cw = Math.max(1, Math.round(sw * scale));
  const ch = Math.max(1, Math.round(sh * scale));
  const c = document.createElement("canvas");
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, cw, ch);
  return ctx.getImageData(0, 0, cw, ch);
}

async function decodeRegion(canvas: HTMLCanvasElement, rx: number, ry: number, rw: number, rh: number, scale: number): Promise<string[]> {
  const W = canvas.width, H = canvas.height;
  const id = cropImageData(canvas, Math.round(W * rx), Math.round(H * ry), Math.round(W * rw), Math.round(H * rh), scale);
  try {
    const res = await readBarcodes(id, {
      formats: ["Code128", "Code39", "ITF", "QRCode", "DataMatrix"],
      tryHarder: true,
      maxNumberOfSymbols: 20,
    });
    return res
      .map((r: any) => (r.text || "").trim())
      .map((t: string) => (t.match(AWB_RE) ? t.match(AWB_RE)![0].toUpperCase() : ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function decodePage(canvas: HTMLCanvasElement): Promise<string[]> {
  const regions: [number, number, number, number, number][] = [
    [0.01, 0.045, 0.3, 0.075, 2],
    [0.0, 0.3, 0.42, 0.08, 2],
    [0.0, 0.1, 0.72, 0.09, 2],
    [0.0, 0.0, 0.75, 0.55, 1],
    [0.0, 0.0, 0.42, 0.4, 1.5],
    [0.0, 0.0, 0.42, 0.4, 1],
  ];
  const found: string[] = [];
  for (const [rx, ry, rw, rh, scale] of regions) {
    found.push(...(await decodeRegion(canvas, rx, ry, rw, rh, scale)));
    if (found.length >= 2 && new Set(found).size === 1) break;
  }
  return found;
}

function thumbnailOf(canvas: HTMLCanvasElement): string {
  const tw = 520;
  const th = Math.round((canvas.height / canvas.width) * tw);
  const tc = document.createElement("canvas");
  tc.width = tw;
  tc.height = th;
  tc.getContext("2d")!.drawImage(canvas, 0, 0, tw, th);
  return tc.toDataURL("image/jpeg", 0.72);
}

async function loadImageCanvas(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Could not read that image."));
      i.src = url;
    });
    const targetW = Math.min(4400, Math.max(3400, img.naturalWidth));
    const scale = targetW / img.naturalWidth;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function processCanvas(
  canvas: HTMLCanvasElement,
  n: number,
  worker: any,
  visuals: PageVisual[],
  rows: ParsedRow[],
) {
  const barcodes = await decodePage(canvas);
  const { data } = await worker.recognize(canvas);
  const ocrText: string = data.text || "";

  const counts = new Map<string, number>();
  for (const b of barcodes) counts.set(b, (counts.get(b) || 0) + 1);
  let tracking: string | null = null;
  let best = 0;
  for (const [val, cnt] of counts) if (cnt > best) ((best = cnt), (tracking = val));

  visuals.push({
    page: n,
    barcodes: [...counts.keys()],
    tracking,
    trackingConfirmed: best >= 2,
    thumbnail: thumbnailOf(canvas),
  });
  rows.push(parseLabelFields(ocrText, n));
}

export async function extractFromFile(
  file: File,
  onProgress?: (p: Progress) => void,
): Promise<{ visuals: PageVisual[]; rows: ParsedRow[] }> {
  const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(file.name);
  const visuals: PageVisual[] = [];
  const rows: ParsedRow[] = [];

  onProgress?.({ stage: "Loading OCR engine" });
  const worker = await createWorker("ind+eng");

  try {
    if (isImage) {
      onProgress?.({ stage: "Reading label", page: 1, total: 1 });
      const canvas = await loadImageCanvas(file);
      await processCanvas(canvas, 1, worker, visuals, rows);
    } else {
      const pdfjs = await getPdfjs();
      const buf = new Uint8Array(await file.arrayBuffer());
      const pdf = await pdfjs.getDocument({ data: buf }).promise;
      const total = pdf.numPages;
      const scale = 400 / 72;
      for (let n = 1; n <= total; n++) {
        onProgress?.({ stage: "Reading labels", page: n, total });
        const page = await pdf.getPage(n);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        page.cleanup();
        await processCanvas(canvas, n, worker, visuals, rows);
      }
      try {
        if (typeof pdf.destroy === "function") await pdf.destroy();
      } catch {
        /* ignore */
      }
    }
  } finally {
    try {
      await worker.terminate();
    } catch {
      /* ignore */
    }
  }
  return { visuals, rows };
}
```

> **Gotcha #3 (pdfjs-dist v6):** `page.render()` di v6 butuh properti **`canvas`** selain
> `canvasContext` dan `viewport`. Di v3/v4 cukup dua yang pertama — kalau contoh lama disalin,
> render akan gagal senyap.

> **Gotcha #4 (Tesseract traineddata):** `createWorker("ind+eng")` **men-download** `ind` &
> `eng` traineddata dari CDN saat runtime (sekali, lalu di-cache browser). Kalau app harus
> jalan offline / di balik CSP ketat, host sendiri file `.traineddata` dan set
> `createWorker("ind+eng", 1, { langPath: "/tessdata" })`.

**Region crop** `[rx, ry, rw, rh, scale]` di `decodePage()` di-tuning untuk layout label A6
J&T & Lion (barcode di kiri-atas dan sekitar 30% tinggi). Untuk kurir dengan layout lain:
render satu halaman ke canvas, cetak posisi barcode-nya, lalu tambahkan region baru **di depan**
daftar (region dievaluasi berurutan, yang murah/paling mungkin didahulukan).

---

### 6.4 `app/lib/shopify.ts` — matcher (bagian paling penting)

Algoritmanya **pool-based, digit-first, fuzzy-toleran 1 kesalahan OCR**:

1. **`fetchPool()`** — satu query paginated mengambil order dalam window
   `[shipDate − 30 hari, shipDate + 10 hari]`, maksimum 8 halaman × 100 = **800 order**.
2. **`matchAgainstPool()`** — skor tiap order terhadap tiap label:

   | Sinyal | Skor |
   |---|---|
   | `phone-4 ✓` (4 digit terakhir sama persis) | +4 |
   | `phone-4 ~` (Levenshtein ≤1 pada **ekor** nomor) | +3 |
   | `postcode` sama persis | +3 |
   | `postcode ~` (Levenshtein ≤1) | +1.5 |
   | `name×N` (≥2 token nama sama) | +3 |
   | `name×1` | +1.5 |
   | dibuat ≤4 hari dari ship date | +1 |

3. **Penentuan confidence** — hanya dua yang dipakai UI: `certain` atau bukan.

   - `phoneContradicts` → **low**. Kalau label menampilkan 4 digit HP dan order ini punya
     nomor yang **berbeda**, itu hampir pasti orang lain (nama/area sama, nomor beda).
     Tidak pernah boleh `certain`, sekalipun nama + kodepos cocok.
   - `nama + phone-4 (exact/fuzzy)` → **certain** (nomor HP nyaris unik).
   - `phone-4 exact + kodepos exact` → **certain** (bukti digit sangat kuat meski nama kacau).
   - `nama + kodepos` tanpa konfirmasi HP → **certain hanya jika unik**; kalau ada ≥2 order
     dengan nama mirip di kodepos yang sama → **low** ("multiple orders match this name + area").
   - Selebihnya → **low**.

Kenapa `phoneTail()` hanya membandingkan **ekor** nomor, bukan window 4 digit di mana pun:
supaya kecocokan kebetulan di tengah nomor (label `3555` vs `…3155 88` milik orang lain)
tidak terlihat seperti hit telepon.

```ts
// Shopify order matcher — resolves each shipping label to a Shopify order and
// returns the recipient's CLEAN contact data (name, phone, address) plus the
// order number. Designed to work from noisy local-OCR input with NO LLM.
//
// Strategy — digit-first, fuzzy, pool-based:
//   1. Fetch a POOL of orders around the ship date (one paginated query).
//   2. Match each label against the pool by three INDEPENDENT signals:
//        • phone last-4  — the label masks the phone as "****1234"; those four
//          digits must equal the order phone's last four (edit-distance ≤1 to
//          tolerate a single OCR slip).
//        • postcode      — 5-digit label postcode vs order zip (edit-distance ≤1).
//        • name overlap  — shared name tokens (robust to trailing OCR garbage).
//   3. A match is "certain" only when TWO independent signals agree — so a wrong
//      single-signal guess can never pass silently.
// This beats name-search because OCR reads digits far more reliably than the
// masked name region, and the confirmed phone/name come back from Shopify itself.

export type MatchResult = {
  phone: string | null;
  name: string | null; // authoritative recipient name from the order
  address: string | null; // authoritative full address from the order
  city: string | null;
  zip: string | null;
  orderName: string | null;
  legacyId: string | null; // Shopify numeric order id (= Jubelio ref_no)
  confidence: "certain" | "high" | "low";
  reasons: string[];
  flag: string | null;
  candidateCount: number;
};

export type MatchInput = {
  page: number;
  name: string;
  zip: string;
  phoneLast4: string;
  shipDate: string; // ISO
};

type PoolOrder = { orderName: string; legacyId: string; createdAt: string; shipName: string; address: string; city: string; zip: string; phone: string };

const digits = (s: string | null) => (s || "").replace(/\D/g, "");
const nameTokens = (s: string) =>
  new Set((s || "").toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter((w) => w.length >= 3));

function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

// Does the order phone end in the label's last-4 (exact, or 1-edit fuzzy on the
// TAIL only)? Comparing just the last four digits — not any 4-digit window in
// the middle of the number — prevents a coincidental interior match (e.g. label
// "3555" vs a different person's "…3155 88") from looking like a phone hit.
function phoneTail(phone: string, last4: string): "exact" | "fuzzy" | null {
  if (!phone || last4.length < 3) return null;
  const p = digits(phone);
  if (p.length < last4.length) return null;
  if (p.endsWith(last4)) return "exact";
  if (lev(p.slice(-last4.length), last4) <= 1) return "fuzzy";
  return null;
}

const POOL_QUERY = `query Pool($q: String!, $c: String) {
  orders(first: 100, after: $c, query: $q, sortKey: CREATED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    edges { node { name legacyResourceId createdAt shippingAddress { name address1 city province zip phone } } }
  }
}`;

async function fetchPool(store: string, token: string, shipDate: string): Promise<PoolOrder[]> {
  const from = new Date(+new Date(shipDate) - 30 * 86400000).toISOString().slice(0, 10);
  const to = new Date(+new Date(shipDate) + 10 * 86400000).toISOString().slice(0, 10);
  const q = `created_at:>=${from} created_at:<=${to}`;
  const pool: PoolOrder[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const res: Response = await fetch(`https://${store}/admin/api/2026-07/graphql.json`, {
      method: "POST",
      headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ query: POOL_QUERY, variables: { q, c: cursor } }),
    });
    const json: any = await res.json();
    if (json.errors) throw new Error("Shopify: " + JSON.stringify(json.errors));
    const conn = json.data?.orders;
    for (const e of conn?.edges ?? []) {
      const a = e.node.shippingAddress ?? {};
      pool.push({
        orderName: e.node.name,
        legacyId: String(e.node.legacyResourceId ?? ""),
        createdAt: e.node.createdAt,
        shipName: a.name ?? "",
        address: [a.address1, a.city, a.province, a.zip].filter(Boolean).join(", "),
        city: a.city ?? "",
        zip: digits(a.zip ?? ""),
        phone: a.phone ?? "",
      });
    }
    cursor = conn?.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : null;
    pages++;
  } while (cursor && pages < 8);
  return pool;
}

function matchAgainstPool(inp: MatchInput, pool: PoolOrder[]): MatchResult {
  const inTokens = nameTokens(inp.name);
  let best: PoolOrder | null = null;
  let bestScore = -Infinity;
  let bestReasons: string[] = [];

  for (const o of pool) {
    let score = 0;
    const reasons: string[] = [];
    const ph = phoneTail(o.phone, inp.phoneLast4);
    if (ph === "exact") {
      score += 4;
      reasons.push("phone-4 ✓");
    } else if (ph === "fuzzy") {
      score += 3;
      reasons.push("phone-4 ~");
    }
    if (inp.zip && o.zip) {
      if (o.zip === inp.zip) {
        score += 3;
        reasons.push("postcode");
      } else if (lev(o.zip, inp.zip) <= 1) {
        score += 1.5;
        reasons.push("postcode ~");
      }
    }
    const shared = [...inTokens].filter((t) => nameTokens(o.shipName).has(t)).length;
    if (shared >= 2) {
      score += 3;
      reasons.push("name×" + shared);
    } else if (shared === 1) {
      score += 1.5;
      reasons.push("name×1");
    }
    const days = Math.abs((+new Date(o.createdAt) - +new Date(inp.shipDate)) / 86400000);
    if (days <= 4) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = o;
      bestReasons = reasons;
    }
  }

  if (!best || bestScore <= 0) {
    return { phone: null, name: null, address: null, city: null, zip: null, orderName: null, legacyId: null, confidence: "low", reasons: [], flag: "no matching order", candidateCount: pool.length };
  }

  const phoneExact = bestReasons.includes("phone-4 ✓");
  const phoneFuzzy = bestReasons.some((r) => r.startsWith("phone-4"));
  const hasZip = bestReasons.some((r) => r.startsWith("postcode"));
  const hasName = bestReasons.some((r) => r.startsWith("name"));

  // If the label DID show a phone last-4 and it does NOT match this order's
  // phone, the order almost certainly belongs to a different person (same name /
  // area, different number) — never call that certain, even with name + zip.
  const phoneContradicts =
    inp.phoneLast4.length >= 3 && !!best.phone && !phoneTail(best.phone, inp.phoneLast4);

  // The recipient NAME is the identity anchor: postcode + fuzzy-phone can
  // coincide for a different person, so a match is only "certain" when the name
  // agrees AND a hard key confirms it — OR when the digit evidence is
  // exceptionally strong (exact phone last-4 AND exact postcode).
  let confidence: MatchResult["confidence"];
  let flag: string | null = null;
  if (phoneContradicts) {
    confidence = "low";
    flag = "phone last-4 differs from this order — verify against label";
  } else if (hasName && phoneFuzzy) {
    // Name + phone last-4 (exact or ≤1 edit): the phone is near-unique → certain.
    confidence = "certain";
  } else if (phoneExact && hasZip) {
    // Exact phone + exact postcode: strong even if the OCR name is garbled.
    confidence = "certain";
  } else if (hasName && hasZip) {
    // Name + postcode but NO phone confirmation. Safe only if it's the unique
    // name-in-that-area — otherwise two same-name neighbours could be confused.
    const dupes = pool.filter((o) => {
      const shared = [...inTokens].filter((t) => nameTokens(o.shipName).has(t)).length;
      return shared >= 1 && !!inp.zip && o.zip === inp.zip;
    }).length;
    if (dupes <= 1) {
      confidence = "certain";
    } else {
      confidence = "low";
      flag = "multiple orders match this name + area — verify against label";
    }
  } else {
    confidence = "low";
    flag = hasName || phoneFuzzy || hasZip ? "single-signal match — verify against label" : "weak match — verify";
  }

  return {
    phone: best.phone || null,
    name: best.shipName || null,
    address: best.address || null,
    city: best.city || null,
    zip: best.zip || null,
    orderName: best.orderName,
    legacyId: best.legacyId || null,
    confidence,
    reasons: bestReasons,
    flag,
    candidateCount: pool.length,
  };
}

export async function matchAll(inputs: MatchInput[]): Promise<Map<number, MatchResult>> {
  const store = process.env.STORE_NAME;
  const token = process.env.ADMIN_API_KEY;
  const out = new Map<number, MatchResult>();
  if (!store || !token) {
    for (const i of inputs)
      out.set(i.page, { phone: null, name: null, address: null, city: null, zip: null, orderName: null, legacyId: null, confidence: "low", reasons: [], flag: "Shopify not configured", candidateCount: 0 });
    return out;
  }
  const shipDate = inputs.find((i) => i.shipDate)?.shipDate || new Date().toISOString().slice(0, 10);
  let pool: PoolOrder[];
  try {
    pool = await fetchPool(store, token, shipDate);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Shopify error";
    for (const i of inputs)
      out.set(i.page, { phone: null, name: null, address: null, city: null, zip: null, orderName: null, legacyId: null, confidence: "low", reasons: [], flag: msg, candidateCount: 0 });
    return out;
  }
  for (const inp of inputs) out.set(inp.page, matchAgainstPool(inp, pool));
  return out;
}
```

**Catatan Shopify API:**

- Endpoint di-pin ke `https://${store}/admin/api/2026-07/graphql.json`. Query di atas sudah
  divalidasi terhadap schema `2026-07`; scope yang dibutuhkan **`read_orders`**.
- `shippingAddress.phone` dan `.name` termasuk **protected customer data** — pastikan app
  punya izinnya, kalau tidak field-nya akan `null` dan semua match jadi `low`.
- Kalau toko punya volume order tinggi, perbesar/perkecil window di `fetchPool()`
  (`-30 hari / +10 hari`) dan batas `pages < 8`. Window terlalu lebar = pool besar = kandidat
  nama kembar makin banyak (lebih banyak yang jatuh ke review).
- Kalau `shipDate` gagal di-parse dari label, fallback-nya `new Date()` (hari ini).

---

### 6.5 `app/api/match/route.ts` — satu-satunya route yang menyentuh token Shopify

Payload masuk & keluar sangat kecil → aman di free tier, tanpa `maxDuration` khusus.

```ts
import { NextRequest, NextResponse } from "next/server";
import { matchAll, type MatchInput } from "@/app/lib/shopify";

export const runtime = "nodejs";

// Lightweight endpoint: OCR happens in the browser; this only cross-checks the
// extracted recipients against Shopify (needs the secret Admin token). The
// request/response are tiny, so it runs comfortably on any serverless free tier.
export async function POST(req: NextRequest) {
  // Optional access gate: if APP_PASSWORD is set, this endpoint (which can pull
  // customer phone numbers from Shopify) requires a matching password header.
  // Unset = open (e.g. for local use).
  const gate = process.env.APP_PASSWORD;
  if (gate && req.headers.get("x-app-password") !== gate) {
    return NextResponse.json({ error: "Access password required or incorrect." }, { status: 401 });
  }

  let body: { inputs?: MatchInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const inputs = Array.isArray(body?.inputs) ? body.inputs : [];
  if (!inputs.length) return NextResponse.json({ matches: {} });

  try {
    const map = await matchAll(inputs);
    const matches: Record<number, unknown> = {};
    for (const [page, m] of map) matches[page] = m;
    return NextResponse.json({ matches });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Shopify lookup failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
```

> **Gotcha #2 (APP_PASSWORD):** route ini mendukung gate opsional lewat header
> `x-app-password`, **tetapi client (`app/page.tsx`) tidak lagi mengirim header itu**
> (prompt password sengaja dihapus di commit "Make access automatic"). Artinya:
> **kalau `APP_PASSWORD` di-set, semua request akan 401.** Pilih salah satu saat rebuild:
> 1. Jangan set `APP_PASSWORD` (kondisi sekarang: app terbuka), **atau**
> 2. Hapus blok gate itu sekalian, **atau**
> 3. Kembalikan prompt password di client dan kirim `headers: { "x-app-password": pw }` pada
>    `fetch("/api/match")`.
>
> Untuk deploy publik, cara yang lebih rapi: pakai **Vercel Deployment Protection**
> (password/SSO di level platform) daripada gate manual di route.

---

### 6.6 `app/lib/jubelio.ts` — klien ERP (opsional)

Alurnya sengaja **dua tahap** karena Jubelio tidak punya endpoint "cari order by ref_no":

1. Ambil kandidat dari list WMS berdasarkan **nama penerima** (`?q=<nama>`), dari beberapa
   list berurutan: `ready-to-process` → `ready-to-pick` → `ready-to-ship` → `completed`.
2. Konfirmasi tiap kandidat lewat `GET /sales/orders/{id}` dengan syarat **eksak**:
   `ref_no === legacyResourceId Shopify` **dan** `source_name === "SHOPIFY"`.

Fallback (dipakai hati-hati): kalau hanya ada **satu** kandidat, namanya cocok, dan kodeposnya
cocok → diterima tetapi ditandai `refMatch: false` (UI menolak untuk menulis pada kondisi ini).

Penulisan AWB: `POST /sales/orders/save-airwaybill/` dengan
`{ salesorder_id, tracking_no, shipper }`. Ini **hanya berhasil kalau order sudah punya
picklist** (`picklist_exist: true`) — kalau belum, Jubelio menolak dan kita terjemahkan
pesannya jadi "order belum diproses di Jubelio (belum ada picklist)".

Rate limit Jubelio: 600 req/menit — `jfetch()` melakukan satu retry pada HTTP 429 setelah 1,5 detik.

```ts
// Jubelio client — finds the Jubelio sales order that corresponds to a resi and
// writes its AWB (No. Resi) + courier. Server-side only (uses the API password).
//
// Matching is EXACT, not fuzzy: a Jubelio order synced from Shopify has
// `ref_no` == the Shopify order's numeric legacyResourceId and `source_name`
// == "SHOPIFY". So we take the (already world-class) resi→Shopify match, then
// confirm the Jubelio order by ref_no. There is no ref_no search endpoint, so we
// surface candidates by recipient name from the "ready-to-process" WMS list and
// confirm each via GET /sales/orders/{id}.
/* eslint-disable @typescript-eslint/no-explicit-any */

const BASE = "https://api2.jubelio.com";

export type JubelioFind = {
  found: boolean;
  salesorderId: number | null;
  salesorderNo: string | null;
  currentTracking: string | null;
  currentShipper: string | null;
  refMatch: boolean;
  zipMatch: boolean;
  picklistExist: boolean; // save-airwaybill only works once the order has a picklist
  note: string;
};

async function jfetch(token: string, path: string, init?: RequestInit): Promise<Response> {
  // One retry on 429 (Jubelio: 600 req/min).
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(BASE + path, {
      ...init,
      headers: { Authorization: token, "Content-Type": "application/json", ...(init?.headers || {}) },
    });
    if (res.status !== 429) return res;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return fetch(BASE + path, { ...init, headers: { Authorization: token, "Content-Type": "application/json", ...(init?.headers || {}) } });
}

export async function jubelioLogin(): Promise<string> {
  const email = process.env.JUBELIO_API_USERNAME;
  const password = process.env.JUBELIO_API_PASSWORD;
  if (!email || !password) throw new Error("Jubelio credentials not configured (JUBELIO_API_USERNAME / JUBELIO_API_PASSWORD).");
  const res = await fetch(BASE + "/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json?.token) throw new Error("Jubelio login failed: " + (json?.message || res.status));
  return json.token as string;
}

const digits = (s: any) => String(s ?? "").replace(/\D/g, "");
const norm = (s: any) => String(s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

// Lists (in order) where an order awaiting its AWB is likely to appear.
const CANDIDATE_LISTS = [
  "/wms/sales/orders/ready-to-process/",
  "/wms/sales/orders/ready-to-pick/",
  "/wms/sales/order/ready-to-ship",
  "/sales/orders/completed/",
];

// Find the Jubelio order for a Shopify legacyId, surfacing candidates by name.
export async function findJubelioOrder(
  token: string,
  opts: { name: string; legacyId: string; zip: string },
): Promise<JubelioFind> {
  const seen = new Set<number>();
  const candidateIds: number[] = [];
  const nameQ = opts.name.trim();
  if (nameQ) {
    for (const list of CANDIDATE_LISTS) {
      try {
        const res = await jfetch(token, `${list}?q=${encodeURIComponent(nameQ)}&pageSize=20`);
        if (!res.ok) continue;
        const j: any = await res.json();
        for (const it of j.data || j.rows || []) {
          const id = Number(it.salesorder_id);
          if (id && !seen.has(id)) {
            seen.add(id);
            candidateIds.push(id);
          }
        }
      } catch {
        /* try next list */
      }
      if (candidateIds.length >= 15) break;
    }
  }

  if (!candidateIds.length) {
    return { found: false, salesorderId: null, salesorderNo: null, currentTracking: null, currentShipper: null, refMatch: false, zipMatch: false, picklistExist: false, note: "no candidate in Jubelio (name not in open orders)" };
  }

  // Confirm each candidate by ref_no == legacyId (exact) + source SHOPIFY.
  for (const id of candidateIds) {
    try {
      const res = await jfetch(token, `/sales/orders/${id}`);
      if (!res.ok) continue;
      const o: any = await res.json();
      const refMatch = !!opts.legacyId && String(o.ref_no) === String(opts.legacyId);
      const isShopify = String(o.source_name || "").toUpperCase() === "SHOPIFY";
      if (refMatch && isShopify) {
        const zipMatch = !!opts.zip && digits(o.shipping_post_code) === digits(opts.zip);
        return {
          found: true,
          salesorderId: id,
          salesorderNo: o.salesorder_no ?? null,
          currentTracking: o.tracking_no || o.tracking_number || null,
          currentShipper: o.shipper || null,
          refMatch: true,
          zipMatch,
          picklistExist: !!o.picklist_exist,
          note: "matched by ref_no",
        };
      }
    } catch {
      /* next candidate */
    }
  }

  // Fallback: exactly one candidate whose recipient name matches strongly and,
  // if we have zip, its postcode matches — accept but mark ref-unconfirmed.
  if (candidateIds.length === 1) {
    try {
      const res = await jfetch(token, `/sales/orders/${candidateIds[0]}`);
      if (res.ok) {
        const o: any = await res.json();
        const nm = norm(o.shipping_full_name) || norm(o.customer_name);
        const sameName = nm && norm(opts.name) && (nm.includes(norm(opts.name)) || norm(opts.name).includes(nm));
        const zipMatch = !!opts.zip && digits(o.shipping_post_code) === digits(opts.zip);
        if (sameName && zipMatch) {
          return {
            found: true,
            salesorderId: candidateIds[0],
            salesorderNo: o.salesorder_no ?? null,
            currentTracking: o.tracking_no || o.tracking_number || null,
            currentShipper: o.shipper || null,
            refMatch: false,
            zipMatch: true,
            picklistExist: !!o.picklist_exist,
            note: "matched by name + postcode (ref_no not confirmed)",
          };
        }
      }
    } catch {
      /* ignore */
    }
  }

  return { found: false, salesorderId: null, salesorderNo: null, currentTracking: null, currentShipper: null, refMatch: false, zipMatch: false, picklistExist: false, note: "candidates found but none matched ref_no/postcode" };
}

// Write AWB + courier to a Jubelio sales order.
export async function writeJubelioAwb(
  token: string,
  salesorderId: number,
  trackingNo: string,
  shipper: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await jfetch(token, "/sales/orders/save-airwaybill/", {
    method: "POST",
    body: JSON.stringify({ salesorder_id: salesorderId, tracking_no: trackingNo, shipper }),
  });
  if (res.ok) return { ok: true };
  const j: any = await res.json().catch(() => ({}));
  const msg = j?.message || `HTTP ${res.status}`;
  if (/picklist/i.test(msg)) return { ok: false, error: "order belum diproses di Jubelio (belum ada picklist)" };
  return { ok: false, error: msg };
}
```

---

### 6.7 `app/api/jubelio/route.ts` — preview (dry-run) & push

`mode=preview` tidak menulis apa pun; ia melaporkan apa yang **akan** ditulis.
`mode=push` **mengulang pencarian & konfirmasi dari nol** sebelum menulis — jadi
`salesorder_id` basi/palsu dari client tidak mungkin menyebabkan tulisan ke order yang salah.

Guard sebelum menulis (semuanya harus lolos): `found` ∧ `refMatch` ∧ tidak punya
`currentTracking` ∧ `picklistExist` ∧ ada AWB. Order yang **sudah punya resi tidak pernah
ditimpa**.

```ts
import { NextRequest, NextResponse } from "next/server";
import { jubelioLogin, findJubelioOrder, writeJubelioAwb } from "@/app/lib/jubelio";

export const runtime = "nodejs";
export const maxDuration = 120;

type Row = { page: number; name: string; legacyId: string; zip: string; awb: string; courier: string; salesorderId?: number };

// mode=preview → dry-run: locate each Jubelio order and report what WOULD be
// written (writes nothing). mode=push → actually write AWB+courier, but only
// after re-confirming ref_no == Shopify legacyId on a fresh fetch.
export async function POST(req: NextRequest) {
  let body: { mode?: string; rows?: Row[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const mode = body.mode === "push" ? "push" : "preview";
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return NextResponse.json({ results: [] });

  let token: string;
  try {
    token = await jubelioLogin();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Jubelio login failed." }, { status: 502 });
  }

  const results: any[] = [];

  if (mode === "preview") {
    for (const r of rows) {
      try {
        const f = await findJubelioOrder(token, { name: r.name, legacyId: r.legacyId, zip: r.zip });
        const writable = f.found && f.refMatch && !f.currentTracking && f.picklistExist;
        let status: string;
        if (!f.found) status = f.note;
        else if (f.currentTracking) status = `already has resi ${f.currentTracking}`;
        else if (!f.refMatch) status = "found by name but ref_no not confirmed — verify";
        else if (!f.picklistExist) status = "not processed in Jubelio yet (no picklist) — process the order first";
        else status = "ready to write";
        results.push({
          page: r.page,
          found: f.found,
          salesorderId: f.salesorderId,
          salesorderNo: f.salesorderNo,
          currentTracking: f.currentTracking,
          currentShipper: f.currentShipper,
          refMatch: f.refMatch,
          writable,
          awb: r.awb,
          courier: r.courier,
          status,
        });
      } catch (e) {
        results.push({ page: r.page, found: false, writable: false, status: e instanceof Error ? e.message : "error" });
      }
    }
    return NextResponse.json({ mode, results });
  }

  // push — re-confirm each order before writing, so a stale/incorrect client
  // salesorder_id can never cause a wrong write.
  for (const r of rows) {
    try {
      const f = await findJubelioOrder(token, { name: r.name, legacyId: r.legacyId, zip: r.zip });
      if (!f.found || !f.refMatch || !f.salesorderId) {
        results.push({ page: r.page, ok: false, error: "not confirmed at write time — skipped" });
        continue;
      }
      if (f.currentTracking) {
        results.push({ page: r.page, ok: false, error: `already has resi ${f.currentTracking} — skipped` });
        continue;
      }
      if (!f.picklistExist) {
        results.push({ page: r.page, ok: false, error: "not processed in Jubelio yet (no picklist) — skipped" });
        continue;
      }
      if (!r.awb) {
        results.push({ page: r.page, ok: false, error: "no AWB to write" });
        continue;
      }
      const w = await writeJubelioAwb(token, f.salesorderId, r.awb, r.courier || "");
      results.push({ page: r.page, ok: w.ok, error: w.error, salesorderNo: f.salesorderNo });
    } catch (e) {
      results.push({ page: r.page, ok: false, error: e instanceof Error ? e.message : "error" });
    }
  }
  return NextResponse.json({ mode, results });
}
```

`maxDuration = 120` diperlukan karena satu request bisa memanggil banyak endpoint Jubelio
secara berurutan (kandidat × halaman). Di Vercel sekarang default timeout 300 s, jadi 120 aman
di semua plan.

---

### 6.8 `app/components/ReviewPanel.tsx` — verifikasi manusia + export

Satu kartu per halaman: thumbnail (klik → lightbox), semua field sebagai input yang bisa
diedit, badge `barcode ✓` / `Shopify ✓`, sel amber untuk `confidence: low`, checkbox
**Verified**, dan tombol export CSV/JSON. Export **mengikuti hasil edit**, bukan nilai OCR asli,
dan menambahkan kolom `Source` (`Shopify` / `Manual/WA`), `Order`, `Verified`.

```tsx
"use client";

import { useMemo, useState } from "react";
import type { LabelRecord } from "../lib/labelCore";

export type VerifyRecord = LabelRecord;

const COLUMNS: { key: string; label: string }[] = [
  { key: "courier", label: "Courier" },
  { key: "tracking_number", label: "AWB / Resi" },
  { key: "phone", label: "No. HP (Shopify)" },
  { key: "recipient_name", label: "Penerima" },
  { key: "recipient_address", label: "Alamat Penerima" },
  { key: "order_code", label: "Order Code" },
  { key: "service_code", label: "Service" },
  { key: "shipping_cost", label: "Biaya" },
  { key: "weight", label: "Berat" },
  { key: "payment_method", label: "Bayar" },
  { key: "item", label: "Barang" },
  { key: "ship_date", label: "Ship Date" },
];

export default function ReviewPanel({ records }: { records: VerifyRecord[] }) {
  // Editable working copy: page -> field -> value
  const [edits, setEdits] = useState<Record<number, Record<string, string>>>(() => {
    const init: Record<number, Record<string, string>> = {};
    for (const r of records) {
      init[r.page] = {};
      for (const c of COLUMNS) init[r.page][c.key] = r.fields[c.key]?.value ?? "";
    }
    return init;
  });
  const [verified, setVerified] = useState<Record<number, boolean>>({});
  const [zoom, setZoom] = useState<string | null>(null);

  const setVal = (page: number, key: string, v: string) =>
    setEdits((e) => ({ ...e, [page]: { ...e[page], [key]: v } }));

  const toReviewCount = useMemo(
    () => records.filter((r) => r.needsReview && !verified[r.page]).length,
    [records, verified],
  );
  const verifiedCount = useMemo(
    () => records.filter((r) => verified[r.page]).length,
    [records, verified],
  );

  const rows = () =>
    records.map((r) => {
      const o: Record<string, string | number> = {
        page: r.page,
        source: r.matchStatus === "shopify" ? "Shopify" : "Manual/WA",
        order: r.matchedOrder ?? "",
        verified: verified[r.page] ? "yes" : "no",
      };
      for (const c of COLUMNS) o[c.key] = edits[r.page]?.[c.key] ?? "";
      return o;
    });

  const downloadCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const cols = ["page", ...COLUMNS.map((c) => c.key), "source", "order", "verified"];
    const header = ["Page", ...COLUMNS.map((c) => c.label), "Source", "Order", "Verified"].map(esc).join(",");
    const body = rows().map((row) => cols.map((k) => esc(row[k])).join(","));
    download(new Blob([[header, ...body].join("\n")], { type: "text/csv" }), "labels-verified.csv");
  };
  const downloadJson = () =>
    download(new Blob([JSON.stringify(rows(), null, 2)], { type: "application/json" }), "labels-verified.json");

  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="review-summary">
        <div>
          <strong>{records.length}</strong> pages ·{" "}
          <span className="good">{records.filter((r) => r.fields.tracking_number?.confidence === "certain").length} AWB barcode-confirmed</span> ·{" "}
          <span className="good">{records.filter((r) => r.matchStatus === "shopify").length} Shopify phone</span> ·{" "}
          <span className="warn">{records.filter((r) => r.matchStatus === "manual").length} manual/WA</span> ·{" "}
          {verifiedCount} verified
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          <button className="ghost" onClick={downloadCsv}>Download CSV</button>
          <button className="ghost" onClick={downloadJson}>Download JSON</button>
        </div>
      </div>

      <p className="note" style={{ marginBottom: 16 }}>
        Tracking numbers marked <span className="badge bc">barcode ✓</span> are decoded exactly from the
        label barcode — no OCR error possible. Cells outlined <span className="warn">in amber</span> failed a
        validation check or lacked a reliable source: eyeball them against the thumbnail, fix if needed, then
        mark the page verified. Export reflects your edits.
      </p>

      <div className="cards">
        {records.map((r) => {
          const isVer = !!verified[r.page];
          return (
            <div key={r.page} className={`review-card${r.needsReview && !isVer ? " flagged" : ""}${isVer ? " verified" : ""}`}>
              <div className="thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.thumbnail} alt={`Page ${r.page}`} onClick={() => setZoom(r.thumbnail)} />
                <div className="thumb-label">Page {r.page}</div>
              </div>
              <div className="fields">
                {COLUMNS.map((c) => {
                  const f = r.fields[c.key];
                  const low = f?.confidence === "low";
                  const certain = f?.confidence === "certain";
                  const badgeText =
                    f?.source === "barcode" ? "barcode ✓" : f?.source === "shopify" ? "Shopify ✓" : null;
                  return (
                    <div className="field-row" key={c.key}>
                      <label>
                        {c.label}
                        {certain && badgeText && <span className="badge bc">{badgeText}</span>}
                        {f?.flag && <span className="badge warn-badge">{f.flag}</span>}
                      </label>
                      <input
                        className={low ? "low" : certain ? "certain" : ""}
                        value={edits[r.page]?.[c.key] ?? ""}
                        onChange={(e) => setVal(r.page, c.key, e.target.value)}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="card-actions">
                <div className="match-info">
                  {r.matchStatus === "manual" ? (
                    <span className="status-pill manual">Manual / WA</span>
                  ) : (
                    <>
                      <span className="status-pill shopify">Shopify</span>
                      {r.matchedOrder && <span className="match-order">{r.matchedOrder}</span>}
                    </>
                  )}
                  {r.matchStatus !== "manual" && (
                    <span className="match-reasons">{(r.matchReasons || []).join(" · ")}</span>
                  )}
                </div>
                <label className="verify-toggle">
                  <input type="checkbox" checked={isVer} onChange={(e) => setVerified((v) => ({ ...v, [r.page]: e.target.checked }))} />
                  Verified
                </label>
              </div>
            </div>
          );
        })}
      </div>

      {zoom && (
        <div className="lightbox" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="Zoomed page" />
        </div>
      )}
    </div>
  );
}
```

---

### 6.9 `app/components/JubelioPanel.tsx` — panel sync

Hanya baris yang **`matchStatus === "shopify"` + punya `legacyId` + punya AWB** yang
memenuhi syarat. Alurnya: **Preview** → tabel status per baris → tombol **Push N to Jubelio**
(hanya baris `writable`). Setelah push, panel menunggu 6 detik lalu preview ulang, karena
Jubelio memproses AWB secara asinkron dan pembacaan langsung masih menampilkan state lama.

```tsx
"use client";

import { useMemo, useState } from "react";
import type { VerifyRecord } from "./ReviewPanel";

type PreviewRow = {
  page: number;
  found: boolean;
  salesorderId: number | null;
  salesorderNo: string | null;
  currentTracking: string | null;
  refMatch: boolean;
  writable: boolean;
  awb: string;
  courier: string;
  status: string;
};

type PushRow = { page: number; ok: boolean; error?: string; salesorderNo?: string };

type JInput = { page: number; name: string; legacyId: string; zip: string; awb: string; courier: string };

export default function JubelioPanel({ records }: { records: VerifyRecord[] }) {
  const [preview, setPreview] = useState<Record<number, PreviewRow> | null>(null);
  const [pushed, setPushed] = useState<Record<number, PushRow>>({});
  const [busy, setBusy] = useState<"" | "preview" | "push">("");
  const [error, setError] = useState<string | null>(null);

  // Only Shopify-matched rows with a barcode AWB can be pushed to Jubelio.
  const inputs = useMemo<JInput[]>(
    () =>
      records
        .filter((r) => r.matchStatus === "shopify" && r.legacyId && r.fields.tracking_number?.value)
        .map((r) => ({
          page: r.page,
          name: r.fields.recipient_name?.value || "",
          legacyId: r.legacyId || "",
          zip: (r.fields.recipient_address?.value || "").match(/\b\d{5}\b/)?.[0] || "",
          awb: r.fields.tracking_number?.value || "",
          courier: r.fields.courier?.value || "",
        })),
    [records],
  );

  const recByPage = useMemo(() => {
    const m: Record<number, VerifyRecord> = {};
    for (const r of records) m[r.page] = r;
    return m;
  }, [records]);

  const runPreview = async () => {
    setBusy("preview");
    setError(null);
    setPushed({});
    try {
      const res = await fetch("/api/jubelio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "preview", rows: inputs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Preview failed.");
      const map: Record<number, PreviewRow> = {};
      for (const r of data.results as PreviewRow[]) map[r.page] = r;
      setPreview(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setBusy("");
    }
  };

  const writableInputs = useMemo(
    () => (preview ? inputs.filter((i) => preview[i.page]?.writable) : []),
    [preview, inputs],
  );

  const runPush = async () => {
    if (!writableInputs.length) return;
    setBusy("push");
    setError(null);
    try {
      const res = await fetch("/api/jubelio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "push", rows: writableInputs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Push failed.");
      const map: Record<number, PushRow> = {};
      for (const r of data.results as PushRow[]) map[r.page] = r;
      setPushed(map);
      // Jubelio processes the AWB asynchronously, so wait a few seconds before
      // re-reading — otherwise the order may still show its old (empty) state.
      setTimeout(() => runPreview(), 6000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Push failed.");
    } finally {
      setBusy("");
    }
  };

  if (!inputs.length) return null;

  const writableCount = writableInputs.length;

  return (
    <div className="card">
      <div className="review-summary">
        <div>
          <strong>Sync to Jubelio</strong> — write courier + AWB (No. Resi) into the matching Jubelio
          order. {inputs.length} Shopify-matched label{inputs.length === 1 ? "" : "s"} eligible.
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          <button className="ghost" onClick={runPreview} disabled={!!busy}>
            {busy === "preview" ? "Checking…" : "Preview"}
          </button>
          <button className="primary" onClick={runPush} disabled={!!busy || !writableCount} style={{ padding: "8px 16px" }}>
            {busy === "push" ? "Writing…" : `Push ${writableCount} to Jubelio`}
          </button>
        </div>
      </div>

      {error && <div className="error">⚠ {error}</div>}

      {preview && (
        <div className="table-scroll" style={{ marginTop: 8 }}>
          <table className="grid">
            <thead>
              <tr>
                <th>Pg</th>
                <th>Penerima</th>
                <th>Courier</th>
                <th>AWB / Resi</th>
                <th>Jubelio SO</th>
                <th>Current resi</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {inputs.map((i) => {
                const p = preview[i.page];
                const done = pushed[i.page];
                const cls = done?.ok ? "good" : p?.writable ? "good" : p?.found ? "warn" : "";
                return (
                  <tr key={i.page}>
                    <td>{i.page}</td>
                    <td>{recByPage[i.page]?.fields.recipient_name?.value || ""}</td>
                    <td>{i.courier}</td>
                    <td style={{ fontFamily: "ui-monospace, monospace" }}>{i.awb}</td>
                    <td>{p?.salesorderNo || (p?.found ? p?.salesorderId : "—")}</td>
                    <td>{p?.currentTracking || "—"}</td>
                    <td className={cls}>
                      {done ? (done.ok ? "✓ written" : `✗ ${done.error}`) : p?.status || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="note" style={{ marginTop: 10 }}>
        Matching is exact: each Jubelio order is confirmed by <code>ref_no</code> = the Shopify order
        id, and orders that already have a resi are never overwritten. Preview shows what will be
        written; nothing is sent to Jubelio until you press Push.
      </p>
    </div>
  );
}
```

---

### 6.10 `app/page.tsx` — orkestrasi client

Urutan: pilih file → `extractFromFile()` (OCR browser) → `reconcile()` → `POST /api/match` →
merge hasil → render statistik + ReviewPanel + JubelioPanel.

Aturan merge yang **wajib dipertahankan**: hasil Shopify hanya dipakai kalau
`confidence === "certain"`. Selain itu → `matchStatus: "manual"`, HP dikosongkan, dan diberi
flag *"Not in Shopify — likely a direct/WhatsApp order"*. Tidak pernah menampilkan tebakan
yang terlihat meyakinkan.

```tsx
"use client";

import { useCallback, useRef, useState } from "react";
import ReviewPanel, { VerifyRecord } from "./components/ReviewPanel";
import JubelioPanel from "./components/JubelioPanel";
import { extractFromFile, type Progress } from "./lib/browserOcr";
import { reconcile } from "./lib/labelCore";

type Result = {
  records: VerifyRecord[];
  reviewCount: number;
  barcodeConfirmed: number;
  phoneMatched: number;
  pageCount: number;
  elapsedMs: number;
};

type MatchResult = {
  phone: string | null;
  name: string | null;
  address: string | null;
  orderName: string | null;
  legacyId: string | null;
  confidence: "certain" | "high" | "low";
  reasons: string[];
  flag: string | null;
};

// Labels print ship date as DD-MM-YYYY; normalize to ISO, rejecting implausible
// OCR years so the Shopify window falls back to recent orders instead.
function normalizeShipDate(raw: string | null | undefined): string {
  if (raw) {
    const m = raw.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
    if (m) {
      const dd = +m[1], mm = +m[2];
      const yr = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      if (yr >= 2023 && yr <= 2028 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31)
        return `${yr}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
  }
  return "";
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pickFile = useCallback((f: File | null) => {
    setError(null);
    setResult(null);
    if (!f) return;
    const looksOk = /\.(pdf|png|jpe?g|webp)$/i.test(f.name) || /^(application\/pdf|image\/)/i.test(f.type);
    if (!looksOk) {
      setError("Please choose a PDF or an image (PNG/JPG) file.");
      return;
    }
    setFile(f);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      pickFile(e.dataTransfer.files?.[0] ?? null);
    },
    [pickFile],
  );

  const submit = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setProgress(null);
    const started = Date.now();
    try {
      // 1) OCR entirely in the browser — the file never leaves this device.
      const { visuals, rows } = await extractFromFile(file, setProgress);
      const records = reconcile(rows, visuals) as VerifyRecord[];

      // 2) Cross-check recipients against Shopify (tiny, fast server call).
      setProgress({ stage: "Matching Shopify orders" });
      const shipDate = normalizeShipDate(rows.find((r) => r.ship_date)?.ship_date);
      const inputs = records.map((r) => ({
        page: r.page,
        name: r.fields.recipient_name?.value || "",
        zip: (r.fields.recipient_address?.value || "").match(/\b\d{5}\b/)?.[0] || "",
        phoneLast4: r.phoneLast4 || "",
        shipDate,
      }));
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs }),
      });
      const raw = await res.text();
      let data: { matches?: Record<number, MatchResult>; error?: string };
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(`Shopify lookup failed (${res.status}).`);
      }
      if (!res.ok) throw new Error(data.error || "Shopify lookup failed.");
      const matches = data.matches || {};

      // 3) Merge matches — trust Shopify's clean contact only when certain.
      for (const r of records) {
        const m = matches[r.page];
        if (m && m.confidence === "certain") {
          r.fields.phone = { value: m.phone, source: "shopify", confidence: "certain", flag: null };
          r.matchedOrder = m.orderName;
          r.matchReasons = m.reasons;
          r.matchStatus = "shopify";
          r.legacyId = m.legacyId;
          if (m.name) r.fields.recipient_name = { value: m.name, source: "shopify", confidence: "certain", flag: null };
          if (m.address) r.fields.recipient_address = { value: m.address, source: "shopify", confidence: "certain", flag: null };
        } else {
          r.fields.phone = {
            value: null,
            source: "none",
            confidence: "low",
            flag: "Not in Shopify — likely a direct/WhatsApp order. Enter phone manually.",
          };
          r.matchedOrder = null;
          r.matchReasons = [];
          r.matchStatus = "manual";
        }
        r.needsReview = Object.values(r.fields).some((f) => f.confidence === "low");
      }

      setResult({
        records,
        pageCount: records.length,
        barcodeConfirmed: records.filter((r) => r.fields.tracking_number?.confidence === "certain").length,
        phoneMatched: records.filter((r) => r.matchStatus === "shopify").length,
        reviewCount: records.filter((r) => r.needsReview).length,
        elapsedMs: Date.now() - started,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Processing failed.");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }, [file]);

  const fmt = (n: number | null) => (n == null ? "—" : n.toLocaleString());
  const btnLabel = loading
    ? progress?.page && progress?.total
      ? `${progress.stage} ${progress.page}/${progress.total}…`
      : `${progress?.stage ?? "Processing"}…`
    : "Extract & match";

  return (
    <div className="wrap">
      <header>
        <h1>Resi → Data Kurir · AWB · No. HP</h1>
        <p>
          Upload a shipping-label PDF or photo. Everything is read on your device — the barcode
          AWB, the label text, and the recipient — then only the name/postcode is checked against
          your Shopify orders to pull the phone number. The file never leaves your browser.
        </p>
      </header>

      <div className="card">
        <div
          className={`dropzone${drag ? " drag" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
        >
          <div>
            <strong>Drop a PDF or image here</strong> or click to browse
          </div>
          <div className="hint">PDF or photo (PNG / JPG) of shipping labels</div>
          {file && <div className="file">📄 {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</div>}
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            style={{ display: "none" }}
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="controls" style={{ justifyContent: "flex-end" }}>
          <button className="primary" disabled={!file || loading} onClick={submit}>
            {loading && <span className="spinner" />}
            {btnLabel}
          </button>
        </div>

        {error && <div className="error">⚠ {error}</div>}
      </div>

      {result && (
        <div className="card">
          <div className="stats">
            <div className="stat">
              <div className="k">Pages</div>
              <div className="v">{fmt(result.pageCount)}</div>
            </div>
            <div className="stat">
              <div className="k">AWB confirmed</div>
              <div className="v good">{fmt(result.barcodeConfirmed)}</div>
            </div>
            <div className="stat">
              <div className="k">Phone matched</div>
              <div className="v good">{fmt(result.phoneMatched)}</div>
            </div>
            <div className="stat">
              <div className="k">Need review</div>
              <div className="v" style={{ color: result.reviewCount > 0 ? "var(--danger)" : "var(--accent)" }}>
                {fmt(result.reviewCount)}
              </div>
            </div>
            <div className="stat">
              <div className="k">Time</div>
              <div className="v">{(result.elapsedMs / 1000).toFixed(1)}s</div>
            </div>
          </div>

          <ReviewPanel records={result.records} />
        </div>
      )}

      {result && <JubelioPanel records={result.records} />}

      <p className="note">
        On-device OCR: pages are rendered and read in your browser (pdf.js + Tesseract + barcode
        decoding). Only the extracted name and postcode are sent to the server to look up the phone
        number in Shopify — the PDF, photo, and thumbnails stay on your machine.
      </p>
    </div>
  );
}
```

---

### 6.11 `app/layout.tsx`

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resi → Kurir · AWB · No. HP",
  description: "On-device shipping-label OCR with barcode AWB and Shopify phone matching.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* suppressHydrationWarning: browser extensions (e.g. ColorZilla) inject
          attributes like cz-shortcut-listen onto <body> before React hydrates. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
```

`suppressHydrationWarning` dipakai karena ekstensi browser (mis. ColorZilla) menyuntik atribut
ke `<body>` sebelum React hydrate.

---

### 6.12 `app/globals.css`

Tema gelap, tanpa framework CSS (tidak ada Tailwind — semua class ditulis manual).
Class kunci: `.wrap .card .dropzone .stats .review-card .field-row .badge .status-pill .lightbox`.

```css
:root {
  --bg: #0b0f14;
  --panel: #121821;
  --panel-2: #0e141c;
  --border: #22303f;
  --text: #e6edf3;
  --muted: #8aa0b4;
  --accent: #4cc38a;
  --accent-2: #3b82f6;
  --danger: #f87171;
  --radius: 12px;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}

.wrap {
  max-width: 960px;
  margin: 0 auto;
  padding: 40px 20px 80px;
}

header h1 {
  font-size: 26px;
  margin: 0 0 6px;
  letter-spacing: -0.02em;
}
header p {
  margin: 0 0 28px;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.5;
}

.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  margin-bottom: 20px;
}

.dropzone {
  border: 1.5px dashed var(--border);
  border-radius: var(--radius);
  padding: 34px 20px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  background: var(--panel-2);
}
.dropzone.drag { border-color: var(--accent); background: #101a16; }
.dropzone strong { color: var(--text); }
.dropzone .hint { color: var(--muted); font-size: 13px; margin-top: 6px; }
.dropzone .file { color: var(--accent); font-size: 14px; margin-top: 10px; font-weight: 600; word-break: break-all; }

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: flex-end;
  margin-top: 18px;
}
.field { display: flex; flex-direction: column; gap: 6px; }
.field label { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
select {
  background: var(--panel-2);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 14px;
  min-width: 190px;
}

button.primary {
  background: var(--accent);
  color: #05130c;
  border: none;
  border-radius: 8px;
  padding: 11px 22px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s;
}
button.primary:disabled { opacity: 0.45; cursor: not-allowed; }

.error {
  color: var(--danger);
  background: #1e1214;
  border: 1px solid #4a2226;
  border-radius: 8px;
  padding: 12px 14px;
  font-size: 14px;
  margin-top: 16px;
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}
.stat {
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
}
.stat .k { font-size: 12px; color: var(--muted); }
.stat .v { font-size: 20px; font-weight: 700; margin-top: 4px; }
.stat .v.good { color: var(--accent); }

.toolbar { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
button.ghost {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
}
button.ghost:hover { border-color: var(--accent); }

pre.output {
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 640px;
  overflow-y: auto;
  margin: 0;
}

table.grid {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
table.grid th, table.grid td {
  border: 1px solid var(--border);
  padding: 7px 9px;
  text-align: left;
  vertical-align: top;
}
table.grid th { background: var(--panel-2); color: var(--muted); position: sticky; top: 0; }
.table-scroll { overflow: auto; max-height: 640px; border-radius: 10px; }

.spinner {
  display: inline-block;
  width: 15px; height: 15px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #05130c;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  vertical-align: -2px;
  margin-right: 8px;
}
@keyframes spin { to { transform: rotate(360deg); } }

.note { font-size: 12.5px; color: var(--muted); line-height: 1.6; }
.note code { background: var(--panel-2); padding: 1px 5px; border-radius: 4px; }

/* ---- Review panel (world-class verify) ---- */
.good { color: var(--accent); }
.warn { color: #f5a623; }

.review-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 14px;
  margin-bottom: 14px;
}

.cards { display: flex; flex-direction: column; gap: 16px; }

.review-card {
  display: grid;
  grid-template-columns: 200px 1fr auto;
  gap: 18px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  align-items: start;
}
.review-card.flagged { border-color: #7a5a1a; background: #16130c; }
.review-card.verified { border-color: var(--accent); background: #0d1712; }

.thumb { position: relative; }
.thumb img {
  width: 100%;
  border-radius: 8px;
  border: 1px solid var(--border);
  cursor: zoom-in;
  background: #fff;
  display: block;
}
.thumb-label {
  position: absolute;
  top: 6px;
  left: 6px;
  background: rgba(0,0,0,0.65);
  color: #fff;
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 5px;
}

.fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 14px;
}
.field-row { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.field-row label {
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.field-row input {
  background: var(--panel);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 8px 10px;
  font-size: 13px;
  width: 100%;
}
.field-row input.low { border-color: #f5a623; background: #1c160a; }
.field-row input.certain { border-color: #2c6b4f; }
.field-row input:focus { outline: none; border-color: var(--accent-2); }

.badge {
  font-size: 9.5px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 20px;
  text-transform: none;
  letter-spacing: 0;
}
.badge.bc { background: #10331f; color: var(--accent); border: 1px solid #2c6b4f; }
.badge.warn-badge { background: #33260a; color: #f5a623; border: 1px solid #7a5a1a; }

.card-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; justify-content: space-between; }
.match-info { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
.match-order { font-size: 13px; font-weight: 700; color: var(--accent-2); }
.match-reasons { font-size: 10px; color: var(--muted); max-width: 150px; }
.status-pill { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px; }
.status-pill.shopify { background: #10251c; color: var(--accent); border: 1px solid #2c6b4f; }
.status-pill.manual { background: #33260a; color: #f5a623; border: 1px solid #7a5a1a; }
.verify-toggle {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
  white-space: nowrap;
}
.verify-toggle input { width: 17px; height: 17px; accent-color: var(--accent); cursor: pointer; }

.lightbox {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  cursor: zoom-out;
  padding: 30px;
}
.lightbox img {
  max-width: 92vw;
  max-height: 92vh;
  border-radius: 8px;
  background: #fff;
}

@media (max-width: 720px) {
  .review-card { grid-template-columns: 1fr; }
  .fields { grid-template-columns: 1fr; }
}
```

---

## 7. Jalankan & verifikasi

```bash
npm run dev      # http://localhost:3000
```

Checklist verifikasi manual (pakai satu PDF berisi 10–15 label asli):

| # | Yang dicek | Ekspektasi |
|---|---|---|
| 1 | Upload PDF multi-halaman | jumlah kartu = jumlah halaman |
| 2 | Statistik "AWB confirmed" | mendekati 100% (barcode dibaca ≥2×) |
| 3 | Bandingkan AWB di kartu vs label fisik | **identik** — kalau tidak, region crop salah |
| 4 | Statistik "Phone matched" | order yang ada di Shopify semuanya hijau |
| 5 | Label order WhatsApp (tidak ada di Shopify) | tampil `Manual / WA`, HP kosong — **bukan** nomor orang lain |
| 6 | Edit satu field lalu export CSV | nilai hasil edit yang keluar |
| 7 | Upload foto JPG satu label | tetap jalan (path non-PDF) |
| 8 | Network tab saat proses | **tidak ada** upload file; hanya `POST /api/match` berukuran beberapa KB |
| 9 | Jubelio → Preview | status per baris masuk akal; tidak ada tulisan terkirim |
| 10 | Jubelio → Push | hanya baris `ready to write` yang tertulis; yang sudah punya resi di-skip |

Tolok ukur dari batch contoh (J&T + Lion): **13/13 AWB terkonfirmasi barcode, 12/13 HP
tercocokkan dengan `certain`, 1 manual**. Kalau hasil rebuild jauh di bawah ini, curigai
(a) region crop barcode, (b) render scale, (c) protected customer data Shopify.

Debug cepat kalau matching meleset — tambahkan sementara di `matchAgainstPool()`:

```ts
console.log(inp.name, inp.zip, inp.phoneLast4, "→", best?.orderName, bestScore, bestReasons);
```

lalu lihat log function di terminal `next dev` (bukan console browser — ini jalan di server).

---

## 8. Deployment ke Vercel

```bash
npm i -g vercel@latest
vercel link
vercel env add STORE_NAME production        # nilainya diketik saat prompt, JANGAN "NAME=value"
vercel env add ADMIN_API_KEY production
vercel env add JUBELIO_API_USERNAME production
vercel env add JUBELIO_API_PASSWORD production
vercel --prod
```

Catatan:

- Tambahkan juga env untuk environment **preview** kalau mau preview deployment ikut berfungsi
  (`vercel env add NAMA preview`).
- `vercel env pull .env.local --yes` untuk menarik env ke lokal.
- Tidak perlu `runtime = "edge"` di mana pun. Route handler pakai Node.js runtime
  (Fluid Compute) — cocok karena hanya melakukan `fetch` ke API eksternal.
- Bundle client cukup besar (pdf.js + tesseract + zxing wasm) tapi semuanya di-load
  di browser, jadi tidak memengaruhi biaya function.
- Untuk membatasi akses: pakai **Deployment Protection** (Settings → Deployment Protection)
  alih-alih `APP_PASSWORD` — lihat Gotcha #2.

---

## 9. Mengadaptasi ke kasus lain

| Mau ganti apa | Sentuh file mana |
|---|---|
| Tambah kurir baru (AWB pattern) | `labelCore.ts` → `AWB_RE`, `normalizeCourier()`; `localExtract.ts` → `normalizeCourier()` |
| Layout label berbeda (posisi barcode) | `browserOcr.ts` → array `regions` di `decodePage()` |
| Template teks berbeda (bukan "Penerima/Pengirim") | `localExtract.ts` → `penIdx`/`sengIdx` + regex boundary |
| Field tambahan di kartu review | `labelCore.ts` → `FIELD_KEYS`; `ReviewPanel.tsx` → `COLUMNS` |
| Sumber order selain Shopify | ganti `shopify.ts` (pertahankan bentuk `MatchInput`/`MatchResult`) |
| ERP selain Jubelio | ganti `jubelio.ts` + `api/jubelio/route.ts` (pertahankan pola preview→push) |
| Ambang kepercayaan lebih ketat/longgar | `shopify.ts` → blok penentuan `confidence` |
| Bahasa OCR | `browserOcr.ts` → `createWorker("ind+eng")` |

Kalau memindahkan ini ke **produk lain dengan dokumen berbeda** (invoice, KTP, dsb.),
yang bisa dipakai ulang apa adanya adalah: pipeline render→barcode→OCR→parse (`browserOcr.ts`),
pola `Field {value, source, confidence, flag}`, dan UI review + export. Yang harus ditulis
ulang: parser (`localExtract.ts`) dan matcher.

---

## 10. Ringkasan gotchas

1. **Versi `pdf.worker.min.mjs` di `public/` harus sama dengan `pdfjs-dist`** → pakai `postinstall`.
2. **`APP_PASSWORD` akan mematikan app** karena client tidak mengirim header `x-app-password`.
3. **pdfjs v6 `page.render()` butuh properti `canvas`**, bukan hanya `canvasContext` + `viewport`.
4. **Tesseract traineddata di-download runtime** dari CDN — set `langPath` kalau butuh offline/CSP.
5. **Protected customer data Shopify** — tanpa izin, `shippingAddress.phone` `null` → semua match `low`.
6. **`STORE_NAME` tanpa `https://`** — kode menyusun URL sendiri (`https://${store}/admin/...`).
7. **Pool dibatasi 8×100 order**; toko besar dengan window 40 hari bisa terpotong — sesuaikan.
8. **Jubelio asinkron** — jangan langsung baca ulang setelah push (panel menunggu 6 detik).
9. **`save-airwaybill` butuh picklist**; order yang belum diproses akan ditolak Jubelio.
10. **File PDF/foto berisi PII** — pastikan `.gitignore` memblokir `*.pdf`, `*.jpg`, `*.png`.
11. **Thumbnail disimpan sebagai data-URL di memori**; PDF ratusan halaman bisa berat —
    turunkan lebar thumbnail atau simpan sebagai blob URL kalau perlu.

---

## 11. Peta file akhir

```
resi-app/
├── app/
│   ├── api/
│   │   ├── jubelio/route.ts     # preview + push AWB ke Jubelio (opsional)
│   │   └── match/route.ts       # satu-satunya pemakai token Shopify
│   ├── components/
│   │   ├── JubelioPanel.tsx     # UI sync ERP
│   │   └── ReviewPanel.tsx      # kartu review + export CSV/JSON
│   ├── lib/
│   │   ├── browserOcr.ts        # pdf.js + zxing + tesseract (client)
│   │   ├── jubelio.ts           # klien Jubelio (server)
│   │   ├── labelCore.ts         # tipe + reconcile (pure)
│   │   ├── localExtract.ts      # parser teks OCR (pure)
│   │   └── shopify.ts           # matcher pool-based (server)
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                 # orkestrasi client
├── public/
│   └── pdf.worker.min.mjs       # disalin dari node_modules/pdfjs-dist/build/
├── .env.local                   # STORE_NAME, ADMIN_API_KEY, JUBELIO_*
├── .gitignore
├── next.config.mjs
├── package.json
└── tsconfig.json
```

## 12. Checklist rebuild

- [ ] `npm install` + versi dependensi terkunci
- [ ] `public/pdf.worker.min.mjs` tersalin & versinya cocok
- [ ] `tsconfig.json` punya alias `@/*`
- [ ] `.env.local` terisi; `STORE_NAME` tanpa `https://`
- [ ] Shopify custom app punya scope `read_orders` + akses protected customer data
- [ ] 12 file di bagian 6 tersalin lengkap
- [ ] `npm run dev` → upload PDF contoh → statistik masuk akal
- [ ] Verifikasi 10 poin di bagian 7
- [ ] Env di Vercel (production + preview) → `vercel --prod`
- [ ] `APP_PASSWORD` **tidak** di-set (atau gate-nya diperbaiki dulu)
