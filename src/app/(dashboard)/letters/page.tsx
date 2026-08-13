import { redirect } from "next/navigation";
import { LettersView } from "@/components/letters/letters-view";
import { can, getSessionUser } from "@/lib/auth";
import { getOutgoingLetters } from "@/lib/data";

export const metadata = { title: "Surat Keluar — Treelogy HR" };

export default async function LettersPage({
  searchParams,
}: {
  searchParams: Promise<{ surat?: string }>;
}) {
  const [letters, user, params] = await Promise.all([
    getOutgoingLetters(),
    getSessionUser(),
    searchParams,
  ]);

  // Menu di-gate perm yang sama; guard ini menutup akses via URL langsung.
  if (!can(user, "letters.view") && !can(user, "letters.manage")) redirect("/dashboard");

  const canManage = can(user, "letters.manage") || can(user, "employees.manage");

  return (
    <div className="space-y-4">
      <LettersView letters={letters} canManage={canManage} initialCode={params.surat ?? null} />
    </div>
  );
}
