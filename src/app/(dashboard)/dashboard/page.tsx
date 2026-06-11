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
import { SelfDashboard } from "@/components/dashboard/self-dashboard";
import { TEAM_META } from "@/lib/constants";
import { formatDate, rupiah } from "@/lib/utils";
import {
  CURRENT_PERIOD,
  TODAY,
  computeRecap,
  getAttendance,
  getAttendanceSettings,
  getDashboardData,
  getEmployee,
  getLeaveBalances,
} from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";
import { audienceFromPermissions } from "@/components/layout/nav-items";

const LEAVE_LABEL: Record<string, string> = {
  annual: "Cuti tahunan", sick: "Sakit", unpaid: "Tanpa gaji", "tukar-libur": "Tukar libur",
};

export default async function DashboardPage() {
  const user = await getSessionUser();
  const firstName = (user?.name ?? "Tim").split(" ")[0];

  // Front-line worker → clock-first self-service home.
  if (user && audienceFromPermissions(user.permissions) === "self") {
    const [settings, attendance, balances, me] = await Promise.all([
      getAttendanceSettings(),
      getAttendance(),
      getLeaveBalances(),
      user.employeeId ? getEmployee(user.employeeId) : Promise.resolve(undefined),
    ]);
    const recap = computeRecap(attendance, user.employeeId ?? "", CURRENT_PERIOD);
    const balance = balances.find((b) => b.employeeId === user.employeeId);
    const scheduleLabel = `Jam kerja · ${me?.workStart ?? "08:00"}–${me?.workEnd ?? "17:00"}`;
    const geofence = settings.geofences[me?.team ?? "office"];
    return (
      <SelfDashboard
        firstName={firstName}
        geofence={geofence}
        requireLocation={settings.requireLocation}
        requirePhoto={settings.requirePhoto}
        recap={recap}
        balance={balance}
        canPayroll={can(user, "payroll.view")}
        scheduleLabel={scheduleLabel}
      />
    );
  }

  // HR / ops → action-first operational dashboard.
  const { stats, trend, today, pending } = await getDashboardData();
  const needsAction = stats.pendingLeave + stats.pendingSwap;

  return (
    <div className="space-y-5 fade-up">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted">{formatDate(TODAY, "long")}</p>
        <h2 className="font-display text-xl font-bold text-ink sm:text-2xl">
          Selamat datang kembali, {firstName} 🌿
        </h2>
        <p className="text-sm text-muted">Ringkasan SDM Treelogy hari ini.</p>
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
            <p className="text-sm font-semibold text-[#7a5a10]">{needsAction} permintaan menunggu persetujuan Anda</p>
            <p className="text-xs text-[#8a6512]/80">Cuti, izin, dan tukar libur perlu ditinjau.</p>
          </div>
          <ArrowRight className="h-5 w-5 text-[#8a6512]" />
        </Link>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Hadir hari ini" value={`${stats.presentToday}/${stats.activeEmployees}`} sub={`Kehadiran ${stats.attendanceRate}%`} icon={UserCheck} tone="matcha" trend={{ value: `${stats.attendanceRate}%`, up: stats.attendanceRate >= 85 }} />
        <StatCard label="Karyawan aktif" value={String(stats.activeEmployees)} sub={`dari ${stats.totalEmployees} total`} icon={Users} tone="forest" />
        <StatCard label="Lembur bulan ini" value={`${stats.overtimeHoursMonth} jam`} sub="Sinkron ke payroll" icon={Clock} tone="gold" />
        <StatCard label="Payroll bersih (Jun)" value={rupiah(stats.payrollNetMonth, { compact: true })} sub="Periode berjalan" icon={Wallet} tone="olive" />
      </div>

      {/* Quick actions (recognition over recall; shortest path to top tasks) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {can(user, "leave.approve") && <QuickAction href="/leave" icon={CalendarDays} label="Approval Cuti" badge={needsAction || undefined} />}
        {can(user, "payroll.process") && <QuickAction href="/payroll" icon={Wallet} label="Proses Payroll" />}
        {can(user, "attendance.view") && <QuickAction href="/attendance" icon={CalendarClock} label="Absensi" />}
        {can(user, "employees.manage") && <QuickAction href="/employees" icon={UserPlus} label="Karyawan" />}
      </div>

      {/* Actionable: today's attendance + approvals (before analytics) */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Absensi Hari Ini</CardTitle>
            <Link href="/attendance" className="text-sm font-medium text-forest-600 hover:underline">Lihat semua</Link>
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
                    <p>Masuk {r.clockIn ? r.clockIn.slice(11, 16) : "—"}</p>
                    {r.overtimeMinutes > 0 && <p className="text-[#8a6512]">Lembur {Math.round((r.overtimeMinutes / 60) * 10) / 10}j</p>}
                  </div>
                  <AttendanceBadge status={r.status} />
                </li>
              ))}
              {today.length === 0 && <li className="px-5 py-6 text-sm text-faint">Belum ada absensi hari ini.</li>}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Perlu Persetujuan</CardTitle>
            <Badge tone="gold">{needsAction}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {pending.length === 0 && <p className="text-sm text-faint">Tidak ada permintaan tertunda.</p>}
            {pending.map(({ request: l, employee: emp }) => (
              <div key={l.id} className="rounded-xl border border-line bg-cream/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-ink">{emp?.name ?? "—"}</span>
                  <RequestBadge status={l.status} />
                </div>
                <p className="mt-1 text-xs text-muted">{LEAVE_LABEL[l.type]} · {l.days} hari · mulai {formatDate(l.startDate)}</p>
              </div>
            ))}
            <Link href="/leave" className="block rounded-xl bg-forest-600 py-2.5 text-center text-sm font-medium text-cream transition-colors hover:bg-forest-700">Kelola persetujuan</Link>
          </CardContent>
        </Card>
      </div>

      {/* Analytics (monitoring — placed after action items) */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Tren Kehadiran</CardTitle>
              <p className="mt-0.5 text-sm text-muted">14 hari terakhir</p>
            </div>
            <div className="hidden items-center gap-3 text-xs text-muted sm:flex">
              <Legend color="#3d5a2e" label="Hadir" />
              <Legend color="#e0a82e" label="Terlambat" />
              <Legend color="#c2603f" label="Alpa" />
            </div>
          </CardHeader>
          <CardContent><AttendanceTrendChart data={trend} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Komposisi Tim</CardTitle></CardHeader>
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
