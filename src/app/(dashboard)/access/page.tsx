import { notFound } from "next/navigation";
import { AccessView } from "@/components/access/access-view";
import { getEmployees, getRoles, getSystemUsers } from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";

export const metadata = { title: "Peran & Akses — Treelogy HR" };

export default async function AccessPage() {
  // Khusus admin (access.roles) — cegah akses lewat URL untuk peran lain.
  const user = await getSessionUser();
  if (!can(user, "access.roles")) notFound();

  const [employeesAll, users] = await Promise.all([getEmployees(), getSystemUsers()]);
  const employees = employeesAll.map((e) => ({
    id: e.id,
    name: e.name,
    position: e.position,
    team: e.team,
  }));
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Kelola peran &amp; hak akses (RBAC). Buat, edit, atau hapus peran, atur hak akses per modul,
        dan tetapkan peran ke setiap pengguna.
      </p>
      <AccessView roles={getRoles()} users={users} employees={employees} />
    </div>
  );
}
