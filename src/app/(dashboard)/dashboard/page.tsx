import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Clock,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Avatar } from "@/components/ui/avatar";
import { AttendanceBadge, Badge, RequestBadge } from "@/components/ui/badge";
import { AttendanceTrendChart, TeamDonut } from "@/components/dashboard/charts";
import { PushManager } from "@/components/pwa/push-manager";
import { TEAM_META } from "@/lib/constants";
import { formatDate, rupiah } from "@/lib/utils";
import {
  liveToday,
  getAttendance,
  getAttendanceSettings,
  getDashboardData,
  getEmployee,
  getHolidayToday,
  getLeaveRequests,
  getOvertimeRequests,
  getClockApprovals,
  todayPendingClock,
} from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";
import { audienceFromPermissions } from "@/components/layout/nav-items";
import { getLocale } from "@/lib/locale-server";
import { SelfDashboard, type PendingItem } from "@/components/dashboard/self-dashboard";
import type { Locale } from "@/lib/i18n";

const LEAVE_LABEL: Record<Locale, Record<string, string>> = {
  id: {
    annual: "Cuti tahunan", sick: "Sakit", unpaid: "Tanpa gaji", "tukar-libur": "Tukar libur",
  },
  en: {
    annual: "Annual leave", sick: "Sick leave", unpaid: "Unpaid leave", "tukar-libur": "Day-off swap",
  },
};

const STR: Record<Locale, {
  scheduleLabel: (start: string, end: string) => string;
  welcome: (name: string) => string;
  summary: string;
  needsActionTitle: (n: number) => string;
  needsActionSub: string;
  presentToday: string;
  attendanceRate: (rate: number) => string;
  activeEmployees: string;
  ofTotal: (total: number) => string;
  overtimeMonth: string;
  hoursValue: (h: number) => string;
  overtimeSub: string;
  payrollNet: string;
  payrollSub: string;
  qaLeave: string;
  qaPayroll: string;
  qaAttendance: string;
  qaEmployees: string;
  todayAttendance: string;
  viewAll: string;
  clockInAt: (time: string) => string;
  overtimeShort: (h: number) => string;
  noAttendance: string;
  needsApproval: string;
  noPending: string;
  pendingMeta: (label: string, days: number, date: string) => string;
  manageApprovals: string;
  trendTitle: string;
  trendSub: string;
  legendPresent: string;
  legendLate: string;
  legendAbsent: string;
  teamComposition: string;
}> = {
  id: {
    scheduleLabel: (start, end) => `Jam kerja · ${start}–${end}`,
    welcome: (name) => `Selamat datang kembali, ${name} 🌿`,
    summary: "Ringkasan SDM Treelogy hari ini.",
    needsActionTitle: (n) => `${n} permintaan menunggu persetujuan Anda`,
    needsActionSub: "Cuti, izin, dan tukar libur perlu ditinjau.",
    presentToday: "Hadir hari ini",
    attendanceRate: (rate) => `Kehadiran ${rate}%`,
    activeEmployees: "Karyawan aktif",
    ofTotal: (total) => `dari ${total} total`,
    overtimeMonth: "Lembur bulan ini",
    hoursValue: (h) => `${h} jam`,
    overtimeSub: "Dibayar terpisah dari gaji",
    payrollNet: "Payroll bersih (Jun)",
    payrollSub: "Periode berjalan",
    qaLeave: "Approval Cuti",
    qaPayroll: "Proses Payroll",
    qaAttendance: "Absensi",
    qaEmployees: "Karyawan",
    todayAttendance: "Absensi Hari Ini",
    viewAll: "Lihat semua",
    clockInAt: (time) => `Masuk ${time}`,
    overtimeShort: (h) => `Lembur ${h}j`,
    noAttendance: "Belum ada absensi hari ini.",
    needsApproval: "Perlu Persetujuan",
    noPending: "Tidak ada permintaan tertunda.",
    pendingMeta: (label, days, date) => `${label} · ${days} hari · mulai ${date}`,
    manageApprovals: "Kelola persetujuan",
    trendTitle: "Tren Kehadiran",
    trendSub: "14 hari terakhir",
    legendPresent: "Hadir",
    legendLate: "Terlambat",
    legendAbsent: "Alpa",
    teamComposition: "Komposisi Tim",
  },
  en: {
    scheduleLabel: (start, end) => `Work hours · ${start}–${end}`,
    welcome: (name) => `Welcome back, ${name} 🌿`,
    summary: "Today's Treelogy HR overview.",
    needsActionTitle: (n) => `${n} request${n === 1 ? "" : "s"} awaiting your approval`,
    needsActionSub: "Leave, permits, and day-off swaps need review.",
    presentToday: "Present today",
    attendanceRate: (rate) => `Attendance ${rate}%`,
    activeEmployees: "Active employees",
    ofTotal: (total) => `of ${total} total`,
    overtimeMonth: "Overtime this month",
    hoursValue: (h) => `${h} hrs`,
    overtimeSub: "Paid separately from payroll",
    payrollNet: "Net payroll (Jun)",
    payrollSub: "Current period",
    qaLeave: "Leave Approvals",
    qaPayroll: "Run Payroll",
    qaAttendance: "Attendance",
    qaEmployees: "Employees",
    todayAttendance: "Today's Attendance",
    viewAll: "View all",
    clockInAt: (time) => `In ${time}`,
    overtimeShort: (h) => `Overtime ${h}h`,
    noAttendance: "No attendance records yet today.",
    needsApproval: "Needs Approval",
    noPending: "No pending requests.",
    pendingMeta: (label, days, date) => `${label} · ${days} day${days === 1 ? "" : "s"} · starts ${date}`,
    manageApprovals: "Manage approvals",
    trendTitle: "Attendance Trend",
    trendSub: "Last 14 days",
    legendPresent: "Present",
    legendLate: "Late",
    legendAbsent: "Absent",
    teamComposition: "Team Composition",
  },
};

