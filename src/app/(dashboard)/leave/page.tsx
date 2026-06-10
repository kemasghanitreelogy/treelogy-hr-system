import { LeaveView } from "@/components/leave/leave-view";
import { getEmployees, getLeaveBalances, getLeaveRequests } from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";

export const metadata = { title: "Cuti & Izin — Treelogy HR" };

export default async function LeavePage() {
  const [requests, balances, employeesAll, user] = await Promise.all([
    getLeaveRequests(),
    getLeaveBalances(),
    getEmployees(),
    getSessionUser(),
  ]);
  const employees = employeesAll
    .filter((e) => e.status === "active")
    .map((e) => ({ id: e.id, name: e.name, team: e.team, position: e.position }));

  // Approval scope: HR/admin (employees.manage) act org-wide; a manager with
  // leave.approve is scoped to their own division (team). Plain staff: neither.
  const me = user?.employeeId ? employeesAll.find((e) => e.id === user.employeeId) : undefined;
  const canApproveAll = can(user, "employees.manage");
  const approverTeam = !canApproveAll && can(user, "leave.approve") ? me?.team ?? null : null;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Kelola cuti tahunan, sakit, dan tabungan libur (terutama untuk tim sales &amp; pabrik).
      </p>
      <LeaveView
        requests={requests}
        balances={balances}
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
