import { EmployeesView } from "@/components/employees/employees-view";
import { getEmployees, getRoles, getSystemUsers } from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale-server";
import type { Locale } from "@/lib/i18n";

export const metadata = { title: "Karyawan — Treelogy HR" };

const STR: Record<Locale, { description: string }> = {
  id: {
    description:
      "Database karyawan terpusat — kelola data, status aktif/nonaktif, kompensasi, dan rekening gaji.",
  },
  en: {
    description:
      "Centralized employee database — manage data, active/inactive status, compensation, and salary accounts.",
  },
};

export default async function EmployeesPage() {
  const [employees, user, users, locale] = await Promise.all([
    getEmployees(),
    getSessionUser(),
    getSystemUsers(),
    getLocale(),
  ]);
  const t = STR[locale];
  const canManage = can(user, "employees.manage");
  const canAssignRoles = can(user, "access.users");
  const roles = getRoles().map((r) => ({ id: r.id, name: r.name, color: r.color }));
  const roleByEmployee: Record<string, string> = {};
  for (const u of users) roleByEmployee[u.employeeId] = u.roleId;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t.description}</p>
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
