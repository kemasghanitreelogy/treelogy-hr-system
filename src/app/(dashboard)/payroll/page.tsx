import { PayrollView } from "@/components/payroll/payroll-view";
import { PayslipList } from "@/components/payroll/payslip-list";
import {
  CURRENT_PERIOD,
  buildPayslip,
  getAttendanceSince,
  getEmployees,
  getOvertimeRequests,
  getPayrollRuns,
} from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale-server";
import { periodsBack } from "@/lib/utils";
import type { AttendanceRecord, Employee, OvertimeRequest, Payslip } from "@/lib/types";
import type { Locale } from "@/lib/i18n";

export const metadata = { title: "Payroll — Treelogy HR" };

const STR: Record<
  Locale,
  {
    notLinked: string;
    selfIntro: string;
    myPayslips: string;
    opsIntro: string;
  }
> = {
  id: {
    notLinked: "Akun Anda belum tertaut ke data karyawan. Hubungi HR.",
    selfIntro: "Slip gaji Anda per bulan — klik untuk melihat detail. Lembur yang disetujui sudah termasuk di gaji.",
    myPayslips: "Slip Gaji Saya",
    opsIntro: "Payroll otomatis dari rekap hari kerja — gaji bersih sudah termasuk lembur, plus ekspor transfer bank.",
  },
  en: {
    notLinked: "Your account is not linked to an employee record. Contact HR.",
    selfIntro: "Your monthly payslips — click to view details. Approved overtime is included in the salary.",
    myPayslips: "My Payslips",
    opsIntro: "Payroll automated from working-day summaries — net pay already includes overtime, plus bank transfer export.",
  },
};

// Riwayat slip yang ditampilkan: 12 bulan terakhir (difilter lagi di UI).
const HISTORY_MONTHS = 12;

function buildHistory(emps: Employee[], attendance: AttendanceRecord[], overtime: OvertimeRequest[]): Payslip[] {
  const periods = periodsBack(HISTORY_MONTHS, CURRENT_PERIOD);
  return periods.flatMap((p) => {
    const rows = attendance.filter((a) => a.date.startsWith(p));
    return emps.map((e) => buildPayslip(e, p, "pr-" + p, rows, overtime));
  });
}

export default async function PayrollPage() {
  const period = CURRENT_PERIOD;
  const oldest = periodsBack(HISTORY_MONTHS, period)[HISTORY_MONTHS - 1];
  const user = await getSessionUser();
  const locale = await getLocale();
  const t = STR[locale];
  const isOps = can(user, "payroll.process") || can(user, "employees.manage");

  // Absensi hanya untuk jendela riwayat (bukan seluruh tabel) — lebih cepat.
  const [employeesAll, attendance, overtime] = await Promise.all([
    getEmployees(),
    getAttendanceSince(`${oldest}-01`),
    getOvertimeRequests(),
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
    const slips = buildHistory([me], attendance, overtime);
    return (
      <div className="space-y-4 fade-up">
        <p className="text-sm text-muted">
          {t.selfIntro}
        </p>
        <PayslipList slips={slips} employees={[me]} title={t.myPayslips} />
      </div>
    );
  }

  const employees = employeesAll.filter((e) => e.status === "active");
  const [slips, runs] = [buildHistory(employees, attendance, overtime), await getPayrollRuns()];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {t.opsIntro}
      </p>
      <PayrollView slips={slips} employees={employees} runs={runs} period={period} />
    </div>
  );
}
