import Link from "next/link";
import { CalendarDays, Clock, PiggyBank, Wallet } from "lucide-react";
import { ClockWidget } from "@/components/attendance/clock-widget";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { minutesToHM } from "@/lib/utils";
import type { AttendanceRecap } from "@/lib/data";
import type { LeaveBalance, TeamGeofence } from "@/lib/types";

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
}: {
  firstName: string;
  geofence: TeamGeofence;
  requireLocation: boolean;
  requirePhoto: boolean;
  recap: AttendanceRecap;
  balance?: LeaveBalance;
  canPayroll: boolean;
  scheduleLabel?: string;
}) {
  const annualLeft = balance ? balance.annualQuota - balance.annualUsed : 0;
  return (
    <div className="space-y-5 fade-up">
      <div>
        <h2 className="font-display text-xl font-bold text-ink sm:text-2xl">Halo, {firstName} 🌿</h2>
        <p className="text-sm text-muted">Jangan lupa absen ya. Semangat bekerja hari ini!</p>
      </div>

      {/* #1 action — clock in */}
      <div className="mx-auto max-w-md lg:mx-0">
        <ClockWidget
          geofence={geofence}
          requireLocation={requireLocation}
          requirePhoto={requirePhoto}
          shiftLabel={scheduleLabel}
        />
      </div>

      {/* Personal status */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <Clock className="h-5 w-5 text-forest-600" />
          <p className="mt-2 font-display text-2xl font-bold text-ink">{recap.presentDays}</p>
          <p className="text-xs text-muted">Hari hadir bulan ini</p>
        </Card>
        <Card className="p-4">
          <Clock className="h-5 w-5 text-[#8a6512]" />
          <p className="mt-2 font-display text-2xl font-bold text-ink">{minutesToHM(recap.totalOvertimeMinutes)}</p>
          <p className="text-xs text-muted">Lembur bulan ini</p>
        </Card>
        <Card className="p-4">
          <PiggyBank className="h-5 w-5 text-matcha" />
          <p className="mt-2 font-display text-2xl font-bold text-ink">{balance?.tabunganLibur ?? 0}</p>
          <p className="text-xs text-muted">Tabungan libur (hari)</p>
        </Card>
      </div>

      {/* Leave balance */}
      <Card>
        <CardContent>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">Sisa Cuti Tahunan</p>
            <span className="text-sm text-muted">{annualLeft}/{balance?.annualQuota ?? 12} hari</span>
          </div>
          <Progress value={balance?.annualUsed ?? 0} max={balance?.annualQuota ?? 12} className="mt-2" />
        </CardContent>
      </Card>

      {/* Quick links — the worker's next-most actions */}
      <div className="grid grid-cols-2 gap-3">
        <QuickLink href="/leave" icon={CalendarDays} label="Ajukan Cuti / Izin" tone="bg-sky-soft text-[#2c5775]" />
        {canPayroll ? (
          <QuickLink href="/payroll" icon={Wallet} label="Slip Gaji Saya" tone="bg-[#e9f0d8] text-forest-700" />
        ) : (
          <QuickLink href="/attendance" icon={Clock} label="Riwayat Absensi" tone="bg-gold-soft text-[#8a6512]" />
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
