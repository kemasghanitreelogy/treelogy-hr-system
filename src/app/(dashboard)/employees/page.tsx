import { redirect } from "next/navigation";
import { EmployeesView } from "@/components/employees/employees-view";
import { getAllContracts, getEmployees, getRoles, getSystemUsers } from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";

export const metadata = { title: "Karyawan — Treelogy HR" };

export default async function EmployeesPage() {
  const [employees, user, users, contracts] = await Promise.all([
    getEmployees(),
    getSessionUser(),
    getSystemUsers(),
    getAllContracts(),
  ]);
  // Employees DB is HR/admin only (employees.manage) — even division heads are
  // blocked. Guard the route, not just the menu, so it can't be reached by URL.
  if (!can(user, "employees.manage")) redirect("/dashboard");
  const canManage = can(user, "employees.manage");
  const canAssignRoles = can(user, "access.users");
  const roles = getRoles().map((r) => ({ id: r.id, name: r.name, color: r.color }));
  const roleByEmployee: Record<string, string> = {};
  for (const u of users) roleByEmployee[u.employeeId] = u.roleId;
  return (
    <div className="space-y-4">
      <EmployeesView
        initial={employees}
        canManage={canManage}
        canAssignRoles={canAssignRoles}
        roles={roles}
        roleByEmployee={roleByEmployee}
        contracts={contracts}
      />
    </div>
  );
}
