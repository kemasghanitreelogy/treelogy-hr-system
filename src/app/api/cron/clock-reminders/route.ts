import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToEmployees } from "@/lib/push/send";

export const runtime = "nodejs";

// How far back each run looks for a trigger it should fire (≥ cron cadence, with
// jitter headroom). Dedup makes overlap harmless. Clock-out only ever fires AT or
// AFTER work_end (never early); clock-in fires ~15 min before work_start.
const LOOKBACK_MIN = 10;
const CLOCK_IN_LEAD_MIN = 15;

function witaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function witaDow(): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Makassar", weekday: "short" }).format(new Date());
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
}
/** Minutes since midnight, WITA. */
function witaNowMin(): number {
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Makassar", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}
/** "HH:MM" → minutes since midnight (fallback when unset/invalid). */
function toMin(hhmm: string | null | undefined, fallback: number): number {
  if (!hhmm) return fallback;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return fallback;
  return h * 60 + m;
}

const CLOCK_IN_MSGS = [
  { title: "Bentar lagi jadwal masuk! ⏰", body: "15 menit lagi nih — siap-siap clock-in ya 😎" },
  { title: "Pagi, manusia produktif! 🌱", body: "Sebentar lagi waktunya masuk. Jangan lupa clock-in ya ☕✨" },
  { title: "Psst… 👀", body: "Jadwal masuk hampir tiba. Clock-in dulu biar gaji aman 💸" },
  { title: "Siap berangkat? 🚀", body: "15 menit lagi jam masuk. Yuk absen biar nggak jadi karyawan siluman 🥷" },
];
const CLOCK_OUT_MSGS = [
  { title: "Waktunya pulang! 🏠", body: "Jam pulang sudah tiba — jangan lupa clock-out ya 🛋️😴" },
  { title: "Kerja bagus hari ini! 🎉", body: "Sudah waktunya clock-out. Rebahan menanti~ 👋" },
  { title: "Hayoo sudah jam pulang 🌇", body: "Clock-out dulu yuk, kerja kerasmu hari ini keren 💪✨" },
  { title: "Tok tok! Jam pulang 🔔", body: "Jangan lupa clock-out biar nggak dikira nginep di kantor 👻" },
];
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/**
 * Vercel Cron (every 5 min). Per-employee, WITA:
 *  - clock-in reminder ~15 min BEFORE their work_start (early clock-in is fine),
 *    only if they haven't clocked in.
 *  - clock-out reminder AT/after their work_end, only if clocked in & not out.
 * Skips off-days/public holidays; deduped per (employee, date, kind).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const today = witaToday();
  const dow = witaDow();
  const nowMin = witaNowMin();
  const windowLo = nowMin - LOOKBACK_MIN; // exclusive

  const { data: hols } = await admin.from("holidays").select("type").eq("date", today);
  if ((hols ?? []).some((h) => h.type === "public")) {
    return NextResponse.json({ ok: true, skipped: "public_holiday" });
  }

  const { data: emps } = await admin
    .from("employees")
    .select("id, work_start, work_end, work_days")
    .eq("status", "active");

  const { data: att } = await admin
    .from("attendance")
    .select("employee_id, clock_in, clock_out")
    .eq("date", today);
  const byEmp = new Map((att ?? []).map((a) => [String(a.employee_id), a]));

  const inTargets: string[] = [];
  const outTargets: string[] = [];
  for (const e of emps ?? []) {
    const wd = Array.isArray(e.work_days) ? e.work_days.map(Number) : [1, 2, 3, 4, 5];
    if (!wd.includes(dow)) continue;
    const rec = byEmp.get(String(e.id));
    const inTrigger = toMin(e.work_start, 8 * 60) - CLOCK_IN_LEAD_MIN;
    const outTrigger = toMin(e.work_end, 17 * 60);
    // Fire a trigger that landed in (now-LOOKBACK, now]. Dedup prevents repeats.
    if (inTrigger > windowLo && inTrigger <= nowMin && (!rec || !rec.clock_in)) inTargets.push(String(e.id));
    if (outTrigger > windowLo && outTrigger <= nowMin && rec && rec.clock_in && !rec.clock_out) outTargets.push(String(e.id));
  }

  async function fire(ids: string[], kind: "in" | "out", msgs: typeof CLOCK_IN_MSGS) {
    if (ids.length === 0) return 0;
    const { data: inserted } = await admin!
      .from("clock_reminders")
      .upsert(
        ids.map((id) => ({ employee_id: id, date: today, kind })),
        { onConflict: "employee_id,date,kind", ignoreDuplicates: true },
      )
      .select("employee_id");
    let sent = 0;
    for (const r of inserted ?? []) {
      const msg = pick(msgs);
      const res = await sendPushToEmployees(admin!, [String(r.employee_id)], {
        title: msg.title,
        body: msg.body,
        url: "/attendance",
        tag: `clock-${kind}`,
      });
      sent += res.sent;
    }
    return sent;
  }

  const [sentIn, sentOut] = await Promise.all([
    fire(inTargets, "in", CLOCK_IN_MSGS),
    fire(outTargets, "out", CLOCK_OUT_MSGS),
  ]);

  return NextResponse.json({ ok: true, nowMin, inCandidates: inTargets.length, outCandidates: outTargets.length, sentIn, sentOut });
}
