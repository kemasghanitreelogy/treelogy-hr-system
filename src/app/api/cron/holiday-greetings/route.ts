import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSmtpConfigured, sendEmail } from "@/lib/email";
import { holidayCopy, holidayEmailHtml, holidayEmailText } from "@/lib/holiday-copy";
import type { Holiday } from "@/lib/types";
import { addDaysStr, witaToday } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Pengingat hari libur — berjalan tiap pagi, mengirim email H-1.
 *
 * Dipicu Supabase pg_cron (bukan Vercel Cron: dua slot cron paket Hobby sudah
 * terpakai — pola yang sama dengan clock-reminders). Tiap pagi ia menengok
 * kalender BESOK; kalau besok libur, semua yang besok libur menerima email
 * hangat berisi pengingat + ucapan yang sesuai hari rayanya.
 *
 * Penerima mengikuti semantik kalender di types.ts:
 *   • 'public'    → semua karyawan aktif ber-email.
 *   • 'religious' → hanya karyawan seagama — merekalah yang besok libur;
 *     rekan lain tetap masuk, jadi tidak dikirimi "besok kamu libur".
 *
 * Idempoten lewat holiday_greeting_log per (holiday, employee): run yang
 * terputus di tengah (SMTP mati setelah 5 email) aman diulang — lima orang
 * pertama tidak menerima ucapan yang sama dua kali.
 */

interface EmployeeRow {
  id: string;
  name: string;
  email: string | null;
  religion: string | null;
}

export async function GET(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  // Sah bila bearer = CRON_SECRET env, ATAU token tersimpan yang dikirim
  // pg_cron — persis pola clock-reminders.
  const auth = req.headers.get("authorization") ?? "";
  const envSecret = process.env.CRON_SECRET;
  let authorized = Boolean(envSecret) && auth === `Bearer ${envSecret}`;
  if (!authorized) {
    const { data: row } = await admin
      .from("cron_secrets").select("token").eq("name", "holiday-greetings").maybeSingle();
    authorized = Boolean(row?.token) && auth === `Bearer ${row!.token}`;
  }
  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  // ?dry=1 → susun semuanya tapi jangan kirim & jangan catat — untuk mengecek
  // penerima dan naskah tanpa mengirim email sungguhan ke seisi kantor.
  const dry = url.searchParams.get("dry") === "1";
  // ?date=YYYY-MM-DD → uji tanggal tertentu. Run normal: H-1 dari besok.
  const override = url.searchParams.get("date");
  const target = override && /^\d{4}-\d{2}-\d{2}$/.test(override) ? override : addDaysStr(witaToday(), 1);

  const { data: holidayRows, error: hErr } = await admin
    .from("holidays").select("id, date, name, type, religion").eq("date", target);
  if (hErr) return NextResponse.json({ error: "query_failed", detail: hErr.message }, { status: 500 });
  const holidays = (holidayRows ?? []) as (Pick<Holiday, "date" | "name" | "type" | "religion"> & { id: string })[];
  if (!holidays.length) {
    return NextResponse.json({ ok: true, target, holidays: 0, sent: 0 });
  }

  if (!dry && !isSmtpConfigured) {
    return NextResponse.json({ error: "not_configured", detail: "SMTP belum diisi" }, { status: 503 });
  }

  const { data: empRows, error: eErr } = await admin
    .from("employees").select("id, name, email, religion").eq("status", "active");
  if (eErr) return NextResponse.json({ error: "query_failed", detail: eErr.message }, { status: 500 });
  const employees = ((empRows ?? []) as EmployeeRow[]).filter((e) => (e.email ?? "").includes("@"));

  const summary: {
    holiday: string; audience: number; sent: number; skipped: number;
    failed: { email: string; error: string }[];
    preview?: { subject: string; to: string[] };
  }[] = [];

  for (const h of holidays) {
    const audience =
      h.type === "religious"
        ? employees.filter((e) => e.religion === h.religion)
        : employees;

    // Yang sudah pernah dikirimi untuk libur ini — dilewati, bukan dikirim ulang.
    const { data: logRows } = await admin
      .from("holiday_greeting_log").select("employee_id").eq("holiday_id", h.id);
    const already = new Set((logRows ?? []).map((r) => String(r.employee_id)));
    const targets = audience.filter((e) => !already.has(e.id));

    const copy = holidayCopy(h);

    if (dry) {
      summary.push({
        holiday: h.name, audience: audience.length, sent: 0, skipped: already.size,
        failed: [],
        preview: { subject: copy.subject, to: targets.map((e) => `${e.name} <${e.email}>`) },
      });
      continue;
    }

    let sent = 0;
    const failed: { email: string; error: string }[] = [];
    for (const emp of targets) {
      try {
        await sendEmail({
          to: emp.email!,
          subject: copy.subject,
          html: holidayEmailHtml(copy, emp.name),
          text: holidayEmailText(copy, emp.name),
        });
        // Dicatat per orang SETELAH terkirim — kegagalan di tengah tidak
        // membuat siapa pun tercatat "sudah" padahal emailnya tidak sampai.
        await admin.from("holiday_greeting_log").insert({ holiday_id: h.id, employee_id: emp.id });
        sent += 1;
      } catch (err) {
        failed.push({ email: emp.email!, error: err instanceof Error ? err.message.slice(0, 120) : "unknown" });
      }
    }
    summary.push({ holiday: h.name, audience: audience.length, sent, skipped: already.size, failed });
  }

  return NextResponse.json({ ok: true, target, dry, holidays: holidays.length, summary });
}
