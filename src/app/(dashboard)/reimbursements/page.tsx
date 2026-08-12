import { redirect } from "next/navigation";
import { ReimbursementsView } from "@/components/reimbursements/reimbursements-view";
import { can, getSessionUser } from "@/lib/auth";
import { getEmployees, getTravelReimbursements } from "@/lib/data";
import { getLocale } from "@/lib/locale-server";
import type { Locale } from "@/lib/i18n";

export const metadata = { title: "Reimbursement Perjalanan — Treelogy HR" };

const STR: Record<Locale, { intro: string }> = {
  id: {
    intro:
      "Klaim biaya perjalanan dinas beserta kuitansinya. Persetujuan dua tahap: disaring Ops/GA dulu, lalu disetujui Finance sebelum dibayarkan.",
  },
  en: {
    intro:
      "Business-trip expense claims with their receipts. Two-step approval: screened by Ops/GA first, then approved by Finance before payment.",
  },
};

export default async function ReimbursementsPage() {
  const [requests, employeesAll, user, locale] = await Promise.all([
    getTravelReimbursements(),
    getEmployees(),
    getSessionUser(),
    getLocale(),
  ]);

  // Menu di-gate perm yang sama; guard ini menutup akses lewat URL langsung.
  if (!can(user, "reimbursement.view")) redirect("/dashboard");

  const t = STR[locale];
  // Tahap 1 = reimbursement.approve (Ops/GA), tahap 2 = reimbursement.finalize
  // (Finance). Dicek ulang di API + RLS — ini murni untuk menampilkan tombol.
  const canApproveOps = can(user, "reimbursement.approve");
  const canFinalize = can(user, "reimbursement.finalize") || can(user, "employees.manage");
  const canRequestForOthers = can(user, "employees.manage");

  const employees = employeesAll
    .filter((e) => e.status === "active")
    .map((e) => ({ id: e.id, name: e.name, position: e.position ?? "" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t.intro}</p>
      <ReimbursementsView
        requests={requests}
        employees={employees}
        currentEmployeeId={user?.employeeId ?? null}
        canApproveOps={canApproveOps}
        canFinalize={canFinalize}
        canRequestForOthers={canRequestForOthers}
      />
    </div>
  );
}
