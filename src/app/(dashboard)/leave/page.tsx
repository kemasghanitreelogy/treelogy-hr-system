import { LeaveView } from "@/components/leave/leave-view";
import { getAllContracts, getEmployees, getLeaveBalances, getLeaveRequests, getTabunganEntries, liveAsOfDate } from "@/lib/data";
import { applyTenureQuota, earliestContractStart, tenureStart } from "@/lib/leave-policy";
import { can, getSessionUser } from "@/lib/auth";

export const metadata = { title: "Cuti & Izin — Treelogy Workspace" };

export default async function LeavePage() {
  const [requests, balancesRaw, tabungan, employeesAll, contracts, user] = await Promise.all([
    getLeaveRequests(),
    getLeaveBalances(),
    getTabunganEntries(),
    getEmployees(),
    getAllContracts(),
    getSessionUser(),
  ]);
  // Annual leave only accrues after 1 full year of service (from contract start).
  const balances = applyTenureQuota(balancesRaw, employeesAll, contracts, liveAsOfDate());
  // Tenure anchor per employee (earliest contract start → join date) for history.
  const starts = earliestContractStart(contracts);
  const tenureStarts: Record<string, string> = {};
  for (const e of employeesAll) {
    const s = tenureStart(e.joinDate, starts.get(e.id));
    if (s) tenureStarts[e.id] = s;
  }
  const employees = employeesAll
    .filter((e) => e.status === "active")
    .map((e) => ({ id: e.id, name: e.name, team: e.team, position: e.position, managerId: e.managerId ?? null }));

  // Approval scope: HR/admin (employees.manage) act org-wide; a manager with
  // leave.approve is scoped to their own division (team). Plain staff: neither.
  const me = user?.employeeId ? employeesAll.find((e) => e.id === user.employeeId) : undefined;
  const canApproveAll = can(user, "employees.manage");
  const approverTeam = !canApproveAll && can(user, "leave.approve") ? me?.team ?? null : null;
  return (
    <div className="space-y-4">
      <LeaveView
        requests={requests}
        balances={balances}
        tabungan={tabungan}
        employees={employees}
        tenureStarts={tenureStarts}
        currentUserName={user?.name ?? "HR"}
        currentEmployeeId={user?.employeeId ?? null}
        canRequestForOthers={can(user, "leave.approve")}
        canApproveAll={canApproveAll}
        approverTeam={approverTeam}
      />
    </div>
  );
}
