import { redirect } from "next/navigation";
import { ReceiptSalesView } from "@/components/receipt-sales/receipt-sales-view";
import { can, getSessionUser } from "@/lib/auth";

export const metadata = { title: "Receipt Sales — Treelogy Workspace" };

export default async function ReceiptSalesPage() {
  const user = await getSessionUser();

  // Menu di-gate izin yang sama; guard ini menutup akses lewat URL langsung.
  if (!can(user, "receipt.view")) redirect("/dashboard");

  // Fulfill menulis ke pesanan sungguhan dan bisa mengirim email ke pembeli —
  // dipagari `receipt.sync`, bukan `receipt.view` yang hanya untuk membaca.
  return <ReceiptSalesView canFulfill={can(user, "receipt.sync")} />;
}
