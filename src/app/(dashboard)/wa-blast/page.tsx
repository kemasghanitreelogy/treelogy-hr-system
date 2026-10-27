import { redirect } from "next/navigation";
import { WaBlastView } from "@/components/wa-blast/wa-blast-view";
import { can, getSessionUser } from "@/lib/auth";

export const metadata = { title: "Blast WhatsApp — Treelogy Workspace" };

export default async function WaBlastPage() {
  const user = await getSessionUser();
  // Akses SENGAJA mengikuti menu Receipt Sales (keputusan pemilik produk):
  // siapa pun yang bisa membuka Receipt Sales boleh blast WhatsApp.
  if (!can(user, "receipt.view")) redirect("/dashboard");
  return <WaBlastView />;
}
