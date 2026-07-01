import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getSuperAdminAccounts } from "@/lib/data";
import { getLocale } from "@/lib/locale-server";
import { SuperAdminView } from "@/components/super-admin/super-admin-view";

export const metadata = { title: "Super Admin — Treelogy HR" };

export default async function SuperAdminPage() {
  const user = await getSessionUser();
  if (!user?.isSuperAdmin) notFound();

  const [accounts, locale] = await Promise.all([getSuperAdminAccounts(), getLocale()]);
  return <SuperAdminView accounts={accounts} currentUserId={user.id} locale={locale} />;
}
