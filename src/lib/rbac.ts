import { employees } from "./seed";

/* ============================================================
   RBAC — Permissions, Roles & System Users
   ============================================================ */

export interface PermissionDef {
  id: string;
  label: string;
}
export interface PermissionGroup {
  module: string;
  label: string;
  permissions: PermissionDef[];
}

/** Master catalog of every permission, grouped by module. */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    module: "dashboard",
    label: "Dashboard",
    permissions: [{ id: "dashboard.view", label: "Lihat dashboard" }],
  },
  {
    module: "attendance",
    label: "Absensi",
    permissions: [
      { id: "attendance.view", label: "Lihat absensi" },
      { id: "attendance.manage", label: "Kelola & koreksi absensi" },
    ],
  },
  {
    module: "shifts",
    label: "Jadwal",
    permissions: [
      { id: "shifts.view", label: "Lihat jadwal" },
      { id: "shifts.manage", label: "Kelola jadwal" },
      { id: "shifts.swap_approve", label: "Setujui tukar libur" },
    ],
  },
  {
    module: "leave",
    label: "Cuti & Izin",
    permissions: [
      { id: "leave.view", label: "Lihat cuti & saldo" },
      { id: "leave.request", label: "Ajukan cuti/izin" },
      { id: "leave.approve", label: "Setujui / tolak cuti" },
    ],
  },
  {
    module: "payroll",
    label: "Payroll",
    permissions: [
      { id: "payroll.view", label: "Lihat payroll & slip gaji" },
      { id: "payroll.process", label: "Proses & setujui payroll" },
      { id: "payroll.export", label: "Ekspor transfer bank" },
    ],
  },
  {
    module: "employees",
    label: "Karyawan",
    permissions: [
      { id: "employees.view", label: "Lihat data karyawan" },
      { id: "employees.manage", label: "Tambah / edit / nonaktifkan" },
    ],
  },
  {
    module: "kpi",
    label: "KPI & Kinerja",
    permissions: [
      { id: "kpi.view", label: "Lihat KPI" },
      { id: "kpi.manage", label: "Kelola KPI & target" },
    ],
  },
  {
    module: "access",
    label: "Peran & Akses",
    permissions: [
      { id: "access.roles", label: "Kelola peran & hak akses" },
      { id: "access.users", label: "Kelola pengguna & assignment" },
    ],
  },
];

export const ALL_PERMISSION_IDS: string[] = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.id),
);

export function permissionLabel(id: string): string {
  for (const g of PERMISSION_GROUPS) {
    const p = g.permissions.find((x) => x.id === id);
    if (p) return p.label;
  }
  return id;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  color: string; // hex for the role chip
  system?: boolean; // protected — cannot be deleted; Admin cannot be edited
  permissionIds: string[];
}

const MANAGER_PERMS = [
  "dashboard.view",
  "attendance.view",
  "shifts.view",
  "shifts.swap_approve",
  "leave.view",
  "leave.approve",
  "employees.view",
  "kpi.view",
];

// payroll.view di sini = karyawan boleh melihat SLIP GAJINYA SENDIRI;
// halaman payroll menampilkan mode operasional hanya untuk payroll.process.
// shifts.view = lihat halaman Jadwal (jadwal sendiri + tabungan libur).
const EMPLOYEE_PERMS = ["dashboard.view", "attendance.view", "leave.view", "leave.request", "payroll.view", "shifts.view"];

// HR: everything operational + user assignment, but NOT role management.
const HR_PERMS = ALL_PERMISSION_IDS.filter((id) => id !== "access.roles");

export const roles: Role[] = [
  {
    id: "role-admin",
    name: "Administrator",
    description: "Akses penuh ke seluruh sistem termasuk pengaturan peran.",
    color: "#3d5a2e",
    system: true,
    permissionIds: [...ALL_PERMISSION_IDS],
  },
  {
    id: "role-hr",
    name: "HR Officer",
    description: "Mengelola karyawan, absensi, cuti, dan payroll.",
    color: "#6b7548",
    system: true,
    permissionIds: HR_PERMS,
  },
  {
    id: "role-manager",
    name: "Manager / Supervisor",
    description: "Menyetujui cuti & tukar libur, melihat data tim.",
    color: "#4a7ba6",
    permissionIds: MANAGER_PERMS,
  },
  {
    id: "role-employee",
    name: "Karyawan",
    description: "Absensi mandiri dan pengajuan cuti/izin.",
    color: "#8ba859",
    system: true,
    permissionIds: EMPLOYEE_PERMS,
  },
  {
    id: "role-payroll",
    name: "Payroll Staff",
    description: "Khusus memproses payroll dan ekspor transfer bank.",
    color: "#e0a82e",
    permissionIds: ["dashboard.view", "payroll.view", "payroll.process", "payroll.export", "attendance.view"],
  },
];

export type UserStatus = "active" | "invited" | "suspended";

export interface SystemUser {
  id: string;
  employeeId: string;
  email: string;
  roleId: string;
  status: UserStatus;
  lastActive: string;
}

const ROLE_OVERRIDES: Record<string, string> = {
  e09: "role-admin", // Agus Pratama (Finance) — system admin
  e08: "role-hr", // Dewi Lestari — HR
  e03: "role-manager", // Kadek Wirawan — factory supervisor
  e05: "role-manager", // Komang Adi — farm lead
  e07: "role-manager", // I Gede Bagus — sales lead
  e02: "role-payroll", // Made Surya — payroll staff (example)
};

const LAST_ACTIVE: Record<string, string> = {
  e09: "2026-06-09T08:40:00+08:00",
  e08: "2026-06-09T08:05:00+08:00",
  e03: "2026-06-09T07:12:00+08:00",
};

export const systemUsers: SystemUser[] = employees
  .filter((e) => e.status === "active")
  .map((e) => ({
    id: `u-${e.id}`,
    employeeId: e.id,
    email: e.email,
    roleId: ROLE_OVERRIDES[e.id] ?? "role-employee",
    status: "active" as UserStatus,
    lastActive: LAST_ACTIVE[e.id] ?? "2026-06-08T17:00:00+08:00",
  }));
