import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { LocaleProvider } from "@/components/layout/locale-context";
import { getSessionUser } from "@/lib/auth";
import { getUnreadNotifCount } from "@/lib/data";
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
  // Dua query independen — jalankan paralel, jangan berurutan.
  const [user, unreadCount] = await Promise.all([getSessionUser(), getUnreadNotifCount()]);
  if (!user) redirect("/login");

  return (
    <LocaleProvider locale={locale}>
      <AppShell
        user={{ name: user.name, roleName: user.roleName, permissions: user.permissions }}
        unreadCount={unreadCount}
        locale={locale}
      >
        {children}
      </AppShell>
    </LocaleProvider>
  );
}
