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
import { audienceFromPermissions } from "@/components/layout/nav-items";

export const metadata = { title: "Absensi — Treelogy HR" };

export default async function AttendancePage() {
  const [all, employeesAll, settings, user] = await Promise.all([
    getAttendance(),
    getEmployees(),
    getAttendanceSettings(),
    getSessionUser(),
  ]);
  const canManage = can(user, "attendance.manage");
  // Selain HR/admin hanya melihat absensinya sendiri (RLS sudah membatasi di
  // Supabase; filter ini menjaga perilaku yang sama di mode seed/offline).
  const records = all
    .filter((r) => r.date.startsWith(CURRENT_PERIOD))
    .filter((r) => canManage || (user?.employeeId != null && r.employeeId === user.employeeId));
  const employees = employeesAll.map((e) => ({
    id: e.id,
    name: e.name,
    team: e.team,
    position: e.position,
    workStart: e.workStart ?? "08:00",
    workEnd: e.workEnd ?? "17:00",
  }));
  const dates = Array.from(new Set(records.map((r) => r.date))).sort();

  // Pick the geofence of the division the current user is registered in.
  const me = user?.employeeId ? employeesAll.find((e) => e.id === user.employeeId) : undefined;
  const myGeofence = settings.geofences[me?.team ?? "office"];

  // Karyawan (audience "self") sudah punya widget clock di Beranda — di sini
  // cukup riwayat saja, jangan dobel. HR/admin tetap dapat widget di halaman
  // ini karena Beranda mereka berisi dashboard operasional (tanpa widget).
  const showClockWidget = audienceFromPermissions(user?.permissions ?? []) === "ops";

  const view = (
    <AttendanceView
      records={records}
      employees={employees}
      dates={dates}
      defaultDate={dates.includes(TODAY) ? TODAY : dates[dates.length - 1] ?? TODAY}
      canReviewAll={canManage}
    />
  );

  if (!showClockWidget) {
    return <div className="space-y-4">{view}</div>;
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <ClockWidget
          geofence={myGeofence}
          requireLocation={settings.requireLocation}
          requirePhoto={settings.requirePhoto}
        />
      </div>
      <div className="space-y-4">
        {canManage && <AttendanceSettingsCard initial={settings} />}
        {view}
      </div>
    </div>
  );
}
