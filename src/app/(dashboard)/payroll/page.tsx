import { PayrollView } from "@/components/payroll/payroll-view";
import { PayslipList } from "@/components/payroll/payslip-list";
import {
  livePeriod,
  buildPayslip,
  getAttendanceSince,
  getEmployees,
  getLeaveRequests,
  getOvertimeRequests,
  getPayrollRuns,
} from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale-server";
import { periodsBack } from "@/lib/utils";
import type { AttendanceRecord, Employee, LeaveRequest, OvertimeRequest, Payslip } from "@/lib/types";
import type { Locale } from "@/lib/i18n";

export const metadata = { title: "Payroll — Treelogy Workspace" };

const STR: Record<
  Locale,
  {
    notLinked: string;
    myPayslips: string;
  }
> = {
  id: {
    notLinked: "Akun Anda belum tertaut ke data karyawan. Hubungi HR.",
    myPayslips: "Slip Gaji Saya",
  },
  en: {
    notLinked: "Your account is not linked to an employee record. Contact HR.",
    myPayslips: "My Payslips",
  },
};

// Batas fetch absensi (agar tidak menarik seluruh tabel); slip-nya sendiri hanya
// dibuat untuk bulan yang BENAR-BENAR punya data tersimpan (lihat buildHistory).
const HISTORY_MONTHS = 12;

function buildHistory(emps: Employee[], attendance: AttendanceRecord[], overtime: OvertimeRequest[], leave: LeaveRequest[]): Payslip[] {
  // Hanya bulan yang memiliki data absensi tersimpan — jangan mengarang slip untuk
  // bulan kosong sebelum sistem berjalan (mis. Jan–Mei 2026 / 2025).
  const periods = [...new Set(attendance.map((a) => a.date.slice(0, 7)))]
    .filter((p) => p <= livePeriod())
    .sort()
    .reverse(); // terbaru dulu
  return periods.flatMap((p) => {
    const rows = attendance.filter((a) => a.date.startsWith(p));
    return emps.map((e) => buildPayslip(e, p, "pr-" + p, rows, overtime, leave));
  });
}

export default async function PayrollPage() {
  const period = livePeriod();
  const oldest = periodsBack(HISTORY_MONTHS, period)[HISTORY_MONTHS - 1];
  const user = await getSessionUser();
  const locale = await getLocale();
  const t = STR[locale];
  // `employees.manage` DULU ikut membuka mode operasional — artinya siapa pun
  // yang boleh mengelola data karyawan otomatis melihat gaji semua orang.
  // Keduanya dipisah supaya hak "kelola karyawan" bisa diberikan tanpa
  // sekalian menyerahkan besaran gaji seisi kantor.
  const isOps = can(user, "payroll.process") || can(user, "payroll.salary");

  // Absensi hanya untuk jendela riwayat (bukan seluruh tabel) — lebih cepat.
  const [employeesAll, attendance, overtime, leave] = await Promise.all([
    getEmployees(),
    getAttendanceSince(`${oldest}-01`),
    getOvertimeRequests(),
    getLeaveRequests(),
  ]);

  // Self-service: a plain employee sees ONLY their own payslips, built from
  // their RLS-scoped attendance. No runs, no other people's pay.
  if (!isOps) {
    const me = user?.employeeId ? employeesAll.find((e) => e.id === user.employeeId) : undefined;
    if (!me) {
      return (
        <div className="card px-5 py-10 text-center text-sm text-faint">
          {t.notLinked}
        </div>
      );
    }
    const slips = buildHistory([me], attendance, overtime, leave);
    return (
      <div className="space-y-4 fade-up">
        <PayslipList slips={slips} employees={[me]} title={t.myPayslips} />
      </div>
    );
  }

  const employees = employeesAll.filter((e) => e.status === "active");
  const [slips, runs] = [buildHistory(employees, attendance, overtime, leave), await getPayrollRuns()];

  return (
    <div className="space-y-4">
      <PayrollView slips={slips} employees={employees} runs={runs} period={period} />
    </div>
  );
}
