import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getSessionUser } from "@/lib/auth";
import { getUnreadNotifCount } from "@/lib/data";

// Per-user, session-bound data — never statically cache.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Dua query independen — jalankan paralel, jangan berurutan.
  const [user, unreadCount] = await Promise.all([getSessionUser(), getUnreadNotifCount()]);
  if (!user) redirect("/login");

  return (
    <AppShell
      user={{ name: user.name, roleName: user.roleName, permissions: user.permissions }}
      unreadCount={unreadCount}
    >
      {children}
    </AppShell>
  );
}
