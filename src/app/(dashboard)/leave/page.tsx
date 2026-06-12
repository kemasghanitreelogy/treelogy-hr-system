import { LeaveView } from "@/components/leave/leave-view";
import { getEmployees, getLeaveBalances, getLeaveRequests, getTabunganEntries } from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale-server";
import type { Locale } from "@/lib/i18n";

export const metadata = { title: "Cuti & Izin — Treelogy HR" };

const STR: Record<Locale, { approverDesc: string; staffDesc: string }> = {
  id: {
    approverDesc: "Kelola cuti tahunan, sakit, dan tabungan libur karyawan.",
    staffDesc: "Ajukan cuti/izin dan pantau saldo serta tabungan libur Anda.",
  },
  en: {
    approverDesc: "Manage employees' annual leave, sick leave, and day-off savings.",
    staffDesc: "Request leave and track your balance and day-off savings.",
  },
};

export default async function LeavePage() {
  const [requests, balances, tabungan, employeesAll, user, locale] = await Promise.all([
    getLeaveRequests(),
    getLeaveBalances(),
    getTabunganEntries(),
    getEmployees(),
    getSessionUser(),
    getLocale(),
  ]);
  const t = STR[locale];
  const employees = employeesAll
    .filter((e) => e.status === "active")
    .map((e) => ({ id: e.id, name: e.name, team: e.team, position: e.position }));

  // Approval scope: HR/admin (employees.manage) act org-wide; a manager with
  // leave.approve is scoped to their own division (team). Plain staff: neither.
  const me = user?.employeeId ? employeesAll.find((e) => e.id === user.employeeId) : undefined;
  const canApproveAll = can(user, "employees.manage");
  const approverTeam = !canApproveAll && can(user, "leave.approve") ? me?.team ?? null : null;
  const isApprover = canApproveAll || approverTeam != null;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {isApprover ? t.approverDesc : t.staffDesc}
      </p>
      <LeaveView
        requests={requests}
        balances={balances}
        tabungan={tabungan}
        employees={employees}
        currentUserName={user?.name ?? "HR"}
        currentEmployeeId={user?.employeeId ?? null}
        canRequestForOthers={can(user, "leave.approve")}
        canApproveAll={canApproveAll}
        approverTeam={approverTeam}
      />
    </div>
  );
}
