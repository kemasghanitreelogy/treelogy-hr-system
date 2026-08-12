import "server-only";

/* ============================================================
   Penulis baris ke Google Sheets.

   Aplikasi tidak bisa meminjam akses editor milik pengguna — server punya
   identitasnya sendiri. Disediakan DUA jalur kredensial; yang aktif dipilih
   otomatis dari env, jadi mengganti jalur tidak menyentuh kode pemanggil.

   Jalur A — Apps Script Web App (paling sederhana, tanpa GCP):
     Di sheet: Extensions → Apps Script, tempel doPost yang menambah baris,
     Deploy → Web app → Execute as "Me", Who has access "Anyone".
       SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/…/exec
       SHEETS_WEBHOOK_SECRET=<rahasia bebas, dicocokkan di skripnya>

   Jalur B — Service account (cara resmi Google API):
     Buat service account di GCP, unduh JSON, lalu BAGIKAN sheet-nya ke email
     service account itu sebagai Editor.
       GOOGLE_SERVICE_ACCOUNT_EMAIL=…@….iam.gserviceaccount.com
       GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n…"
       GOOGLE_SHEET_ID=1cBVWKsVpFRRmQzfC6rEhhKOKo90tPDzWBc1oN0pkcqg
       GOOGLE_SHEET_TAB=Form responses 1

   Kalau tidak ada satu pun yang diisi, appendSheetRow() mengembalikan
   { ok:false, reason:"not_configured" } — pengajuan TETAP tersimpan di
   database dan bisa disinkronkan ulang, tidak ada data yang hilang.
   ============================================================ */

export type SheetResult = { ok: true } | { ok: false; reason: string };

const WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.SHEETS_WEBHOOK_SECRET;
const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SA_KEY = process.env.GOOGLE_PRIVATE_KEY;
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_TAB = process.env.GOOGLE_SHEET_TAB ?? "Form responses 1";

export function sheetsMode(): "webhook" | "service_account" | "none" {
  if (WEBHOOK_URL && WEBHOOK_SECRET) return "webhook";
  if (SA_EMAIL && SA_KEY && SHEET_ID) return "service_account";
  return "none";
}

/** Tanda tangan JWT RS256 memakai WebCrypto — tanpa dependency tambahan. */
async function signJwt(email: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const b64 = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64(header)}.${b64(claim)}`;

  // PEM → DER → CryptoKey
  const pem = privateKey.replace(/\\n/g, "\n");
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Buffer.from(body, "base64");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, Buffer.from(unsigned));
  return `${unsigned}.${Buffer.from(sig).toString("base64url")}`;
}

async function accessToken(): Promise<string | null> {
  try {
    const jwt = await signJwt(SA_EMAIL!, SA_KEY!);
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Tambahkan satu baris ke akhir sheet. Nilai dikirim apa adanya (string/number)
 * dan urutannya harus sama persis dengan urutan kolom di sheet.
 * Best-effort: tidak pernah melempar — pemanggil menyimpan hasilnya.
 */
export async function appendSheetRow(
  values: (string | number)[],
  /**
   * Pemetaan {penggalan-nama-kolom: nilai}. Kalau diisi, Apps Script menaruh
   * setiap nilai ke kolom yang namanya cocok — urutan kolom di sheet tidak lagi
   * berpengaruh. `values` tetap dikirim sebagai cadangan untuk jalur lama.
   */
  record?: Record<string, string | number>,
): Promise<SheetResult> {
  const mode = sheetsMode();
  if (mode === "none") return { ok: false, reason: "not_configured" };

  try {
    if (mode === "webhook") {
      // Sengaja mengirim `values` (posisi) SAJA, bukan `record` (nama kolom).
      //
      // Pemetaan-nama tadinya dipilih supaya tahan kalau Finance menggeser kolom.
      // Kenyataannya yang berubah justru TEKS HEADER-nya: sel A1 sempat berisi
      // "Timestamp" lalu menjadi "Column 1", sehingga tidak ada kolom yang cocok
      // dan stempel waktu diam-diam dilewati. Baris header ternyata lebih rapuh
      // daripada urutan kolom — urutan A–K sudah stabil sepanjang 140 baris.
      //
      // `record` tetap dikirim sebagai cadangan HANYA bila skrip lama masih
      // terpasang; skrip terbaru mengutamakan `record` bila ada, jadi di sini
      // ia sengaja tidak disertakan.
      void record;
      const res = await fetch(WEBHOOK_URL!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: WEBHOOK_SECRET, values }),
      });
      if (!res.ok) return { ok: false, reason: `webhook_${res.status}` };
      const text = (await res.text()).slice(0, 200);
      // Apps Script membalas 200 walau gagal di dalam — periksa isinya.
      //
      // Sengaja TIDAK mensyaratkan balasan diawali "ok": Google kadang menyajikan
      // halaman antara (HTML) pada tahap redirect PADAHAL doPost sudah menulis
      // barisnya. Menganggap itu gagal akan memicu kirim ulang → BARIS GANDA di
      // sheet keuangan. Baris hilang lebih mudah ditemukan (jumlahnya beda)
      // daripada baris ganda yang diam-diam menggandakan total.
      if (/error|unauthor/i.test(text)) return { ok: false, reason: `webhook_body:${text}` };
      return { ok: true };
    }

    const token = await accessToken();
    if (!token) return { ok: false, reason: "auth_failed" };
    const range = encodeURIComponent(`${SHEET_TAB}!A1`);
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}` +
      `:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [values] }),
    });
    if (!res.ok) return { ok: false, reason: `sheets_${res.status}:${(await res.text()).slice(0, 160)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message.slice(0, 160) : "unknown" };
  }
}
