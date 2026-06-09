import { PayrollView } from "@/components/payroll/payroll-view";
import { CURRENT_PERIOD, getEmployees, getPayrollRuns, getPayslipsForRun } from "@/lib/data";

export const metadata = { title: "Payroll — Treelogy HR" };

export default async function PayrollPage() {
  const period = CURRENT_PERIOD;
  const [slips, employeesAll, runs] = await Promise.all([
    getPayslipsForRun("pr-" + period, period),
    getEmployees(),
    getPayrollRuns(),
  ]);
  const employees = employeesAll.filter((e) => e.status === "active");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Payroll otomatis dari rekap hari kerja — termasuk BPJS, PPh 21 (TER), lembur, dan ekspor transfer bank.
      </p>
      <PayrollView slips={slips} employees={employees} runs={runs} period={period} />
    </div>
  );
}
