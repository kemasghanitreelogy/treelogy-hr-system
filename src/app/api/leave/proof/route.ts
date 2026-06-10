import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Returns a short-lived signed URL for a leave proof file and redirects to it.
 * Access is enforced by Storage RLS on `leave-proofs` (owner, the requester,
 * HR/admin, or the requester's division manager).
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

  const { data, error } = await supabase.storage.from("leave-proofs").createSignedUrl(path, 60);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.redirect(data.signedUrl);
}
