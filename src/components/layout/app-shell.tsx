"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Loader2, LogOut, Menu, UserRound, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createClient } from "@/lib/supabase/client";
import { shellDict, type Locale } from "@/lib/i18n";
import { bottomNav, navLabel, visibleNav, type NavItem } from "./nav-items";
import { LanguageToggle } from "./language-toggle";
import { Logo } from "./logo";

export interface ShellUser {
  name: string;
  roleName: string;
  permissions: string[];
}

function NavLinks({
  items,
  locale,
  counts = {},
  onNavigate,
}: {
  items: NavItem[];
  locale: Locale;
  counts?: Record<string, number>;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        const count = counts[item.href] ?? 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            // Prefetch PENUH halaman dinamis saat link terlihat — render server
            // terjadi di latar belakang, sehingga klik dilayani dari cache (instan).
            prefetch={true}
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200",
              active
                ? "bg-forest-600 text-cream shadow-sm"
                : "text-forest-100/80 hover:bg-forest-700/60 hover:text-cream",
            )}
          >
            <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-lime" : "text-forest-100/60 group-hover:text-lime")} />
            <span className="flex-1">{navLabel(item, locale)}</span>
            {count > 0 && (
              <span
                className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gold px-1.5 text-[11px] font-bold text-bark"
                aria-label={`${count} perlu aksi`}
              >
                {count > 99 ? "99+" : count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarInner({
  items,
  user,
  locale,
  counts,
  onLogout,
  onNavigate,
}: {
  items: NavItem[];
  user: ShellUser;
  locale: Locale;
  counts?: Record<string, number>;
  onLogout: () => void;
  onNavigate?: () => void;
}) {
  const dict = shellDict(locale);
  return (
    <div className="flex h-full flex-col bg-bark text-cream">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-forest-100/40">
          {dict.menu}
        </p>
        <NavLinks items={items} locale={locale} counts={counts} onNavigate={onNavigate} />
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
            aria-label={dict.logout}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppShell({
  children,
  user,
  countsPromise,
  locale = "id",
}: {
  children: React.ReactNode;
  user: ShellUser;
  /** Badge counts di-stream (di-resolve di klien) supaya tidak memblok paint pertama. */
  countsPromise?: Promise<{ unread: number; counts: Record<string, number> }>;
  locale?: Locale;
}) {
  const dict = shellDict(locale);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Badge nav & lonceng diisi setelah shell tampil (tidak memblok splash/first paint).
  const [unreadCount, setUnreadCount] = useState(0);
  const [actionCounts, setActionCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!countsPromise) return;
    let live = true;
    countsPromise
      .then((c) => {
        if (live) {
          setUnreadCount(c.unread);
          setActionCounts(c.counts);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [countsPromise]);

  const hasUnread = unreadCount > 0;

  // Account dropdown (avatar menu).
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);
  const items = visibleNav(user.permissions);
  const bottomItems = bottomNav(user.permissions);
  const current = items.find(
    (i) => pathname === i.href || pathname.startsWith(i.href + "/"),
  );
  // Titles for routes that aren't in the sidebar menu.
  const EXTRA_TITLES: Record<string, string> = { "/notifications": dict.notifications, "/profile": dict.profile };
  const title = (current ? navLabel(current, locale) : undefined) ?? EXTRA_TITLES[pathname] ?? "Treelogy HR";

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
        <SidebarInner items={items} user={user} locale={locale} counts={actionCounts} onLogout={requestLogout} />
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
              aria-label={dict.closeMenu}
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarInner items={items} user={user} locale={locale} counts={actionCounts} onLogout={requestLogout} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-h-screen flex-col">
        {/* Topbar */}
        <header className="app-chrome sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-cream/85 px-4 backdrop-blur-md sm:px-6">
          <button
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-muted transition-colors hover:bg-sand lg:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label={dict.openMenu}
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex flex-1 items-center gap-3">
            <h1 className="font-display text-lg font-semibold text-ink lg:text-xl">
              {title}
            </h1>
          </div>

          <LanguageToggle locale={locale} />
          <Link
            href="/notifications"
            prefetch={true}
            className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-muted transition-colors hover:bg-sand"
            aria-label={dict.notifications}
          >
            <Bell className="h-5 w-5" />
            {hasUnread && (
              <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-clay ring-2 ring-cream" />
            )}
          </Link>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex cursor-pointer items-center rounded-full outline-none ring-offset-2 ring-offset-cream transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-forest-300"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={dict.accountMenu}
            >
              <Avatar name={user.name} size="sm" className="ring-0" />
            </button>

            {menuOpen && (
              <div className="animate-menu absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-line bg-panel p-1.5 shadow-pop">
                <div className="flex items-center gap-3 px-2.5 py-2">
                  <Avatar name={user.name} size="md" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
                    <p className="truncate text-xs text-muted">{user.roleName}</p>
                  </div>
                </div>
                <div className="my-1 h-px bg-line" />
                <Link
                  href="/profile"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-sand"
                >
                  <UserRound className="h-4 w-4 text-muted" /> {dict.viewProfile}
                </Link>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    requestLogout();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium text-clay transition-colors hover:bg-clay-soft"
                >
                  <LogOut className="h-4 w-4" /> {dict.logout}
                </button>
              </div>
            )}
          </div>
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
              const count = actionCounts[item.href] ?? 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={true}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-0.5 py-2 text-[11px] transition-colors",
                    active ? "font-semibold text-forest-700" : "font-medium text-faint",
                  )}
                >
                  {/* Pil di belakang ikon menandai halaman aktif dengan jelas */}
                  <span
                    className={cn(
                      "relative flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                      active && "bg-forest-100",
                    )}
                  >
                    {count > 0 && (
                      <span className="absolute right-1.5 top-0 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-gold px-1 text-[9px] font-bold text-bark ring-2 ring-cream">
                        {count > 9 ? "9+" : count}
                      </span>
                    )}
                    <Icon className={cn("h-5 w-5", active && "text-forest-700")} />
                  </span>
                  {navLabel(item, locale).split(" ")[0]}
                </Link>
              );
            })}
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex cursor-pointer flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-faint"
          >
            <span className="flex h-7 w-12 items-center justify-center">
              <Menu className="h-5 w-5" />
            </span>
            {dict.more}
          </button>
        </div>
      </nav>

      <ConfirmDialog
        open={confirmLogout}
        tone="danger"
        icon={loggingOut ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
        title={dict.logoutTitle}
        message={dict.logoutMessage}
        confirmLabel={loggingOut ? dict.logoutBusy : dict.logoutConfirm}
        cancelLabel={dict.cancel}
        busy={loggingOut}
        onConfirm={logout}
        onCancel={() => setConfirmLogout(false)}
      />
    </div>
  );
}
