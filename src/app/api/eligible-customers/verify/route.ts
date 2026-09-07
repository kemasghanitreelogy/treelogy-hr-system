import { NextResponse } from "next/server";
import { can, getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { verifyOne } from "@/lib/eligible-customers/verify";
import { readState } from "../state";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Baca ulang metafield `$app:combined-discount-state` satu pelanggan. */
export async function POST(req: Request) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Menulis kolom verifikasi di ledger — izin yang sama dengan grant.
  if (!can(me, "customers.grant")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { email?: string };
  if (!body.email) return NextResponse.json({ error: "email_required" }, { status: 400 });

  const result = await verifyOne(supabase, body.email);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : result.error === "verify_not_configured" ? 503 : 502;
    return NextResponse.json({ error: result.error, detail: result.detail }, { status });
  }
  return NextResponse.json({ customer: result.customer, state: await readState() });
}
