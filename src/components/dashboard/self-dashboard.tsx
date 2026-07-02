import { CalendarDays, CalendarOff, CheckCircle2, ClipboardList, Clock, MapPin, Timer } from "lucide-react";
import { ClockWidget } from "@/components/attendance/clock-widget";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { AttendanceRecord, TeamGeofence } from "@/lib/types";
import type { Locale } from "@/lib/i18n";

/** One of the worker's own submissions still awaiting confirmation. */
export interface PendingItem {
  id: string;
  kind: "leave" | "overtime" | "clock";
  /** LeaveType, "overtime", or a clock-approval kind (out_of_area / off_day). */
  subtype: string;
  startDate: string;
  endDate?: string | null;
  requestedAt: string;
  /** Who it's currently waiting on. */
  stage: "manager" | "hr";
}

const STR = {
  id: {
    greeting: (name: string) => `Halo, ${name} 🌿`,
    reminder: "Jangan lupa absen ya. Semangat bekerja hari ini!",
    pendingTitle: "Menunggu Konfirmasi",
    pendingDesc: "Pengajuan Anda yang masih menunggu persetujuan HR.",
    empty: "Tidak ada pengajuan yang menunggu. Semua beres! 🎉",
    waitingHr: "Menunggu HR",
    waitingMgr: "Menunggu atasan",
    submitted: "Diajukan",
    leave: { annual: "Cuti tahunan", sick: "Sakit", unpaid: "Cuti tanpa gaji", "tukar-libur": "Tukar libur", company: "Dinas / tugas" } as Record<string, string>,
    overtime: "Lembur",
    clock: { out_of_area: "Absensi di luar area", off_day: "Absensi di hari libur" } as Record<string, string>,
  },
  en: {
    greeting: (name: string) => `Hello, ${name} 🌿`,
    reminder: "Don't forget to clock in. Have a great workday!",
    pendingTitle: "Awaiting Confirmation",
    pendingDesc: "Your submissions still waiting for HR approval.",
    empty: "Nothing awaiting confirmation. All caught up! 🎉",
    waitingHr: "Awaiting HR",
    waitingMgr: "Awaiting manager",
    submitted: "Submitted",
    leave: { annual: "Annual leave", sick: "Sick leave", unpaid: "Unpaid leave", "tukar-libur": "Day-off swap", company: "Business trip" } as Record<string, string>,
    overtime: "Overtime",
    clock: { out_of_area: "Out-of-area clock", off_day: "Holiday clock" } as Record<string, string>,
  },
} as const;

function itemMeta(
  item: PendingItem,
  t: { leave: Record<string, string>; overtime: string; clock: Record<string, string> },
) {
  if (item.kind === "leave") return { icon: CalendarDays, label: t.leave[item.subtype] ?? item.subtype, tone: "text-sky" };
  if (item.kind === "overtime") return { icon: Timer, label: t.overtime, tone: "text-[#8a6512]" };
  return {
    icon: item.subtype === "off_day" ? CalendarOff : MapPin,
    label: t.clock[item.subtype] ?? item.subtype,
    tone: "text-forest-600",
  };
}

/**
 * Front-line worker home. Clock-in is the #1 daily action → top, in the thumb
 * zone (Fitts + Von Restorff). Below it: exactly what the worker submitted that
 * still needs HR confirmation — so nothing they're waiting on gets lost.
 */
export function SelfDashboard({
  firstName,
  geofence,
  requireLocation,
  requirePhoto,
  scheduleLabel,
  workDays,
  holidayToday = false,
  holidayName = null,
  todayRecord = null,
  pending = [],
  locale = "id",
}: {
  firstName: string;
  geofence: TeamGeofence;
  requireLocation: boolean;
  requirePhoto: boolean;
  scheduleLabel?: string;
  workDays?: number[];
  holidayToday?: boolean;
  holidayName?: string | null;
  todayRecord?: Pick<AttendanceRecord, "clockIn" | "clockOut"> | null;
  pending?: PendingItem[];
  locale?: Locale;
}) {
  const t = STR[locale];
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
          todayRecord={todayRecord}
        />
      </div>

      {/* Awaiting HR confirmation — the worker's open submissions */}
      <section className="card overflow-hidden">
        <header className="flex items-center gap-2 border-b border-line px-5 py-3.5">
          <ClipboardList className="h-4 w-4 text-forest-600" />
          <h3 className="text-sm font-semibold text-ink">{t.pendingTitle}</h3>
          {pending.length > 0 && (
            <span className="ml-auto rounded-full bg-gold-soft px-2 py-0.5 text-xs font-bold text-[#8a6512]">{pending.length}</span>
          )}
        </header>

        {pending.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
            <CheckCircle2 className="h-8 w-8 text-matcha" />
            <p className="text-sm text-muted">{t.empty}</p>
          </div>
        ) : (
          <>
            <p className="px-5 pt-3 text-xs text-faint">{t.pendingDesc}</p>
            <ul className="divide-y divide-line px-2 py-1">
              {pending.map((item) => {
                const meta = itemMeta(item, t);
                const Icon = meta.icon;
                const range = item.endDate && item.endDate !== item.startDate
                  ? `${formatDate(item.startDate, "short", locale)} – ${formatDate(item.endDate, "short", locale)}`
                  : formatDate(item.startDate, "short", locale);
                return (
                  <li key={`${item.kind}-${item.id}`} className="flex items-center gap-3 px-3 py-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cream ${meta.tone}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{meta.label}</p>
                      <p className="truncate text-xs text-muted">
                        {range} · {t.submitted} {formatDate(item.requestedAt, "short", locale)}
                      </p>
                    </div>
                    <Badge tone="gold" dot>
                      {item.stage === "manager" ? t.waitingMgr : t.waitingHr}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
