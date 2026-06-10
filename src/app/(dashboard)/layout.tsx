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
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const unreadCount = await getUnreadNotifCount();

  return (
    <AppShell
      user={{ name: user.name, roleName: user.roleName, permissions: user.permissions }}
      unreadCount={unreadCount}
    >
      {children}
    </AppShell>
  );
}
