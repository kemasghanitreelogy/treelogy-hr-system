import { redirect } from "next/navigation";
import { LettersView } from "@/components/letters/letters-view";
import { can, getSessionUser } from "@/lib/auth";
import { getOutgoingLetters } from "@/lib/data";
import { getLocale } from "@/lib/locale-server";
import type { Locale } from "@/lib/i18n";

export const metadata = { title: "Surat Keluar — Treelogy HR" };

const STR: Record<Locale, { intro: string }> = {
  id: {
    intro:
      "Agenda surat keluar perusahaan. Tiap surat punya nomor agenda unik beserta arsip berkasnya — cari, buka, atau unduh kapan pun dibutuhkan.",
  },
  en: {
    intro:
      "Company outgoing-letter register. Every letter carries a unique agenda number with its archived file — search, open, or download whenever needed.",
  },
};

export default async function LettersPage({
  searchParams,
}: {
  searchParams: Promise<{ surat?: string }>;
}) {
  const [letters, user, params, locale] = await Promise.all([
    getOutgoingLetters(),
    getSessionUser(),
    searchParams,
    getLocale(),
  ]);

  // Menu di-gate perm yang sama; guard ini menutup akses via URL langsung.
  if (!can(user, "letters.view") && !can(user, "letters.manage")) redirect("/dashboard");

  const t = STR[locale];
  const canManage = can(user, "letters.manage") || can(user, "employees.manage");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t.intro}</p>
      <LettersView letters={letters} canManage={canManage} initialCode={params.surat ?? null} />
    </div>
  );
}
