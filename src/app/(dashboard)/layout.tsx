import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { LocaleProvider } from "@/components/layout/locale-context";
import { NotifyPrompt } from "@/components/pwa/notify-prompt";
import { PushAutoSync } from "@/components/pwa/push-auto-sync";
import { ClockSync } from "@/components/attendance/clock-sync";
import { getSessionUser } from "@/lib/auth";
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

  // Badge "perlu aksi" + notifikasi diambil klien via /api/nav-counts setelah
  // shell tampil → tidak memblok paint pertama (splash PWA cepat hilang).
  return (
    <LocaleProvider locale={locale}>
      <AppShell
        user={{ name: user.name, roleName: user.roleName, permissions: user.permissions }}
        locale={locale}
      >
        {children}
      </AppShell>
      <NotifyPrompt />
      <PushAutoSync />
      <ClockSync />
    </LocaleProvider>
  );
}
