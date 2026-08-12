import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Signed URL berumur pendek untuk berkas surat keluar. Hak akses ditegakkan
 * Storage RLS pada bucket `letter-files` (hanya pemegang letters.view/manage
 * atau HR yang boleh membaca).
 *
 * `?dl=<nama>` memaksa unduhan dengan nama berkas yang manusiawi.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  const dl = url.searchParams.get("dl");
  if (!path) return NextResponse.json({ error: "missing_path" }, { status: 400 });

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase.storage
    .from("letter-files")
    .createSignedUrl(path, 120, dl ? { download: dl } : undefined);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.redirect(data.signedUrl);
}
