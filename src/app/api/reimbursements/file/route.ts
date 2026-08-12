import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Signed URL berumur pendek untuk bukti/kuitansi reimbursement. Hak akses
 * ditegakkan Storage RLS pada bucket `reimbursement-files` (penyetuju kedua
 * tahap, HR, atau pemilik folder).
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

  const { data, error } = await supabase.storage.from("reimbursement-files").createSignedUrl(path, 120);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.redirect(data.signedUrl);
}
