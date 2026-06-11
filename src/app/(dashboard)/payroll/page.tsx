import { PayrollView } from "@/components/payroll/payroll-view";
import { PayslipList } from "@/components/payroll/payslip-list";
import {
  CURRENT_PERIOD,
  buildPayslip,
  getAttendance,
  getEmployees,
  getPayrollRuns,
} from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";
import { periodsBack } from "@/lib/utils";
import type { AttendanceRecord, Employee, Payslip } from "@/lib/types";

export const metadata = { title: "Payroll — Treelogy HR" };

// Riwayat slip yang ditampilkan: 12 bulan terakhir (difilter lagi di UI).
const HISTORY_MONTHS = 12;

function buildHistory(emps: Employee[], attendance: AttendanceRecord[]): Payslip[] {
  const periods = periodsBack(HISTORY_MONTHS, CURRENT_PERIOD);
  return periods.flatMap((p) => {
    const rows = attendance.filter((a) => a.date.startsWith(p));
    return emps.map((e) => buildPayslip(e, p, "pr-" + p, rows));
  });
}

export default async function PayrollPage() {
  const period = CURRENT_PERIOD;
  const user = await getSessionUser();
  const isOps = can(user, "payroll.process") || can(user, "employees.manage");

  const [employeesAll, attendance] = await Promise.all([getEmployees(), getAttendance()]);

  // Self-service: a plain employee sees ONLY their own payslips, built from
  // their RLS-scoped attendance. No runs, no other people's pay.
  if (!isOps) {
    const me = user?.employeeId ? employeesAll.find((e) => e.id === user.employeeId) : undefined;
    if (!me) {
      return (
        <div className="card px-5 py-10 text-center text-sm text-faint">
          Akun Anda belum tertaut ke data karyawan. Hubungi HR.
        </div>
      );
    }
    const slips = buildHistory([me], attendance);
    return (
      <div className="space-y-4 fade-up">
        <p className="text-sm text-muted">
          Slip gaji Anda per bulan — klik untuk melihat detail. Lembur dibayar terpisah lewat menu Lembur.
        </p>
        <PayslipList slips={slips} employees={[me]} title="Slip Gaji Saya" />
      </div>
    );
  }

  const employees = employeesAll.filter((e) => e.status === "active");
  const [slips, runs] = [buildHistory(employees, attendance), await getPayrollRuns()];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Payroll otomatis dari rekap hari kerja — BPJS, PPh 21 (TER), dan ekspor transfer bank. Lembur dibayar terpisah.
      </p>
      <PayrollView slips={slips} employees={employees} runs={runs} period={period} />
    </div>
  );
}
