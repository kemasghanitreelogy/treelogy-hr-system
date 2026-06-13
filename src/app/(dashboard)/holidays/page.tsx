import { HolidaysView } from "@/components/holidays/holidays-view";
import { getHolidays } from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale-server";
import type { Locale } from "@/lib/i18n";

export const metadata = { title: "Hari Libur — Treelogy HR" };

const STR: Record<Locale, { intro: string }> = {
  id: {
    intro: "Kalender hari libur nasional & keagamaan. Libur nasional berlaku untuk semua; libur keagamaan hanya untuk karyawan seagama.",
  },
  en: {
    intro: "National & religious holiday calendar. National holidays apply to everyone; religious holidays only to employees of that faith.",
  },
};

export default async function HolidaysPage() {
  const [holidays, user, locale] = await Promise.all([getHolidays(), getSessionUser(), getLocale()]);
  const t = STR[locale];
  const canManage = can(user, "employees.manage") || can(user, "shifts.manage");
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t.intro}</p>
      <HolidaysView holidays={holidays} canManage={canManage} />
    </div>
  );
}
