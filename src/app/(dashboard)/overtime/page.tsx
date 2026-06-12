import { OvertimeView } from "@/components/overtime/overtime-view";
import { getEmployees, getOvertimeRequests } from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale-server";
import type { Locale } from "@/lib/i18n";

export const metadata = { title: "Lembur — Treelogy HR" };

const STR: Record<Locale, { desc1: string; descPaid: string; desc2: string }> = {
  id: {
    desc1: "Ajukan & kelola lembur. Upah lembur = gaji ÷ 20 hari ÷ 8 jam × durasi, dan",
    descPaid: "dibayar terpisah",
    desc2: " dari gaji bulanan.",
  },
  en: {
    desc1: "Request & manage overtime. Overtime pay = salary ÷ 20 days ÷ 8 hours × duration, and is",
    descPaid: "paid separately",
    desc2: " from the monthly salary.",
  },
};

export default async function OvertimePage() {
  const [requests, employeesAll, user, locale] = await Promise.all([
    getOvertimeRequests(),
    getEmployees(),
    getSessionUser(),
    getLocale(),
  ]);
  const t = STR[locale];
  const employees = employeesAll
    .filter((e) => e.status === "active")
    .map((e) => ({ id: e.id, name: e.name, team: e.team, position: e.position }));

  // Same approval scope as leave: HR/admin org-wide; a manager (leave.approve)
  // scoped to their division. Marking PAID is a payroll action.
  const me = user?.employeeId ? employeesAll.find((e) => e.id === user.employeeId) : undefined;
  const canApproveAll = can(user, "employees.manage");
  const approverTeam = !canApproveAll && can(user, "leave.approve") ? me?.team ?? null : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {t.desc1}{" "}
        <span className="font-medium text-ink">{t.descPaid}</span>
        {t.desc2}
      </p>
      <OvertimeView
        requests={requests}
        employees={employees}
        currentUserName={user?.name ?? "HR"}
        currentEmployeeId={user?.employeeId ?? null}
        canRequestForOthers={can(user, "leave.approve")}
        canApproveAll={canApproveAll}
        approverTeam={approverTeam}
        canMarkPaid={can(user, "payroll.process")}
        selfRatePerHour={me ? Math.round(me.baseSalary / (20 * 8)) : 0}
      />
    </div>
  );
}
