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

export default async function ShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ employee?: string }>;
}) {
  const [templates, employeesAll, user, params] = await Promise.all([
    getScheduleTemplates(),
    getEmployees(),
    getSessionUser(),
    searchParams,
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
      scheduleSet: e.scheduleSet,
    }));

  const canApproveAll = can(user, "employees.manage");
  const canManageShifts = canApproveAll || can(user, "shifts.manage");
  // Deep-link dari alur "Tambah Karyawan": /shifts?employee=<id> membuka
  // langsung editor jadwal karyawan tsb (hanya untuk pengelola jadwal).
  const focusEmployeeId =
    canManageShifts && params.employee && employees.some((e) => e.id === params.employee)
      ? params.employee
      : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t.intro}</p>
      <ShiftsView
        templates={templates}
        employees={employees}
        currentEmployeeId={user?.employeeId ?? null}
        canManageShifts={canManageShifts}
        focusEmployeeId={focusEmployeeId}
      />
    </div>
  );
}
