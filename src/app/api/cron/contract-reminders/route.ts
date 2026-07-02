import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { brandedEmail, isSmtpConfigured, sendEmail } from "@/lib/email";
import { pushNotifications, type NewNotification } from "@/lib/notify";

export const runtime = "nodejs";

// Escalating reminders at these days-remaining buckets (ascending). Each contract
// fires each bucket at most once — so the employee gets a heads-up that gets
// closer as the end date nears.
const MILESTONES = [1, 7, 14, 30, 60];
const MAX_MILESTONE = 60;
// Only probation (→ PKWTT decision) and PKWT (→ renewal) need a heads-up.
const TYPES = ["probation", "pkwt"];

/** Today's date in WITA (UTC+8) as YYYY-MM-DD. */
function witaToday(): string {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Whole days from `today` (WITA) to a YYYY-MM-DD date; >=0 for future dates. */
function daysUntil(today: string, iso: string): number {
  return Math.round((Date.parse(iso + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86_400_000);
}
function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

interface ContractRow {
  id: string;
  employee_id: string;
  type: string;
  end_date: string;
  employees: { name: string | null; email: string | null } | null;
}

/**
 * Daily Vercel Cron. Sends H-60 and H-30 reminders for probation and PKWT
 * contracts about to end — to HR (to act) and to the affected employee (info) —
 * across in-app notifications, web push, and email. Idempotent via
 * contract_reminders so each (contract, milestone) fires exactly once.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const today = witaToday();
  const windowEnd = addDays(today, MAX_MILESTONE);

  // Active probation/PKWT contracts ending within the reminder window. Using a
  // window (not exact milestone dates) keeps it robust if a daily run is missed.
  const { data: contracts, error } = await admin
    .from("employee_contracts")
    .select("id, employee_id, type, end_date, employees(name, email)")
    .eq("status", "active")
    .in("type", TYPES)
    .gte("end_date", today)
    .lte("end_date", windowEnd);
  if (error) {
    return NextResponse.json({ error: "query_failed", detail: error.message }, { status: 500 });
  }
  const rows = (contracts ?? []) as unknown as ContractRow[];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, today, processed: 0, contracts: 0 });
  }

  // Which (contract, milestone) reminders already went out — skip those.
  const sent = new Set<string>();
  const { data: already } = await admin
    .from("contract_reminders")
    .select("contract_id, milestone")
    .in("contract_id", rows.map((r) => r.id));
  for (const r of already ?? []) sent.add(`${r.contract_id}:${r.milestone}`);

  // HR recipients (once for the whole run).
  const { data: hr } = await admin.rpc("hr_recipient_employees");
  const hrList = (hr ?? []) as { employee_id: string; name: string; email: string | null }[];

  let processed = 0;
  let pushSent = 0;
  const emailTasks: Promise<unknown>[] = [];

  for (const c of rows) {
    const daysLeft = daysUntil(today, c.end_date);
    // Tightest bucket that applies (smallest milestone >= days remaining).
    const milestone = MILESTONES.find((m) => daysLeft <= m);
    if (!milestone) continue;
    if (sent.has(`${c.id}:${milestone}`)) continue;

    const empName = c.employees?.name ?? "Karyawan";
    const empEmail = c.employees?.email ?? null;
    const when = fmtDate(c.end_date);
    const left = daysLeft <= 0 ? "hari ini" : daysLeft === 1 ? "besok (1 hari lagi)" : `${daysLeft} hari lagi`;
    const isProbation = c.type === "probation";

    // Tailored copy: HR gets an action; the employee gets a softer heads-up.
    const hrTitle = isProbation ? "Masa percobaan akan berakhir" : "Kontrak PKWT akan berakhir";
    const hrBody = isProbation
      ? `Masa percobaan ${empName} berakhir ${when} — ${left}. Tinjau untuk pengangkatan PKWTT.`
      : `Kontrak PKWT ${empName} berakhir ${when} — ${left}. Proses keputusan perpanjangan kontrak.`;
    const empTitle = isProbation ? "Masa percobaanmu akan berakhir" : "Kontrak kerjamu akan berakhir";
    const empBody = isProbation
      ? `Masa percobaanmu berakhir ${when} — ${left}. HR akan meninjau status kepegawaianmu.`
      : `Kontrak kerjamu berakhir ${when} — ${left}. HR akan menghubungimu terkait perpanjangan.`;

    // HR ids excluding the affected employee (they get the employee copy instead).
    const hrIds = hrList.map((h) => h.employee_id).filter((id) => id !== c.employee_id);

    // 1) In-app notifications.
    const notifs: NewNotification[] = [
      ...hrIds.map((id) => ({ employeeId: id, type: "contract", tone: "pending" as const, title: hrTitle, body: hrBody, href: "/employees" })),
    ];
    if (c.employee_id) notifs.push({ employeeId: c.employee_id, type: "contract", tone: "pending", title: empTitle, body: empBody, href: "/profile" });
    // In-app bell + web push (pushNotifications now delivers both).
    const res = await pushNotifications(notifs);
    pushSent += res.sent;

    // 3) Email (best-effort; failures don't block the run).
    if (isSmtpConfigured) {
      for (const h of hrList) {
        if (h.email && h.employee_id !== c.employee_id) {
          emailTasks.push(sendEmail({ to: h.email, subject: `${hrTitle} — ${empName}`, text: hrBody, html: brandedEmail({ heading: hrTitle, intro: "Pengingat kontrak", message: hrBody, ctaLabel: "Buka data karyawan", ctaUrl: "https://treelogy-hr-system.vercel.app/employees" }) }));
        }
      }
      if (empEmail) {
        emailTasks.push(sendEmail({ to: empEmail, subject: empTitle, text: empBody, html: brandedEmail({ heading: empTitle, intro: "Pengingat kontrak", message: empBody }) }));
      }
    }

    // 4) Mark done (idempotent).
    await admin.from("contract_reminders").upsert({ contract_id: c.id, milestone }, { onConflict: "contract_id,milestone", ignoreDuplicates: true });
    processed++;
  }

  const emailResults = await Promise.allSettled(emailTasks);
  const emailFailed = emailResults.filter((r) => r.status === "rejected").length;
  if (emailFailed > 0) console.error(`[cron/contract-reminders] ${emailFailed}/${emailTasks.length} emails failed to send`);

  return NextResponse.json({
    ok: true,
    today,
    contracts: rows.length,
    processed,
    pushSent,
    emailSent: emailTasks.length - emailFailed,
    emailFailed,
  });
}
