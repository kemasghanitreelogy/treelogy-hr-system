import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PayslipDetail } from "@/components/payroll/payslip-detail";
import { Card, CardContent } from "@/components/ui/card";
import { buildPayslip, getAttendanceForEmployee, getEmployees, getOvertimeRequests } from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale-server";
import type { Locale } from "@/lib/i18n";

export const metadata = { title: "Detail Slip Gaji — Treelogy Workspace" };

const STR: Record<Locale, { backToPayroll: string }> = {
  id: { backToPayroll: "Kembali ke Payroll" },
  en: { backToPayroll: "Back to Payroll" },
};

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function PayslipPage({
  params,
}: {
  params: Promise<{ period: string; employeeId: string }>;
}) {
  const { period, employeeId } = await params;
  if (!PERIOD_RE.test(period)) notFound();

  const user = await getSessionUser();
  const locale = await getLocale();
  const t = STR[locale];
  const isOps = can(user, "payroll.process") || can(user, "employees.manage");
  // Karyawan biasa hanya boleh membuka slip miliknya sendiri.
  if (!isOps && user?.employeeId !== employeeId) notFound();

  const [employees, periodRows, overtime] = await Promise.all([
    getEmployees(),
    getAttendanceForEmployee(employeeId, period),
    getOvertimeRequests(),
  ]);
  const emp = employees.find((e) => e.id === employeeId);
  if (!emp) notFound();

  const slip = buildPayslip(emp, period, "pr-" + period, periodRows, overtime);

  return (
    <div className="space-y-4 fade-up">
      <Link
        href="/payroll"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> {t.backToPayroll}
      </Link>
      <Card>
        <CardContent>
          <PayslipDetail slip={slip} emp={emp} />
        </CardContent>
      </Card>
    </div>
  );
}
