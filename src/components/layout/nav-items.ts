import {
  CalendarClock,
  CalendarDays,
  LayoutDashboard,
  Layers,
  Network,
  ShieldCheck,
  Target,
  Timer,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Permission required to see this item. */
  perm: string;
}

const ITEMS: Record<string, NavItem> = {
  "/dashboard": { href: "/dashboard", label: "Beranda", icon: LayoutDashboard, perm: "dashboard.view" },
  "/attendance": { href: "/attendance", label: "Absensi", icon: CalendarClock, perm: "attendance.view" },
  "/leave": { href: "/leave", label: "Cuti & Izin", icon: CalendarDays, perm: "leave.view" },
  "/overtime": { href: "/overtime", label: "Lembur", icon: Timer, perm: "attendance.view" },
  "/payroll": { href: "/payroll", label: "Payroll", icon: Wallet, perm: "payroll.view" },
  "/employees": { href: "/employees", label: "Karyawan", icon: Users, perm: "employees.view" },
  "/org-structure": { href: "/org-structure", label: "Struktur Organisasi", icon: Network, perm: "dashboard.view" },
  "/shifts": { href: "/shifts", label: "Shift & Jadwal", icon: Layers, perm: "shifts.view" },
  "/kpi": { href: "/kpi", label: "KPI & Kinerja", icon: Target, perm: "kpi.view" },
  "/access": { href: "/access", label: "Peran & Akses", icon: ShieldCheck, perm: "access.roles" },
};

export type Audience = "ops" | "self";

/**
 * Ops = HR/admin/manager/payroll (run the company).
 * Self = front-line worker (clock-in, leave, payslip).
 * Decided by whether the user holds an operational permission.
 */
export function audienceFromPermissions(permissions: string[]): Audience {
  const set = new Set(permissions);
  const ops =
    set.has("employees.manage") ||
    set.has("access.roles") ||
    set.has("access.users") ||
    set.has("payroll.process") ||
    set.has("leave.approve");
  return ops ? "ops" : "self";
}

// Order by real-world usage frequency for each audience (Hick's Law + Serial Position:
// most-used first = primacy; rarely-used config last).
const ORDER: Record<Audience, string[]> = {
  ops: ["/dashboard", "/attendance", "/leave", "/overtime", "/payroll", "/employees", "/org-structure", "/shifts", "/kpi", "/access"],
  self: ["/dashboard", "/attendance", "/leave", "/overtime", "/payroll", "/kpi", "/shifts", "/employees", "/org-structure", "/access"],
};

// Most-frequent destinations for the mobile thumb-zone bar (4 = sweet spot).
const BOTTOM: Record<Audience, string[]> = {
  ops: ["/dashboard", "/attendance", "/leave", "/payroll"],
  self: ["/dashboard", "/attendance", "/leave", "/payroll"],
};

function visibleFor(permissions: string[]): Set<string> {
  const set = new Set(permissions);
  const allowed = new Set<string>();
  for (const href of Object.keys(ITEMS)) {
    const item = ITEMS[href];
    const ok = href === "/access" ? set.has("access.roles") || set.has("access.users") : set.has(item.perm);
    if (ok) allowed.add(href);
  }
  return allowed;
}

/** Visible nav, ordered by audience frequency. */
export function visibleNav(permissions: string[]): NavItem[] {
  const allowed = visibleFor(permissions);
  const aud = audienceFromPermissions(permissions);
  return ORDER[aud].filter((h) => allowed.has(h)).map((h) => ITEMS[h]);
}

/** Up to 4 highest-frequency items for the mobile bottom bar. */
export function bottomNav(permissions: string[]): NavItem[] {
  const allowed = visibleFor(permissions);
  const aud = audienceFromPermissions(permissions);
  const bar = BOTTOM[aud].filter((h) => allowed.has(h)).map((h) => ITEMS[h]);
  // Backfill from the ordered list if fewer than 4 primary items are visible.
  if (bar.length < 4) {
    for (const item of visibleNav(permissions)) {
      if (bar.length >= 4) break;
      if (!bar.some((b) => b.href === item.href)) bar.push(item);
    }
  }
  return bar.slice(0, 4);
}
