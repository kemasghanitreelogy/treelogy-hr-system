import { redirect } from "next/navigation";
import { TravelView } from "@/components/travel/travel-view";
import { can, getSessionUser } from "@/lib/auth";
import { getEmployees, getTravelRequests, liveToday } from "@/lib/data";

export const metadata = { title: "Perjalanan Dinas — Treelogy HR" };

export default async function TravelPage() {
  const [requests, employeesAll, user] = await Promise.all([
    getTravelRequests(),
    getEmployees(),
    getSessionUser(),
  ]);

  // Menu di-gate perm yang sama; guard ini menutup akses lewat URL langsung.
  if (!can(user, "travel.view")) redirect("/dashboard");

  // Persetujuan DUA TAHAP: tahap 1 pemegang travel.approve (Ops/GA), tahap 2
  // pemegang travel.finalize (Finance; Admin cadangan). Siapa orangnya diatur
  // lewat peran di Peran & Akses (dicek ulang di API + RLS — ini murni tombol).
  const canApproveAll = can(user, "travel.approve");
  const canFinalize = can(user, "travel.finalize") || can(user, "employees.manage");
  const canRequestForOthers = can(user, "employees.manage");

  const employees = employeesAll
    .filter((e) => e.status === "active")
    .map((e) => ({
      id: e.id,
      name: e.name,
      position: e.position ?? "",
      managerId: e.managerId ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <TravelView
        requests={requests}
        employees={employees}
        currentEmployeeId={user?.employeeId ?? null}
        canApproveAll={canApproveAll}
        canFinalize={canFinalize}
        canRequestForOthers={canRequestForOthers}
        today={liveToday()}
      />
    </div>
  );
}
