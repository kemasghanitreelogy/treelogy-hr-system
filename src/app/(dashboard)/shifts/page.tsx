import { ShiftsView } from "@/components/shifts/shifts-view";
import { HolidaysCard } from "@/components/shifts/holidays-card";
import { getEmployees, getHolidays, getLeaveBalances, getScheduleTemplates, getTabunganEntries } from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale-server";
import type { Locale } from "@/lib/i18n";

export const metadata = { title: "Shift & Jadwal — Treelogy HR" };

const STR: Record<Locale, { intro: string }> = {
  id: {
    intro: "Atur jadwal kerja (hari & jam) lewat template atau per karyawan, dan kelola tabungan libur.",
  },
  en: {
    intro: "Manage work schedules (days & hours) via templates or per employee, and manage leave savings.",
  },
};

export default async function ShiftsPage() {
  const [templates, entries, balances, employeesAll, user, holidays] = await Promise.all([
    getScheduleTemplates(),
    getTabunganEntries(),
    getLeaveBalances(),
    getEmployees(),
    getSessionUser(),
    getHolidays(),
  ]);
  const locale = await getLocale();
  const t = STR[locale];
  const employees = employeesAll
    .filter((e) => e.status === "active")
    .map((e) => ({
      id: e.id,
      name: e.name,
      team: e.team,
      position: e.position,
      workDays: e.workDays,
      workStart: e.workStart,
      workEnd: e.workEnd,
      scheduleTemplateId: e.scheduleTemplateId,
    }));

  // Approval scope mirrors leave: HR/admin act org-wide; a manager with
  // shifts.swap_approve is scoped to their own division.
  const me = user?.employeeId ? employeesAll.find((e) => e.id === user.employeeId) : undefined;
  const canApproveAll = can(user, "employees.manage");
  const approverTeam = !canApproveAll && can(user, "shifts.swap_approve") ? me?.team ?? null : null;
  const canManageShifts = canApproveAll || can(user, "shifts.manage");
  const selfBalance = user?.employeeId
    ? balances.find((b) => b.employeeId === user.employeeId)?.tabunganLibur ?? 0
    : 0;

  // Visibility: HR/admin see everyone; a division manager sees their own team;
  // everyone else sees only their own entries (RLS enforces the same on reads).
  const teamOf = new Map(employeesAll.map((e) => [e.id, e.team]));
  const visibleEntries = entries.filter((e) => {
    if (canApproveAll) return true;
    if (user?.employeeId && e.employeeId === user.employeeId) return true;
    if (approverTeam) return teamOf.get(e.employeeId) === approverTeam;
    return false;
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t.intro}</p>
      <ShiftsView
        templates={templates}
        entries={visibleEntries}
        employees={employees}
        currentUserName={user?.name ?? "HR"}
        currentEmployeeId={user?.employeeId ?? null}
        canRequestForOthers={canApproveAll}
        canApproveAll={canApproveAll}
        approverTeam={approverTeam}
        canManageShifts={canManageShifts}
        selfBalance={selfBalance}
      />
      {canManageShifts && <HolidaysCard holidays={holidays} />}
    </div>
  );
}
