import { ProfileView } from "@/components/profile/profile-view";
import { getEmployees } from "@/lib/data";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Profil — Treelogy HR" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const [user, employees] = await Promise.all([getSessionUser(), getEmployees()]);
  const emp = user?.employeeId ? employees.find((e) => e.id === user.employeeId) : undefined;
  const manager = emp?.managerId ? employees.find((e) => e.id === emp.managerId) : undefined;

  return (
    <ProfileView
      emp={emp}
      manager={manager}
      roleName={user?.roleName ?? "Karyawan"}
      fallbackName={user?.name ?? "Pengguna"}
      fallbackEmail={user?.email ?? ""}
    />
  );
}
