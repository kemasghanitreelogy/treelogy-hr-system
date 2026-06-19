import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToEmployees } from "@/lib/push/send";

export const runtime = "nodejs";

/** Today's date (YYYY-MM-DD) and weekday (0=Sun..6=Sat) in WITA. */
function witaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function witaDow(): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Makassar", weekday: "short" }).format(new Date());
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
}
function witaHour(): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Makassar", hour: "2-digit", hour12: false }).format(new Date()));
}

// Funny, friendly copy — one is picked at random per recipient for variety.
const CLOCK_IN_MSGS = [
  { title: "Jangan lupa absen! ⏰", body: "Mesin absensi kangen kamu nih 🥺 Buruan clock-in ya!" },
  { title: "Pagi! ☀️ Sudah clock-in belum?", body: "Absen dulu biar gaji aman 💸✨" },
  { title: "Psst… 👀", body: "Kamu belum clock-in lho. Jangan jadi karyawan siluman 🥷 Absen yuk!" },
  { title: "Halo, manusia produktif! 🌱", body: "Clock-in dulu yuk sebelum kopi keburu dingin ☕😆" },
];
const CLOCK_OUT_MSGS = [
  { title: "Waktunya pulang! 🏠", body: "Jangan lupa clock-out, rebahan sudah menunggu 🛋️😴" },
  { title: "Kerja bagus hari ini! 🎉", body: "Clock-out dulu ya, biar nggak dikira nginep di kantor 👻" },
  { title: "Hayoo masih ngantor? 🌙", body: "Yuk clock-out~ kerja kerasmu hari ini layak diapresiasi 💪✨" },
  { title: "Mentari sudah pulang 🌇", body: "Kamu juga dong! Clock-out dulu, sampai jumpa besok 👋😊" },
];
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/**
 * Vercel Cron (08:00 & 17:00 WITA). Morning → remind people who haven't
 * clocked in; evening → remind people still clocked in to clock out. Funny copy,
 * web push only, skipped on off-days/public holidays, deduped via clock_reminders.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const kind: "in" | "out" = witaHour() < 12 ? "in" : "out";
  const today = witaToday();
  const dow = witaDow();

  // Skip the whole company on a public holiday.
  const { data: hols } = await admin.from("holidays").select("type").eq("date", today);
  if ((hols ?? []).some((h) => h.type === "public")) {
    return NextResponse.json({ ok: true, kind, skipped: "public_holiday" });
  }

  // Active employees scheduled to work today.
  const { data: emps } = await admin.from("employees").select("id, work_days").eq("status", "active");
  const scheduled = (emps ?? []).filter((e) => {
    const wd = Array.isArray(e.work_days) ? e.work_days.map(Number) : [1, 2, 3, 4, 5];
    return wd.includes(dow);
  });
  if (scheduled.length === 0) return NextResponse.json({ ok: true, kind, candidates: 0, sent: 0 });

  // Today's attendance, keyed by employee.
  const { data: att } = await admin
    .from("attendance")
    .select("employee_id, clock_in, clock_out")
    .eq("date", today);
  const byEmp = new Map((att ?? []).map((a) => [String(a.employee_id), a]));

  const targets: string[] = [];
  for (const e of scheduled) {
    const rec = byEmp.get(String(e.id));
    if (kind === "in") {
      if (!rec || !rec.clock_in) targets.push(String(e.id)); // hasn't clocked in
    } else if (rec && rec.clock_in && !rec.clock_out) {
      targets.push(String(e.id)); // clocked in, not out yet
    }
  }
  if (targets.length === 0) return NextResponse.json({ ok: true, kind, candidates: 0, sent: 0 });

  // Dedup: only newly-inserted rows get a push (re-fire safe).
  const { data: inserted } = await admin
    .from("clock_reminders")
    .upsert(
      targets.map((id) => ({ employee_id: id, date: today, kind })),
      { onConflict: "employee_id,date,kind", ignoreDuplicates: true },
    )
    .select("employee_id");
  const fresh = (inserted ?? []).map((r) => String(r.employee_id));

  let sent = 0;
  for (const id of fresh) {
    const msg = kind === "in" ? pick(CLOCK_IN_MSGS) : pick(CLOCK_OUT_MSGS);
    const res = await sendPushToEmployees(admin, [id], {
      title: msg.title,
      body: msg.body,
      url: "/attendance",
      tag: `clock-${kind}`,
    });
    sent += res.sent;
  }

  return NextResponse.json({ ok: true, kind, candidates: targets.length, fresh: fresh.length, sent });
}