export default async function DashboardPage() {
  const locale = await getLocale();
  const t = STR[locale];
  const user = await getSessionUser();
  const firstName = (user?.name ?? "Tim").split(" ")[0];

  // Front-line worker → clock-first self-service home.
  if (user && audienceFromPermissions(user.permissions) === "self") {
    const meId = user.employeeId ?? "";
    const [settings, attendance, me, leave, overtime, clockApprovals] = await Promise.all([
      getAttendanceSettings(),
      getAttendance(),
      user.employeeId ? getEmployee(user.employeeId) : Promise.resolve(undefined),
      getLeaveRequests(),
      getOvertimeRequests(),
      getClockApprovals(),
    ]);
    // Today's record so the clock widget survives a refresh. A clock-in that's
    // still pending HR (off-day / luar area) has no attendance row yet, so also
    // seed from the pending approval — else the button reverts to "Clock In".
    const today = liveToday();
    const todayRecord = attendance.find((r) => r.employeeId === meId && r.date === today) ?? null;
    const todayPending = todayPendingClock(clockApprovals, meId, today);
    const scheduleLabel = t.scheduleLabel(me?.workStart ?? "08:00", me?.workEnd ?? "17:00");
    const geofence = settings.geofences[me?.team ?? "office"];
    const holidayToday = await getHolidayToday(me?.religion);

    // Stage: waiting on the manager only if the worker actually has one and the
    // manager step isn't done yet; otherwise it's on HR (clock approvals skip the
    // manager entirely).
    const hasManager = !!me?.managerId;
    const dualStage = (managerApprover?: string | null): "manager" | "hr" =>
      managerApprover ? "hr" : hasManager ? "manager" : "hr";

    // Everything the worker has submitted that still awaits confirmation.
    const pending: PendingItem[] = [
      ...leave
        .filter((l) => l.employeeId === meId && l.status === "pending")
        .map((l) => ({ id: l.id, kind: "leave" as const, subtype: l.type, startDate: l.startDate, endDate: l.endDate, requestedAt: l.requestedAt, stage: dualStage(l.managerApprover) })),
      ...overtime
        .filter((o) => o.employeeId === meId && o.status === "pending")
        .map((o) => ({ id: o.id, kind: "overtime" as const, subtype: "overtime", startDate: o.date, endDate: null, requestedAt: o.requestedAt, stage: dualStage(o.managerApprover) })),
      ...clockApprovals
        .filter((cA) => cA.employeeId === meId && cA.status === "pending")
        .map((cA) => ({ id: cA.id, kind: "clock" as const, subtype: cA.kind, startDate: cA.date, endDate: null, requestedAt: cA.requestedAt, stage: "hr" as const })),
    ].sort((a, b) => (b.requestedAt || "").localeCompare(a.requestedAt || ""));

    return (
      <SelfDashboard
        firstName={firstName}
        geofence={geofence}
        requireLocation={settings.requireLocation}
        requirePhoto={settings.requirePhoto}
        scheduleLabel={scheduleLabel}
        workDays={me?.workDays}
        holidayToday={holidayToday != null}
        holidayName={holidayToday?.name ?? null}
        todayRecord={todayRecord}
        todayPending={todayPending}
        pending={pending}
        locale={locale}
      />
    );
  }

  // HR / ops → action-first operational dashboard.
  const { stats, trend, today, pending } = await getDashboardData();
  const needsAction = stats.pendingLeave + stats.pendingSwap;

  return (
    <div className="space-y-5 fade-up">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted">{formatDate(liveToday(), "long", locale)}</p>
        <h2 className="font-display text-xl font-bold text-ink sm:text-2xl">
          {t.welcome(firstName)}
        </h2>
        <p className="text-sm text-muted">{t.summary}</p>
      </div>

      {/* Needs-action banner (Zeigarnik: surface unfinished tasks first) */}
      {needsAction > 0 && can(user, "leave.approve") && (
        <Link
          href="/leave"
          className="flex items-center gap-3 rounded-2xl border border-gold/40 bg-gold-soft px-4 py-3 transition-colors hover:bg-[#f1dca8]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/20 text-[#8a6512]">
            <TrendingUp className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[#7a5a10]">{t.needsActionTitle(needsAction)}</p>
            <p className="text-xs text-[#8a6512]/80">{t.needsActionSub}</p>
          </div>
          <ArrowRight className="h-5 w-5 text-[#8a6512]" />
        </Link>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label={t.presentToday} value={`${stats.presentToday}/${stats.activeEmployees}`} sub={t.attendanceRate(stats.attendanceRate)} icon={UserCheck} tone="matcha" trend={{ value: `${stats.attendanceRate}%`, up: stats.attendanceRate >= 85 }} />
        <StatCard label={t.activeEmployees} value={String(stats.activeEmployees)} sub={t.ofTotal(stats.totalEmployees)} icon={Users} tone="forest" />
        <StatCard label={t.overtimeMonth} value={t.hoursValue(stats.overtimeHoursMonth)} sub={t.overtimeSub} icon={Clock} tone="gold" />
        <StatCard label={t.payrollNet} value={rupiah(stats.payrollNetMonth, { compact: true })} sub={t.payrollSub} icon={Wallet} tone="olive" />
      </div>

      {/* Quick actions (recognition over recall; shortest path to top tasks) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {can(user, "leave.approve") && <QuickAction href="/leave" icon={CalendarDays} label={t.qaLeave} badge={needsAction || undefined} />}
        {can(user, "payroll.process") && <QuickAction href="/payroll" icon={Wallet} label={t.qaPayroll} />}
        {can(user, "attendance.view") && <QuickAction href="/attendance" icon={CalendarClock} label={t.qaAttendance} />}
        {can(user, "employees.manage") && <QuickAction href="/employees" icon={UserPlus} label={t.qaEmployees} />}
      </div>

      {/* Actionable: today's attendance + approvals (before analytics) */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t.todayAttendance}</CardTitle>
            <Link href="/attendance" className="text-sm font-medium text-forest-600 hover:underline">{t.viewAll}</Link>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-line">
              {today.map(({ record: r, employee: emp }) => (
                <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={emp.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{emp.name}</p>
                    <p className="truncate text-xs text-faint">{emp.position} · <span className={TEAM_META[emp.team].tone}>{TEAM_META[emp.team].label}</span></p>
                  </div>
                  <div className="hidden text-right text-xs text-muted sm:block">
                    <p>{t.clockInAt(r.clockIn ? r.clockIn.slice(11, 16) : "—")}</p>
                    {r.overtimeMinutes > 0 && <p className="text-[#8a6512]">{t.overtimeShort(Math.round((r.overtimeMinutes / 60) * 10) / 10)}</p>}
                  </div>
                  <AttendanceBadge status={r.status} />
                </li>
              ))}
              {today.length === 0 && <li className="px-5 py-6 text-sm text-faint">{t.noAttendance}</li>}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.needsApproval}</CardTitle>
            <Badge tone="gold">{needsAction}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {pending.length === 0 && <p className="text-sm text-faint">{t.noPending}</p>}
            {pending.map(({ request: l, employee: emp }) => (
              <div key={l.id} className="rounded-xl border border-line bg-cream/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-ink">{emp?.name ?? "—"}</span>
                  <RequestBadge status={l.status} />
                </div>
                <p className="mt-1 text-xs text-muted">{t.pendingMeta(LEAVE_LABEL[locale][l.type], l.days, formatDate(l.startDate, "short", locale))}</p>
              </div>
            ))}
            <Link href="/leave" className="block rounded-xl bg-forest-600 py-2.5 text-center text-sm font-medium text-cream transition-colors hover:bg-forest-700">{t.manageApprovals}</Link>
          </CardContent>
        </Card>
      </div>

      {/* Analytics (monitoring — placed after action items) */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>{t.trendTitle}</CardTitle>
              <p className="mt-0.5 text-sm text-muted">{t.trendSub}</p>
            </div>
            <div className="hidden items-center gap-3 text-xs text-muted sm:flex">
              <Legend color="#3d5a2e" label={t.legendPresent} />
              <Legend color="#e0a82e" label={t.legendLate} />
              <Legend color="#c2603f" label={t.legendAbsent} />
            </div>
          </CardHeader>
          <CardContent><AttendanceTrendChart data={trend} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t.teamComposition}</CardTitle></CardHeader>
          <CardContent><TeamDonut data={stats.byTeam} /></CardContent>
        </Card>
      </div>

      <PushManager />
    </div>
  );
}

function QuickAction({
  href, icon: Icon, label, badge,
}: {
  href: string; icon: typeof Clock; label: string; badge?: number;
}) {
  return (
    <Link href={href} className="card relative flex flex-col items-center justify-center gap-2 px-3 py-4 text-center transition-colors hover:bg-cream/60">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-forest-100 text-forest-700">
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-xs font-medium text-ink">{label}</span>
      {badge ? (
        <span className="absolute right-3 top-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-clay px-1.5 text-[11px] font-semibold text-white">{badge}</span>
      ) : null}
    </Link>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
