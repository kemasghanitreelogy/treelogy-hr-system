import { redirect } from "next/navigation";
import { EligibleCustomersView } from "@/components/eligible-customers/eligible-customers-view";
import { can, getSessionUser } from "@/lib/auth";
import { readState } from "@/app/api/eligible-customers/state";

export const metadata = { title: "Pelanggan Eligible — Treelogy Workspace" };
export const dynamic = "force-dynamic";

export default async function EligibleCustomersPage() {
  const user = await getSessionUser();

  // Menu di-gate izin yang sama; guard ini menutup akses lewat URL langsung.
  if (!can(user, "customers.view")) redirect("/dashboard");

  return <EligibleCustomersView initialState={await readState()} canGrant={can(user, "customers.grant")} />;
}
