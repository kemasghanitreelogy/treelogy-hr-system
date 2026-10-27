import "server-only";
import { NextResponse } from "next/server";
import { can, getSessionUser, type SessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { qontakConfigured, QontakError } from "@/lib/qontak/client";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Pagar bersama semua route Blast WhatsApp. Aksesnya SENGAJA mengikuti menu
 * Receipt Sales (`receipt.view`) — keputusan pemilik produk: siapa pun yang
 * bisa membuka Receipt Sales boleh blast. Izin terpisah akan cepat melenceng
 * dari menu yang dilihat orang.
 */
export async function guard(): Promise<
  { ok: true; me: SessionUser; db: SupabaseClient } | { ok: false; res: NextResponse }
> {
  const me = await getSessionUser();
  if (!me) return { ok: false, res: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (!can(me, "receipt.view")) return { ok: false, res: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  if (!qontakConfigured()) return { ok: false, res: NextResponse.json({ error: "qontak_not_configured" }, { status: 503 }) };
  const db = createAdminClient();
  if (!db) return { ok: false, res: NextResponse.json({ error: "unavailable" }, { status: 503 }) };
  return { ok: true, me, db };
}

/** QontakError → respons dengan kode mesin yang bisa diterjemahkan di layar. */
export function qontakFailure(e: unknown): NextResponse {
  if (e instanceof QontakError) {
    const code =
      e.code === "scope_missing" ? "qontak_scope_missing"
      : e.code === "unauthorized" ? "qontak_unauthorized"
      : e.code === "rate_limited" ? "qontak_rate_limited"
      : "qontak_failed";
    return NextResponse.json({ error: code, detail: e.message }, { status: e.status === 429 ? 429 : 502 });
  }
  return NextResponse.json({ error: "qontak_failed", detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
}
