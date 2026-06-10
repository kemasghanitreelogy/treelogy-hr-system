import { EmployeesView } from "@/components/employees/employees-view";
import { getEmployees } from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";

export const metadata = { title: "Karyawan — Treelogy HR" };

export default async function EmployeesPage() {
  const [employees, user] = await Promise.all([getEmployees(), getSessionUser()]);
  const canManage = can(user, "employees.manage");
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Database karyawan terpusat — kelola data, status aktif/nonaktif, kompensasi, dan rekening gaji.
      </p>
      <EmployeesView initial={employees} canManage={canManage} />
    </div>
  );
}
