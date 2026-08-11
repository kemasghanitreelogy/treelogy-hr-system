import { redirect } from "next/navigation";
import { DocumentsView } from "@/components/documents/documents-view";
import { can, getSessionUser } from "@/lib/auth";
import { getCompanyDocuments } from "@/lib/data";
import { getLocale } from "@/lib/locale-server";
import type { Locale } from "@/lib/i18n";

export const metadata = { title: "Dokumen — Treelogy HR" };

const STR: Record<Locale, { intro: string }> = {
  id: {
    intro:
      "Arsip dokumen perusahaan. Tiap dokumen punya kode unik dan berkasnya tersimpan rapi — cari, buka, atau unduh kapan pun dibutuhkan.",
  },
  en: {
    intro:
      "Company document archive. Every document carries a unique code with its file stored neatly — search, open, or download whenever needed.",
  },
};

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string }>;
}) {
  const [docs, user, params, locale] = await Promise.all([
    getCompanyDocuments(),
    getSessionUser(),
    searchParams,
    getLocale(),
  ]);

  // Menu di-gate perm yang sama; guard ini menutup akses via URL langsung.
  if (!can(user, "documents.view") && !can(user, "documents.manage")) redirect("/dashboard");

  const t = STR[locale];
  const canManage = can(user, "documents.manage") || can(user, "employees.manage");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t.intro}</p>
      <DocumentsView docs={docs} canManage={canManage} initialCode={params.doc ?? null} />
    </div>
  );
}
