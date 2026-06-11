import { PayrollView } from "@/components/payroll/payroll-view";
import { PayslipDetail } from "@/components/payroll/payslip-detail";
import { Card, CardContent } from "@/components/ui/card";
import {
  CURRENT_PERIOD,
  buildPayslip,
  getAttendance,
  getEmployees,
  getPayrollRuns,
  getPayslipsForRun,
} from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";
import { monthLabel } from "@/lib/utils";

export const metadata = { title: "Payroll — Treelogy HR" };

export default async function PayrollPage() {
  const period = CURRENT_PERIOD;
  const user = await getSessionUser();
  const isOps = can(user, "payroll.process") || can(user, "employees.manage");

  // Self-service: a plain employee sees ONLY their own payslip, built from
  // their RLS-scoped attendance. No runs, no other people's pay.
  if (!isOps) {
    const [employees, attendance] = await Promise.all([getEmployees(), getAttendance()]);
    const me = user?.employeeId ? employees.find((e) => e.id === user.employeeId) : undefined;
    if (!me) {
      return (
        <div className="card px-5 py-10 text-center text-sm text-faint">
          Akun Anda belum tertaut ke data karyawan. Hubungi HR.
        </div>
      );
    }
    const periodRows = attendance.filter((a) => a.date.startsWith(period));
    const slip = buildPayslip(me, period, "pr-" + period, periodRows);
    return (
      <div className="space-y-4 fade-up">
        <p className="text-sm text-muted">
          Slip gaji Anda · {monthLabel(period)}. Lembur dibayar terpisah lewat menu Lembur.
        </p>
        <Card>
          <CardContent>
            <PayslipDetail slip={slip} emp={me} />
          </CardContent>
        </Card>
      </div>
    );
  }

  const [slips, employeesAll, runs] = await Promise.all([
    getPayslipsForRun("pr-" + period, period),
    getEmployees(),
    getPayrollRuns(),
  ]);
  const employees = employeesAll.filter((e) => e.status === "active");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Payroll otomatis dari rekap hari kerja — BPJS, PPh 21 (TER), dan ekspor transfer bank. Lembur dibayar terpisah.
      </p>
      <PayrollView slips={slips} employees={employees} runs={runs} period={period} />
    </div>
  );
}
