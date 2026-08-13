import { OrgView } from "@/components/org/org-view";
import { getEmployees } from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";

export const metadata = { title: "Struktur Organisasi — Treelogy HR" };

export default async function OrgStructurePage() {
  const [employeesAll, user] = await Promise.all([getEmployees(), getSessionUser()]);
  const canManage = can(user, "employees.manage");

  const employees = employeesAll.filter((e) => e.status === "active");
  return (
    <div className="space-y-4">
      <OrgView initial={employees} canManage={canManage} />
    </div>
  );
}
