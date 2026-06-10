import { EmployeesView } from "@/components/employees/employees-view";
import { getEmployees, getRoles, getSystemUsers } from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";

export const metadata = { title: "Karyawan — Treelogy HR" };

export default async function EmployeesPage() {
  const [employees, user, users] = await Promise.all([
    getEmployees(),
    getSessionUser(),
    getSystemUsers(),
  ]);
  const canManage = can(user, "employees.manage");
  const canAssignRoles = can(user, "access.users");
  const roles = getRoles().map((r) => ({ id: r.id, name: r.name, color: r.color }));
  const roleByEmployee: Record<string, string> = {};
  for (const u of users) roleByEmployee[u.employeeId] = u.roleId;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Database karyawan terpusat — kelola data, status aktif/nonaktif, kompensasi, dan rekening gaji.
      </p>
      <EmployeesView
        initial={employees}
        canManage={canManage}
        canAssignRoles={canAssignRoles}
        roles={roles}
        roleByEmployee={roleByEmployee}
      />
    </div>
  );
}
