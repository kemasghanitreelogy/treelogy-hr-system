import { OvertimeView } from "@/components/overtime/overtime-view";
import { getEmployees, getOvertimeRequests } from "@/lib/data";
import { contractRatePerHour } from "@/lib/overtime";
import { can, getSessionUser } from "@/lib/auth";

export const metadata = { title: "Lembur — Treelogy HR" };

export default async function OvertimePage() {
  const [requests, employeesAll, user] = await Promise.all([
    getOvertimeRequests(),
    getEmployees(),
    getSessionUser(),
  ]);
  const employees = employeesAll
    .filter((e) => e.status === "active")
    .map((e) => ({ id: e.id, name: e.name, team: e.team, position: e.position, managerId: e.managerId ?? null }));

  // Same approval scope as leave: HR/admin org-wide; a manager (leave.approve)
  // scoped to their division. Marking PAID is a payroll action.
  const me = user?.employeeId ? employeesAll.find((e) => e.id === user.employeeId) : undefined;
  const canApproveAll = can(user, "employees.manage");
  const approverTeam = !canApproveAll && can(user, "leave.approve") ? me?.team ?? null : null;

  return (
    <div className="space-y-4">
      <OvertimeView
        requests={requests}
        employees={employees}
        currentUserName={user?.name ?? "HR"}
        currentEmployeeId={user?.employeeId ?? null}
        canRequestForOthers={can(user, "leave.approve")}
        canApproveAll={canApproveAll}
        approverTeam={approverTeam}
        selfRatePerHour={me ? contractRatePerHour(me.contractType ?? "pkwt", me.baseSalary, me.hourlyRate ?? 0) : 0}
        selfContractType={me?.contractType ?? "pkwt"}
      />
    </div>
  );
}
