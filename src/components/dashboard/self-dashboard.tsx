import Link from "next/link";
import { CalendarDays, Clock, PiggyBank, Wallet } from "lucide-react";
import { ClockWidget } from "@/components/attendance/clock-widget";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { minutesToHM } from "@/lib/utils";
import type { AttendanceRecap } from "@/lib/data";
import type { LeaveBalance, TeamGeofence } from "@/lib/types";
import type { Locale } from "@/lib/i18n";

const STR: Record<Locale, {
  greeting: (name: string) => string;
  reminder: string;
  presentDays: string;
  overtimeMonth: string;
  holidaySavings: string;
  annualLeaveLeft: string;
  days: (n: number, quota: number) => string;
  notEligibleYet: string;
  requestLeave: string;
  myPayslip: string;
  attendanceHistory: string;
}> = {
  id: {
    greeting: (name) => `Halo, ${name} 🌿`,
    reminder: "Jangan lupa absen ya. Semangat bekerja hari ini!",
    presentDays: "Hari hadir bulan ini",
    overtimeMonth: "Lembur bulan ini",
    holidaySavings: "Tabungan libur (hari)",
    annualLeaveLeft: "Sisa Cuti Tahunan",
    days: (n, quota) => `${n}/${quota} hari`,
    notEligibleYet: "Belum berhak (< 1 thn)",
    requestLeave: "Ajukan Cuti / Izin",
    myPayslip: "Slip Gaji Saya",
    attendanceHistory: "Riwayat Absensi",
  },
  en: {
    greeting: (name) => `Hello, ${name} 🌿`,
    reminder: "Don't forget to clock in. Have a great workday!",
    presentDays: "Days present this month",
    overtimeMonth: "Overtime this month",
    holidaySavings: "Banked days off (days)",
    annualLeaveLeft: "Annual Leave Remaining",
    days: (n, quota) => `${n}/${quota} days`,
    notEligibleYet: "Not eligible yet (< 1 yr)",
    requestLeave: "Request Leave / Permit",
    myPayslip: "My Payslip",
    attendanceHistory: "Attendance History",
  },
};

/**
 * Front-line worker home. Clock-in is the #1 daily action → top, in the thumb
 * zone, visually dominant (Fitts + Von Restorff). Everything else is the
 * worker's own status, not company analytics.
 */
export function SelfDashboard({
  firstName,
  geofence,
  requireLocation,
  requirePhoto,
  recap,
  balance,
  canPayroll,
  scheduleLabel,
  workDays,
  holidayToday = false,
  holidayName = null,
  locale = "id",
}: {
  firstName: string;
  geofence: TeamGeofence;
  requireLocation: boolean;
  requirePhoto: boolean;
  recap: AttendanceRecap;
  balance?: LeaveBalance;
  canPayroll: boolean;
  scheduleLabel?: string;
  workDays?: number[];
  holidayToday?: boolean;
  holidayName?: string | null;
  locale?: Locale;
}) {
  const t = STR[locale];
  const annualLeft = balance ? balance.annualQuota - balance.annualUsed : 0;
  return (
    <div className="space-y-5 fade-up">
      <div>
        <h2 className="font-display text-xl font-bold text-ink sm:text-2xl">{t.greeting(firstName)}</h2>
        <p className="text-sm text-muted">{t.reminder}</p>
      </div>

      {/* #1 action — clock in */}
      <div className="mx-auto max-w-md lg:mx-0">
        <ClockWidget
          geofence={geofence}
          requireLocation={requireLocation}
          requirePhoto={requirePhoto}
          shiftLabel={scheduleLabel}
          workDays={workDays}
          holidayToday={holidayToday}
          holidayName={holidayName}
        />
      </div>

      {/* Personal status */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <Clock className="h-5 w-5 text-forest-600" />
          <p className="mt-2 font-display text-2xl font-bold text-ink">{recap.presentDays}</p>
          <p className="text-xs text-muted">{t.presentDays}</p>
        </Card>
        <Card className="p-4">
          <Clock className="h-5 w-5 text-[#8a6512]" />
          <p className="mt-2 font-display text-2xl font-bold text-ink">{minutesToHM(recap.totalOvertimeMinutes, locale)}</p>
          <p className="text-xs text-muted">{t.overtimeMonth}</p>
        </Card>
        <Card className="p-4">
          <PiggyBank className="h-5 w-5 text-matcha" />
          <p className="mt-2 font-display text-2xl font-bold text-ink">{balance?.tabunganLibur ?? 0}</p>
          <p className="text-xs text-muted">{t.holidaySavings}</p>
        </Card>
      </div>

      {/* Leave balance */}
      <Card>
        <CardContent>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">{t.annualLeaveLeft}</p>
            <span className="text-sm text-muted">
              {balance?.annualQuota === 0 ? t.notEligibleYet : t.days(annualLeft, balance?.annualQuota ?? 12)}
            </span>
          </div>
          <Progress value={balance?.annualUsed ?? 0} max={Math.max(balance?.annualQuota ?? 12, 1)} className="mt-2" />
        </CardContent>
      </Card>

      {/* Quick links — the worker's next-most actions */}
      <div className="grid grid-cols-2 gap-3">
        <QuickLink href="/leave" icon={CalendarDays} label={t.requestLeave} tone="bg-sky-soft text-[#2c5775]" />
        {canPayroll ? (
          <QuickLink href="/payroll" icon={Wallet} label={t.myPayslip} tone="bg-[#e9f0d8] text-forest-700" />
        ) : (
          <QuickLink href="/attendance" icon={Clock} label={t.attendanceHistory} tone="bg-gold-soft text-[#8a6512]" />
        )}
      </div>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
  tone,
}: {
  href: string;
  icon: typeof Clock;
  label: string;
  tone: string;
}) {
  return (
    <Link href={href} className="card flex items-center gap-3 p-4 transition-colors hover:bg-cream/60">
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-sm font-medium text-ink">{label}</span>
    </Link>
  );
}
