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
export async function GET(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  const token = url.searchParams.get("t");
  if (!path) return NextResponse.json({ error: "missing_path" }, { status: 400 });

  // --- Jalur 1: tautan bertanda tangan, tanpa perlu login ---
  if (verifyFileToken(path, token)) {
    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });
    const { data, error } = await admin.storage.from("payment-files").createSignedUrl(path, 120);
    if (error || !data?.signedUrl) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.redirect(data.signedUrl);
  }

  // --- Jalur 2: tanpa tanda tangan → wajib login, dibatasi Storage RLS ---
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase.storage.from("payment-files").createSignedUrl(path, 120);
  if (error || !data?.signedUrl) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
