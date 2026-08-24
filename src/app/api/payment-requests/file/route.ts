import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyFileToken } from "@/lib/file-link";

export const runtime = "nodejs";

/**
 * Membuka lampiran pengajuan pembayaran.
 *
 * Dua jalur, dan urutannya penting:
 *
 * 1. TAUTAN BERTANDA TANGAN (`&t=…`) — dipakai baris di Google Sheet keuangan.
 *    Tanda tangan HMAC membuktikan tautan itu memang diterbitkan sistem untuk
 *    path tersebut, jadi pembuka tidak perlu punya akun aplikasi HR. Ini yang
 *    membuat Finance, atasan, atau auditor bisa membuka lampiran langsung dari
 *    sheet — sebelumnya mereka mentok di halaman login.
 *
 * 2. TANPA TANDA TANGAN — perilaku lama dipertahankan: wajib login dan tunduk
 *    pada Storage RLS. Tautan lama yang sudah terlanjur ada di sheet tetap
 *    berfungsi bagi yang berhak, tidak mendadak rusak.
 *
 * Bucket-nya sendiri tetap PRIVAT. Yang dibagikan hanyalah izin untuk satu path,
 * bukan akses ke seluruh berkas.
 */
/**
 * Halaman pesan yang bisa dibaca manusia.
 *
 * Tautan ini dibuka dari Google Sheet oleh Finance, atasan, kadang auditor —
 * bukan oleh pengembang. Membalas `{"error":"not_found"}` mentah tidak memberi
 * tahu apa pun: tidak jelas apakah berkasnya hilang, tautannya salah, atau
 * mereka perlu masuk dulu. Setiap sebab karena itu dijelaskan apa adanya
 * beserta langkah yang bisa mereka ambil.
 */
function pesan(judul: string, isi: string, status: number) {
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${judul} — Treelogy Workspace</title>
<style>
  body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#f6f4ea;
       font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#1f241b;padding:24px}
  .kotak{max-width:26rem;background:#fff;border:1px solid #e2e0d2;border-radius:1.25rem;
       padding:28px;box-shadow:0 1px 2px rgba(31,46,26,.04),0 6px 20px rgba(31,46,26,.06)}
  h1{margin:0 0 8px;font-size:1.125rem;letter-spacing:-.015em}
  p{margin:0;font-size:.875rem;line-height:1.6;color:#5c6354}
  .tanda{width:40px;height:40px;border-radius:9999px;background:#f3ddd3;color:#8c3c1f;
       display:grid;place-items:center;font-size:20px;margin-bottom:14px}
  .kaki{margin-top:18px;font-size:.75rem;color:#6e7463}
</style></head><body><div class="kotak">
<div class="tanda">!</div><h1>${judul}</h1><p>${isi}</p>
<p class="kaki">Treelogy Workspace · Lampiran pengajuan pembayaran</p>
</div></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  const token = url.searchParams.get("t");
  if (!path) {
    return pesan("Tautan tidak lengkap",
      "Alamat berkas tidak disertakan. Salin ulang tautannya dari kolom lampiran di Google Sheet.", 400);
  }

  // --- Jalur 1: tautan bertanda tangan, tanpa perlu login ---
  if (verifyFileToken(path, token)) {
    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });
    const { data, error } = await admin.storage.from("payment-files").createSignedUrl(path, 120);
    if (error || !data?.signedUrl) {
      return pesan("Berkas sudah tidak ada",
        "Tautannya sah, tetapi berkasnya tidak lagi tersimpan — biasanya karena pengajuannya sudah dihapus. Hubungi HR bila lampiran ini masih dibutuhkan.", 404);
    }
    return NextResponse.redirect(data.signedUrl);
  }

  // --- Jalur 2: tanpa tanda tangan → wajib login, dibatasi Storage RLS ---
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return pesan("Tautan lama, perlu masuk dulu",
      "Tautan ini dibuat sebelum sistem menerbitkan tautan yang bisa dibuka siapa pun. Masuk ke aplikasi Treelogy Workspace lalu buka lagi, atau minta HR mengirimkan tautan terbarunya.", 401);
  }

  const { data, error } = await supabase.storage.from("payment-files").createSignedUrl(path, 120);
  if (error || !data?.signedUrl) {
    return pesan("Berkas tidak bisa dibuka",
      "Berkasnya sudah tidak tersimpan, atau akun Anda tidak berhak membukanya. Minta HR mengirimkan tautan terbarunya.", 404);
  }
  return NextResponse.redirect(data.signedUrl);
}
