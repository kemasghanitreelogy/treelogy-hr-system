import { redirect } from "next/navigation";
import { DocumentsView } from "@/components/documents/documents-view";
import { can, getSessionUser } from "@/lib/auth";
import { getCompanyDocuments } from "@/lib/data";

export const metadata = { title: "Dokumen — Treelogy HR" };

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string }>;
}) {
  const [docs, user, params] = await Promise.all([
    getCompanyDocuments(),
    getSessionUser(),
    searchParams,
  ]);

  // Menu di-gate perm yang sama; guard ini menutup akses via URL langsung.
  if (!can(user, "documents.view") && !can(user, "documents.manage")) redirect("/dashboard");

  const canManage = can(user, "documents.manage") || can(user, "employees.manage");

  return (
    <div className="space-y-4">
      <DocumentsView docs={docs} canManage={canManage} initialCode={params.doc ?? null} />
    </div>
  );
}
