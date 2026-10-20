import { ClockWidget } from "@/components/attendance/clock-widget";
import { AttendanceView } from "@/components/attendance/attendance-view";
import { AttendanceSettingsCard } from "@/components/attendance/attendance-settings-card";
import {
  liveToday,
  livePeriod,
  getAttendanceForPeriod,
  getAttendanceSettings,
  getEmployees,
  getHolidays,
  getHolidayToday,
  getPendingClockApprovals,
  getTodayClockState,
} from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";

export const metadata = { title: "Absensi — Treelogy Workspace" };

export default async function AttendancePage() {
  // Periode/hari "berjalan": tanggal WITA nyata saat live, konstanta demo saat seed.
  const period = livePeriod();
  const today = liveToday();
  const user = await getSessionUser();
  // Hanya periode berjalan + pengajuan pending + state clock hari ini — bukan
  // seluruh riwayat absensi yang terus bertambah.
  const [all, employeesAll, settings, pendingApprovals, holidaysAll, clock] = await Promise.all([
    getAttendanceForPeriod(period),
    getEmployees(),
    getAttendanceSettings(),
    getPendingClockApprovals(),
    getHolidays(),
    getTodayClockState(user?.employeeId ?? null),
  ]);
  const canManage = can(user, "attendance.manage");
  // Hari libur nasional (publik) → grid edit-massal tidak menganggapnya sel kosong.
  const holidayDates = canManage
    ? holidaysAll.filter((h) => h.type === "public").map((h) => h.date)
    : [];
  // Selain HR/admin hanya melihat absensinya sendiri (RLS sudah membatasi di
  // Supabase; filter ini menjaga perilaku yang sama di mode seed/offline).
  const records = all
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

  // Widget clock tampil untuk SIAPA PUN yang punya data karyawan.
  //
  // Dulu karyawan biasa sengaja tidak diberi widget di sini (sudah ada di
  // Beranda), tapi notifikasi pengingat clock-in/out menautkan ke halaman ini —
  // dan mereka mendarat di halaman tanpa tombolnya, lalu harus mencari sendiri.
  // Pengingat harus mendarat tepat di tempat aksinya.
  const showClockWidget = Boolean(user?.employeeId);
  // State clock hari ini (termasuk clock-in yang masih menunggu HR) supaya
  // tombolnya tetap "Clock Out" setelah aplikasi dibuka ulang.
  const { todayRecord, todayPending } = clock;

  const view = (
    <AttendanceView
      records={records}
      employees={employees}
      dates={dates}
      defaultDate={dates.includes(today) ? today : dates[dates.length - 1] ?? today}
      canReviewAll={canManage}
      approvals={canManage ? pendingApprovals : []}
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
          todayPending={todayPending}
        />
      </div>
      <div className="space-y-4">
        {canManage && <AttendanceSettingsCard initial={settings} googleMapsApiKey={process.env.GOOGLE_MAP_API_KEY ?? ""} />}
        {view}
      </div>
    </div>
  );
}
