import { EmployeesView } from "@/components/employees/employees-view";
import { getEmployees } from "@/lib/data";

export const metadata = { title: "Karyawan — Treelogy HR" };

export default async function EmployeesPage() {
  const employees = await getEmployees();
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Database karyawan terpusat — kelola data, status aktif/nonaktif, kompensasi, dan rekening gaji.
      </p>
      <EmployeesView initial={employees} />
    </div>
  );
}
