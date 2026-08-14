import { redirect } from "next/navigation";
import { LettersView } from "@/components/letters/letters-view";
import { can, getSessionUser } from "@/lib/auth";
import { getOutgoingLetters } from "@/lib/data";

export const metadata = { title: "Surat Keluar — Treelogy HR" };

export default async function LettersPage() {
  const [letters, user] = await Promise.all([getOutgoingLetters(), getSessionUser()]);

  // Menu di-gate perm yang sama; guard ini menutup akses via URL langsung.
  if (!can(user, "letters.view") && !can(user, "letters.manage")) redirect("/dashboard");

  const canManage = can(user, "letters.manage") || can(user, "employees.manage");

  return (
    <div className="space-y-4">
      <LettersView letters={letters} canManage={canManage} />
    </div>
  );
}
