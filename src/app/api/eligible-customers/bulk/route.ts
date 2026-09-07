import { NextResponse } from "next/server";
import { can, getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { grantOne } from "@/lib/eligible-customers/grant";
import type { GrantInput, GrantResult } from "@/lib/eligible-customers/types";
import { MAX_BULK_ROWS } from "@/lib/eligible-customers/validate";
import { readState } from "../state";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Grant massal — satu potongan (≤25 baris) per permintaan.
 *
 * Berkas CSV/XLSX diurai di BROWSER, lalu dikirim per potongan; server
 * memproses baris berurutan (tiap baris = 2–3 panggilan Shopify + 1 ke
 * backend). Potongan kecil supaya satu berkas 500 baris tidak jadi satu
 * permintaan yang menggantung 10 menit — dan supaya progresnya terlihat.
 * Tiap baris dijawab sendiri-sendiri: satu email rusak tidak menggagalkan
 * 24 lainnya.
 */
export async function POST(req: Request) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(me, "customers.grant")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { rows?: GrantInput[] } | null;
  const rows = Array.isArray(body?.rows) ? body!.rows : [];
  if (!rows.length) return NextResponse.json({ error: "no_rows" }, { status: 400 });
  if (rows.length > MAX_BULK_ROWS) return NextResponse.json({ error: "too_many_rows" }, { status: 400 });

  const results: GrantResult[] = [];
  for (const row of rows) {
    results.push(await grantOne(supabase, me, { ...row, source: row.source ?? "import" }));
  }

  return NextResponse.json({ results, state: await readState() });
}
