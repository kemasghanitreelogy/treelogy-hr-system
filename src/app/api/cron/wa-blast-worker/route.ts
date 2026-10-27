import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDrain } from "@/lib/qontak/store";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Worker antrean Blast WhatsApp. Dipanggil pg_cron tiap menit — HANYA saat
 * ada antrean atau status pengiriman yang belum final (kondisinya di job
 * cron), jadi tidak ada pemanggilan kosong. Token = cron_secrets
 * 'wa-blast-worker' (pola clock-reminders) atau env CRON_SECRET.
 */
export async function GET(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const auth = req.headers.get("authorization") ?? "";
  const envSecret = process.env.CRON_SECRET;
  let authorized = Boolean(envSecret) && auth === `Bearer ${envSecret}`;
  if (!authorized) {
    const { data: row } = await admin.from("cron_secrets").select("token").eq("name", "wa-blast-worker").maybeSingle();
    authorized = Boolean(row?.token) && auth === `Bearer ${row!.token}`;
  }
  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const res = await runDrain(50_000);
  return NextResponse.json(res);
}
