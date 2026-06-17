import { ShiftsView } from "@/components/shifts/shifts-view";
import { getEmployees, getScheduleTemplates } from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale-server";
import type { Locale } from "@/lib/i18n";

export const metadata = { title: "Jadwal — Treelogy HR" };

const STR: Record<Locale, { intro: string }> = {
  id: {
    intro: "Atur jadwal kerja (hari & jam) lewat template atau per karyawan.",
  },
  en: {
    intro: "Manage work schedules (days & hours) via templates or per employee.",
  },
};

export default async function ShiftsPage() {
  const [templates, employeesAll, user] = await Promise.all([
    getScheduleTemplates(),
    getEmployees(),
    getSessionUser(),
  ]);
  const locale = await getLocale();
  const t = STR[locale];
  const employees = employeesAll
    .filter((e) => e.status === "active")
    .map((e) => ({
      id: e.id,
      name: e.name,
      team: e.team,
      position: e.position,
      workDays: e.workDays,
      workStart: e.workStart,
      workEnd: e.workEnd,
      scheduleTemplateId: e.scheduleTemplateId,
    }));

  const canApproveAll = can(user, "employees.manage");
  const canManageShifts = canApproveAll || can(user, "shifts.manage");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t.intro}</p>
      <ShiftsView
        templates={templates}
        employees={employees}
        currentEmployeeId={user?.employeeId ?? null}
        canManageShifts={canManageShifts}
      />
    </div>
  );
}
