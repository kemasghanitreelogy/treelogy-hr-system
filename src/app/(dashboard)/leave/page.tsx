import { LeaveView } from "@/components/leave/leave-view";
import { getEmployees, getLeaveBalances, getLeaveRequests } from "@/lib/data";

export const metadata = { title: "Cuti & Izin — Treelogy HR" };

export default async function LeavePage() {
  const [requests, balances, employeesAll] = await Promise.all([
    getLeaveRequests(),
    getLeaveBalances(),
    getEmployees(),
  ]);
  const employees = employeesAll
    .filter((e) => e.status === "active")
    .map((e) => ({ id: e.id, name: e.name, team: e.team, position: e.position }));
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Kelola cuti tahunan, sakit, dan tabungan libur (terutama untuk tim sales &amp; pabrik).
      </p>
      <LeaveView requests={requests} balances={balances} employees={employees} />
    </div>
  );
}
