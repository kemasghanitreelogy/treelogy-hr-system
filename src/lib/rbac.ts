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
    module: "travel",
    label: "Perjalanan Dinas",
    permissions: [
      { id: "travel.view", label: "Lihat perjalanan dinas" },
      { id: "travel.request", label: "Ajukan perjalanan dinas" },
      { id: "travel.approve", label: "Setujui tahap 1 perjalanan dinas (Ops/GA)" },
      { id: "travel.finalize", label: "Persetujuan akhir perjalanan dinas (tahap 2)" },
    ],
  },
  {
    module: "payment",
    label: "Pengajuan Pembayaran",
    permissions: [
      { id: "payment.request", label: "Ajukan pembayaran / reimbursement" },
      { id: "payment.manage", label: "Kelola & proses pengajuan pembayaran" },
    ],
  },
  {
    module: "inventory",
    label: "Inventaris",
    permissions: [
      { id: "inventory.view", label: "Lihat inventaris" },
      { id: "inventory.manage", label: "Kelola inventaris (tambah/edit/hapus)" },
    ],
  },
  {
    module: "documents",
    label: "Dokumen Perusahaan",
    permissions: [
      { id: "documents.view", label: "Lihat dokumen perusahaan" },
      { id: "documents.manage", label: "Kelola dokumen (unggah/edit/hapus)" },
    ],
  },
  {
    module: "letters",
    label: "Surat Keluar",
    permissions: [
      { id: "letters.view", label: "Lihat agenda surat keluar" },
      { id: "letters.manage", label: "Kelola surat keluar (catat/edit/hapus)" },
    ],
  },
  {
    module: "receipt",
    label: "Receipt Sales",
    permissions: [
      { id: "receipt.view", label: "Baca resi & cocokkan ke order Shopify" },
      { id: "receipt.sync", label: "Tulis No. Resi ke Jubelio" },
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
  "inventory.view",
  "documents.view",
  "travel.view",
  "travel.request",
  "payment.request",
  
  "kpi.view",
];

// payroll.view di sini = karyawan boleh melihat SLIP GAJINYA SENDIRI;
// halaman payroll menampilkan mode operasional hanya untuk payroll.process.
// shifts.view = lihat halaman Jadwal (jadwal sendiri + tabungan libur).
const EMPLOYEE_PERMS = ["dashboard.view", "attendance.view", "leave.view", "leave.request", "payroll.view", "shifts.view", "inventory.view", "documents.view", "travel.view", "travel.request", "payment.request", ];

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
    id: "role-inventory",
    name: "Pengelola Inventaris",
    description: "Hak karyawan biasa, plus kelola penuh inventaris kantor.",
    color: "#4a7ba6",
    // Peran terpisah, bukan menambah inventory.manage ke Karyawan — kalau tidak,
    // SEMUA karyawan ikut bisa menghapus aset.
    permissionIds: [...EMPLOYEE_PERMS, "inventory.manage"],
  },
  {
    id: "role-ops",
    name: "Admin Operasional",
    description: "Hak karyawan, kelola inventaris kantor, dan penyetuju perjalanan dinas.",
    color: "#6b7548",
    // Terpisah dari "Pengelola Inventaris" supaya pemegang peran itu TIDAK ikut
    // mendapat hak menyetujui perjalanan dinas.
    permissionIds: [...EMPLOYEE_PERMS, "inventory.manage", "travel.approve"],
  },
  {
    id: "role-finance-lead",
    name: "Finance (Kepala)",
    description: "Hak Manager + proses pengajuan pembayaran + persetujuan akhir perjalanan dinas.",
    color: "#8a6512",
    permissionIds: [...MANAGER_PERMS, "payment.manage", "travel.finalize"],
  },
  {
    id: "role-finance",
    name: "Finance",
    description: "Hak Karyawan + proses pengajuan pembayaran + persetujuan akhir perjalanan dinas.",
    color: "#a8842c",
    permissionIds: [...EMPLOYEE_PERMS, "payment.manage", "travel.finalize"],
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
