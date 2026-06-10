import { OvertimeView } from "@/components/overtime/overtime-view";
import { getEmployees, getOvertimeRequests } from "@/lib/data";
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
    .map((e) => ({ id: e.id, name: e.name, team: e.team, position: e.position }));

  // Same approval scope as leave: HR/admin org-wide; a manager (leave.approve)
  // scoped to their division. Marking PAID is a payroll action.
  const me = user?.employeeId ? employeesAll.find((e) => e.id === user.employeeId) : undefined;
  const canApproveAll = can(user, "employees.manage");
  const approverTeam = !canApproveAll && can(user, "leave.approve") ? me?.team ?? null : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Ajukan &amp; kelola lembur. Upah lembur = gaji ÷ 20 hari ÷ 8 jam × durasi, dan{" "}
        <span className="font-medium text-ink">dibayar terpisah</span> dari gaji bulanan.
      </p>
      <OvertimeView
        requests={requests}
        employees={employees}
        currentUserName={user?.name ?? "HR"}
        currentEmployeeId={user?.employeeId ?? null}
        canRequestForOthers={can(user, "leave.approve")}
        canApproveAll={canApproveAll}
        approverTeam={approverTeam}
        canMarkPaid={can(user, "payroll.process")}
        selfRatePerHour={me ? Math.round(me.baseSalary / (20 * 8)) : 0}
      />
    </div>
  );
}
