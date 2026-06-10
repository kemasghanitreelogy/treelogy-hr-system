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
      />
    </div>
  );
}
