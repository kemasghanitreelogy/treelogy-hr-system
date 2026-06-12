import { ShiftsView } from "@/components/shifts/shifts-view";
import { getEmployees, getLeaveBalances, getShiftAssignments, getShifts, getTabunganEntries } from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale-server";
import type { Locale } from "@/lib/i18n";

export const metadata = { title: "Shift & Jadwal — Treelogy HR" };

const STR: Record<Locale, { intro: string }> = {
  id: {
    intro: "Atur shift untuk tim pabrik & kebun, dan kelola tabungan libur (kerja hari libur & pencairannya).",
  },
  en: {
    intro: "Manage shifts for the factory & farm teams, and manage leave savings (working on days off & withdrawals).",
  },
};

export default async function ShiftsPage() {
  const [shifts, assignments, entries, balances, employeesAll, user] = await Promise.all([
    getShifts(),
    getShiftAssignments(),
    getTabunganEntries(),
    getLeaveBalances(),
    getEmployees(),
    getSessionUser(),
  ]);
  const locale = await getLocale();
  const t = STR[locale];
  const employees = employeesAll.map((e) => ({
    id: e.id,
    name: e.name,
    team: e.team,
    position: e.position,
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
  // everyone else sees only their own entries. (RLS enforces the same on reads;
  // this keeps it correct even in the seedless/offline path.)
  const teamOf = new Map(employeesAll.map((e) => [e.id, e.team]));
  const visibleEntries = entries.filter((e) => {
    if (canApproveAll) return true;
    if (user?.employeeId && e.employeeId === user.employeeId) return true;
    if (approverTeam) return teamOf.get(e.employeeId) === approverTeam;
    return false;
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {t.intro}
      </p>
      <ShiftsView
        shifts={shifts}
        assignments={assignments}
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
    </div>
  );
}
