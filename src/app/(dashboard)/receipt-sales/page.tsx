import { redirect } from "next/navigation";
import { ReceiptSalesView } from "@/components/receipt-sales/receipt-sales-view";
import { can, getSessionUser } from "@/lib/auth";

export const metadata = { title: "Receipt Sales — Treelogy HR" };

export default async function ReceiptSalesPage() {
  const user = await getSessionUser();

  // Menu di-gate izin yang sama; guard ini menutup akses lewat URL langsung.
  if (!can(user, "receipt.view")) redirect("/dashboard");

  return <ReceiptSalesView />;
}
