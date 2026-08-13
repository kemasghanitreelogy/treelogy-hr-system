import { HolidaysView } from "@/components/holidays/holidays-view";
import { getHolidays } from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";

export const metadata = { title: "Hari Libur — Treelogy HR" };

export default async function HolidaysPage() {
  const [holidays, user] = await Promise.all([getHolidays(), getSessionUser()]);
  const canManage = can(user, "employees.manage") || can(user, "shifts.manage");
  return (
    <div className="space-y-4">
      <HolidaysView holidays={holidays} canManage={canManage} />
    </div>
  );
}
