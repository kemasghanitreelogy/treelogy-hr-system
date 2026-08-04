import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Tautan berkas yang ditulis ke Google Sheet menunjuk ke sini, bukan ke signed
 * URL Supabase — signed URL kedaluwarsa dalam hitungan menit, sedangkan baris
 * di sheet keuangan harus tetap bisa dibuka berbulan-bulan kemudian.
 *
 * Route ini menukar path menjadi signed URL baru setiap kali dibuka, dan hanya
 * untuk pengguna yang berhak (Storage RLS `payment-files`: Finance/HR, atau
 * pemilik berkasnya). Jadi tautan di sheet aman dibagikan di internal.
 */
export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get("path");
  if (!path) return NextResponse.json({ error: "missing_path" }, { status: 400 });

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
