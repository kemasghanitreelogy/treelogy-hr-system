import { ProfileView } from "@/components/profile/profile-view";
import { getContracts, getEmployees } from "@/lib/data";
import { getSessionUser } from "@/lib/auth";
import type { ContractType } from "@/lib/types";

export const metadata = { title: "Profil — Treelogy HR" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const [user, employees] = await Promise.all([getSessionUser(), getEmployees()]);
  const emp = user?.employeeId ? employees.find((e) => e.id === user.employeeId) : undefined;
  const manager = emp?.managerId ? employees.find((e) => e.id === emp.managerId) : undefined;

  // The employee's own contracts + a headline PKWT/PKWTT status. Prefer the
  // employee's summary field; otherwise derive it from the active contract.
  const contracts = emp ? await getContracts(emp.id) : [];
  const active = contracts.find((c) => c.status === "active") ?? contracts[0];
  const contractType: ContractType | null =
    emp?.contractType ?? (active ? (active.type === "pkwtt" ? "pkwtt" : "pkwt") : null);

  return (
    <ProfileView
      emp={emp}
      manager={manager}
      roleName={user?.roleName ?? "Karyawan"}
      fallbackName={user?.name ?? "Pengguna"}
      fallbackEmail={user?.email ?? ""}
      contracts={contracts}
      contractType={contractType}
    />
  );
}
