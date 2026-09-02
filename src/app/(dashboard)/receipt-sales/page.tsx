import { redirect } from "next/navigation";
import { ReceiptSalesView } from "@/components/receipt-sales/receipt-sales-view";
import { can, getSessionUser } from "@/lib/auth";

export const metadata = { title: "Receipt Sales — Treelogy Workspace" };

export default async function ReceiptSalesPage() {
  const user = await getSessionUser();

  // Menu di-gate izin yang sama; guard ini menutup akses lewat URL langsung.
  if (!can(user, "receipt.view")) redirect("/dashboard");

  // Izin SENDIRI, bukan menumpang `receipt.sync`.
  //
  // `receipt.sync` berarti "tulis No. Resi ke Jubelio" — sistem yang sama
  // sekali berbeda. Menyatukan keduanya memaksa siapa pun yang boleh menandai
  // order terkirim ikut mendapat akses tulis ke Jubelio, dan sebaliknya
  // membuat tim resi yang mengerjakannya setiap hari tidak bisa memakainya.
  return <ReceiptSalesView canFulfill={can(user, "receipt.fulfill")} />;
}
