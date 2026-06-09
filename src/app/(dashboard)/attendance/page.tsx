import { ClockWidget } from "@/components/attendance/clock-widget";
import { AttendanceView } from "@/components/attendance/attendance-view";
import { AttendanceSettingsCard } from "@/components/attendance/attendance-settings-card";
import {
  CURRENT_PERIOD,
  TODAY,
  getAttendance,
  getAttendanceSettings,
  getEmployees,
} from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";

export const metadata = { title: "Absensi — Treelogy HR" };

export default async function AttendancePage() {
  const [all, employeesAll, settings, user] = await Promise.all([
    getAttendance(),
    getEmployees(),
    getAttendanceSettings(),
    getSessionUser(),
  ]);
  const records = all.filter((r) => r.date.startsWith(CURRENT_PERIOD));
  const employees = employeesAll.map((e) => ({
    id: e.id,
    name: e.name,
    team: e.team,
    position: e.position,
  }));
  const dates = Array.from(new Set(records.map((r) => r.date))).sort();
  const canManage = can(user, "attendance.manage");

  return (
    <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <ClockWidget settings={settings} />
      </div>
      <div className="space-y-4">
        {canManage && <AttendanceSettingsCard initial={settings} />}
        <AttendanceView
          records={records}
          employees={employees}
          dates={dates}
          defaultDate={dates.includes(TODAY) ? TODAY : dates[dates.length - 1] ?? TODAY}
        />
      </div>
    </div>
  );
}
