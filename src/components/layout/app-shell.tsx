"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Loader2, LogOut, Menu, Search, Settings, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createClient } from "@/lib/supabase/client";
import { bottomNav, visibleNav, type NavItem } from "./nav-items";
import { Logo } from "./logo";

export interface ShellUser {
  name: string;
  roleName: string;
  permissions: string[];
}

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200",
              active
                ? "bg-forest-600 text-cream shadow-sm"
                : "text-forest-100/80 hover:bg-forest-700/60 hover:text-cream",
            )}
          >
            <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-lime" : "text-forest-100/60 group-hover:text-lime")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarInner({
  items,
  user,
  onLogout,
  onNavigate,
}: {
  items: NavItem[];
  user: ShellUser;
  onLogout: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-bark text-cream">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-forest-100/40">
          Menu
        </p>
        <NavLinks items={items} onNavigate={onNavigate} />
      </div>
      <div className="border-t border-forest-700/50 p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <Avatar name={user.name} size="sm" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-cream">{user.name}</p>
            <p className="truncate text-xs text-forest-100/50">{user.roleName}</p>
          </div>
          <button
            onClick={onLogout}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-forest-100/60 transition-colors hover:bg-forest-700/60 hover:text-cream"
            aria-label="Keluar"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children, user }: { children: React.ReactNode; user: ShellUser }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const items = visibleNav(user.permissions);
  const bottomItems = bottomNav(user.permissions);
  const current = items.find(
    (i) => pathname === i.href || pathname.startsWith(i.href + "/"),
  );

  function requestLogout() {
    setDrawerOpen(false);
    setConfirmLogout(true);
  }

  async function logout() {
    setLoggingOut(true);
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    // `replace` so Back doesn't return to an authenticated (now stale) page.
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen lg:block">
        <SidebarInner items={items} user={user} onLogout={requestLogout} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-bark/50 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-72 max-w-[82%] shadow-pop animate-in">
            <button
              className="absolute -right-11 top-4 flex h-9 w-9 items-center justify-center rounded-lg bg-bark/80 text-cream"
              onClick={() => setDrawerOpen(false)}
              aria-label="Tutup menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarInner items={items} user={user} onLogout={requestLogout} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-h-screen flex-col">
        {/* Topbar */}
        <header className="app-chrome sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-cream/85 px-4 backdrop-blur-md sm:px-6">
          <button
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-muted transition-colors hover:bg-sand lg:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Buka menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex flex-1 items-center gap-3">
            <h1 className="font-display text-lg font-semibold text-ink lg:text-xl">
              {current?.label ?? "Treelogy HR"}
            </h1>
          </div>

          <div className="relative hidden items-center md:flex">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-faint" />
            <input
              type="search"
              placeholder="Cari karyawan…"
              className="h-10 w-56 rounded-xl border border-line bg-panel pl-9 pr-3 text-sm text-ink outline-none transition focus:border-forest-300 focus:ring-2 focus:ring-forest-100"
            />
          </div>

          <button
            className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-muted transition-colors hover:bg-sand"
            aria-label="Notifikasi"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-clay ring-2 ring-cream" />
          </button>
          <button
            className="hidden h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-muted transition-colors hover:bg-sand sm:flex"
            aria-label="Pengaturan"
          >
            <Settings className="h-5 w-5" />
          </button>
          <Avatar name={user.name} size="sm" className="ring-0" />
        </header>

        {/* Page content */}
        <main className="flex-1 px-4 pb-24 pt-5 sm:px-6 lg:pb-8 lg:pt-6">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="app-chrome fixed bottom-0 left-0 right-0 z-40 border-t border-line bg-cream/95 backdrop-blur-md lg:hidden">
        <div className="grid grid-cols-5">
          {bottomItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                    active ? "text-forest-600" : "text-faint",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.label.split(" ")[0]}
                </Link>
              );
            })}
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex cursor-pointer flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-faint"
          >
            <Menu className="h-5 w-5" />
            Lainnya
          </button>
        </div>
      </nav>

      <ConfirmDialog
        open={confirmLogout}
        tone="danger"
        icon={loggingOut ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
        title="Keluar dari akun?"
        message="Anda akan keluar dan kembali ke halaman masuk."
        confirmLabel={loggingOut ? "Keluar…" : "Ya, keluar"}
        cancelLabel="Batal"
        busy={loggingOut}
        onConfirm={logout}
        onCancel={() => setConfirmLogout(false)}
      />
    </div>
  );
}
