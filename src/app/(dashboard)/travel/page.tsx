import { redirect } from "next/navigation";
import { TravelView } from "@/components/travel/travel-view";
import { can, getSessionUser } from "@/lib/auth";
import { getEmployees, getTravelRequests, liveToday } from "@/lib/data";
import { getLocale } from "@/lib/locale-server";
import type { Locale } from "@/lib/i18n";

export const metadata = { title: "Perjalanan Dinas — Treelogy HR" };

const STR: Record<Locale, { intro: string }> = {
  id: {
    intro:
      "Pengajuan perjalanan dinas beserta estimasi biaya dan uang muka. Semua karyawan boleh mengajukan; keputusan ada pada penyetuju yang ditunjuk.",
  },
  en: {
    intro:
      "Business travel requests with cost estimates and advances. Anyone may submit; the designated approver decides.",
  },
};

export default async function TravelPage() {
  const [requests, employeesAll, user, locale] = await Promise.all([
    getTravelRequests(),
    getEmployees(),
    getSessionUser(),
    getLocale(),
  ]);

  // Menu di-gate perm yang sama; guard ini menutup akses lewat URL langsung.
  if (!can(user, "travel.view")) redirect("/dashboard");

  const t = STR[locale];
  // Persetujuan DUA TAHAP: tahap 1 pemegang travel.approve (Ops/GA), tahap 2
  // pemegang travel.finalize (HR/Admin). Siapa orangnya diatur lewat peran di
  // halaman Peran & Akses (dicek ulang di API + RLS — ini murni untuk tombol).
  const canApproveAll = can(user, "travel.approve");
  const canFinalize = can(user, "travel.finalize") || can(user, "employees.manage");
  const canRequestForOthers = can(user, "employees.manage");

  const employees = employeesAll
    .filter((e) => e.status === "active")
    .map((e) => ({
      id: e.id,
      name: e.name,
      position: e.position ?? "",
      managerId: e.managerId ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t.intro}</p>
      <TravelView
        requests={requests}
        employees={employees}
        currentEmployeeId={user?.employeeId ?? null}
        canApproveAll={canApproveAll}
        canFinalize={canFinalize}
        canRequestForOthers={canRequestForOthers}
        today={liveToday()}
      />
    </div>
  );
}
