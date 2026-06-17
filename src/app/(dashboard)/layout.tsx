import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { LocaleProvider } from "@/components/layout/locale-context";
import { NotifyPrompt } from "@/components/pwa/notify-prompt";
import { getSessionUser } from "@/lib/auth";
import { getActionCounts, getUnreadNotifCount } from "@/lib/data";
import { LOCALE_COOKIE, normalizeLocale } from "@/lib/i18n";

// Per-user, session-bound data — never statically cache.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // Badge "perlu aksi" + jumlah notifikasi — paralel.
  const [unreadCount, actionCounts] = await Promise.all([getUnreadNotifCount(), getActionCounts(user)]);

  // Petakan jumlah ke href menu untuk badge nav.
  const navCounts: Record<string, number> = {
    "/leave": actionCounts.leave,
    "/overtime": actionCounts.overtime,
    "/attendance": actionCounts.attendance,
  };

  return (
    <LocaleProvider locale={locale}>
      <AppShell
        user={{ name: user.name, roleName: user.roleName, permissions: user.permissions }}
        unreadCount={unreadCount}
        actionCounts={navCounts}
        locale={locale}
      >
        {children}
      </AppShell>
      <NotifyPrompt />
    </LocaleProvider>
  );
}
