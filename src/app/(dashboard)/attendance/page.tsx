import { ClockWidget } from "@/components/attendance/clock-widget";
import { AttendanceView } from "@/components/attendance/attendance-view";
import { AttendanceSettingsCard } from "@/components/attendance/attendance-settings-card";
import {
  CURRENT_PERIOD,
  TODAY,
  getAttendance,
  getAttendanceSettings,
  getClockApprovals,
  getEmployees,
  getHolidays,
  getHolidayToday,
  getOvertimeRequests,
} from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";
import { audienceFromPermissions } from "@/components/layout/nav-items";
import { witaToday } from "@/lib/utils";

export const metadata = { title: "Absensi — Treelogy HR" };

export default async function AttendancePage() {
  const [all, employeesAll, settings, user, approvalsAll, overtimeAll, holidaysAll] = await Promise.all([
    getAttendance(),
    getEmployees(),
    getAttendanceSettings(),
    getSessionUser(),
    getClockApprovals(),
    getOvertimeRequests(),
    getHolidays(),
  ]);
  const pendingApprovals = approvalsAll.filter((a) => a.status === "pending");
  const canManage = can(user, "attendance.manage");
  // Lembur disetujui pada periode berjalan → bagian "Daftar Lembur" pada ekspor XLSX (HR saja).
  const overtime = canManage
    ? overtimeAll
        .filter((o) => o.status === "approved" && o.date.startsWith(CURRENT_PERIOD))
        .map((o) => ({ employeeId: o.employeeId, date: o.date, hours: o.hours }))
    : [];
  // Hari libur nasional (publik) → grid edit-massal tidak menganggapnya sel kosong.
  const holidayDates = canManage
    ? holidaysAll.filter((h) => h.type === "public").map((h) => h.date)
    : [];
  // Selain HR/admin hanya melihat absensinya sendiri (RLS sudah membatasi di
  // Supabase; filter ini menjaga perilaku yang sama di mode seed/offline).
  const records = all
    .filter((r) => r.date.startsWith(CURRENT_PERIOD))
    .filter((r) => canManage || (user?.employeeId != null && r.employeeId === user.employeeId));
  const employees = employeesAll.map((e) => ({
    id: e.id,
    nik: e.nik,
    name: e.name,
    team: e.team,
    position: e.position,
    workStart: e.workStart ?? "08:00",
    workEnd: e.workEnd ?? "17:00",
    workDays: e.workDays ?? [1, 2, 3, 4, 5],
  }));
  const dates = Array.from(new Set(records.map((r) => r.date))).sort();

  // Pick the geofence of the division the current user is registered in.
  const me = user?.employeeId ? employeesAll.find((e) => e.id === user.employeeId) : undefined;
  const myGeofence = settings.geofences[me?.team ?? "office"];
  // Today's holiday that applies to this employee (drives the swap/overtime prompt).
  const holidayToday = await getHolidayToday(me?.religion);

  // Karyawan (audience "self") sudah punya widget clock di Beranda — di sini
  // cukup riwayat saja, jangan dobel. HR/admin tetap dapat widget di halaman
  // ini karena Beranda mereka berisi dashboard operasional (tanpa widget).
  const showClockWidget = audienceFromPermissions(user?.permissions ?? []) === "ops";
  // Today's record (WITA) so the clock widget reflects clocked-in state on refresh.
  const today = witaToday();
  const todayRecord = all.find((r) => r.employeeId === user?.employeeId && r.date === today) ?? null;

  const view = (
    <AttendanceView
      records={records}
      employees={employees}
      dates={dates}
      defaultDate={dates.includes(TODAY) ? TODAY : dates[dates.length - 1] ?? TODAY}
      canReviewAll={canManage}
      approvals={canManage ? pendingApprovals : []}
      overtime={overtime}
      holidays={holidayDates}
      currentUserName={user?.name ?? "HR"}
      currentEmployeeId={user?.employeeId ?? null}
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
          workDays={me?.workDays}
          holidayToday={holidayToday != null}
          holidayName={holidayToday?.name ?? null}
          todayRecord={todayRecord}
        />
      </div>
      <div className="space-y-4">
        {canManage && <AttendanceSettingsCard initial={settings} googleMapsApiKey={process.env.GOOGLE_MAP_API_KEY ?? ""} />}
        {view}
      </div>
    </div>
  );
}
