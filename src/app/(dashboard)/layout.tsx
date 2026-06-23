import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { LocaleProvider } from "@/components/layout/locale-context";
import { NotifyPrompt } from "@/components/pwa/notify-prompt";
import { PushAutoSync } from "@/components/pwa/push-auto-sync";
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

  // Badge "perlu aksi" + notifikasi di-stream (TIDAK di-await) → shell langsung
  // tampil; angka badge menyusul setelah paint pertama. Mempercepat splash PWA.
  const countsPromise = (async () => {
    try {
      const [unread, ac] = await Promise.all([getUnreadNotifCount(), getActionCounts(user)]);
      return { unread, counts: { "/leave": ac.leave, "/overtime": ac.overtime, "/attendance": ac.attendance } };
    } catch {
      return { unread: 0, counts: {} as Record<string, number> };
    }
  })();

  return (
    <LocaleProvider locale={locale}>
      <AppShell
        user={{ name: user.name, roleName: user.roleName, permissions: user.permissions }}
        countsPromise={countsPromise}
        locale={locale}
      >
        {children}
      </AppShell>
      <NotifyPrompt />
      <PushAutoSync />
    </LocaleProvider>
  );
}
