"use client";

import { useMemo, useState } from "react";
import { Building2, Loader2, Mail, Phone, Plus, Search, ShieldCheck, Upload, UserX, Wallet } from "lucide-react";
import type { Employee, EmployeeContract, Religion, Team } from "@/lib/types";
import { ContractsCard } from "./contracts-card";
import type { Locale } from "@/lib/i18n";

const RELIGIONS: Religion[] = ["islam", "kristen", "katolik", "hindu", "buddha", "konghucu"];
const RELIGION_LABEL: Record<Locale, Record<Religion, string>> = {
  id: { islam: "Islam", kristen: "Kristen", katolik: "Katolik", hindu: "Hindu", buddha: "Buddha", konghucu: "Konghucu" },
  en: { islam: "Islam", kristen: "Christian", katolik: "Catholic", hindu: "Hindu", buddha: "Buddhist", konghucu: "Confucian" },
};
import { TEAMS, TEAM_META } from "@/lib/constants";
import { prepareUpload } from "@/lib/image";
import { apiErrorMessage } from "@/lib/api-error";
import { cn, formatDate, rupiah } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge, EmployeeStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useLocale } from "@/components/layout/locale-context";

type StatusFilter = "all" | "active" | "inactive";
type RoleLite = { id: string; name: string; color: string };

const ID_STR = {
  // toasts & errors
  deactivated: (name: string) => `${name} dinonaktifkan ✓`,
  reactivated: (name: string) => `${name} diaktifkan kembali ✓`,
  statusFailed: "Gagal memperbarui status. Pastikan Anda HR/admin.",
  connection: "Koneksi bermasalah. Coba lagi.",
  added: (name: string) => `${name} ditambahkan ✓`,
  changesSaved: "Perubahan tersimpan ✓",
  roleUpdated: "Peran sistem diperbarui ✓",
  // controls
  searchPlaceholder: "Cari nama, NIK, posisi…",
  searchAria: "Cari karyawan",
  addEmployee: "Tambah Karyawan",
  // filters
  filterAll: (n: number) => `Semua (${n})`,
  filterActive: (n: number) => `Aktif (${n})`,
  filterInactive: (n: number) => `Nonaktif (${n})`,
  allTeams: "Semua tim",
  // table
  thEmployee: "Karyawan",
  thTeam: "Tim",
  thPosition: "Posisi",
  thJoined: "Bergabung",
  thBaseSalary: "Gaji pokok",
  thStatus: "Status",
  // detail drawer footer
  deactivate: "Nonaktifkan",
  activate: "Aktifkan",
  editData: "Edit data",
  // add / edit sheets
  addTitle: "Tambah Karyawan",
  addDescription: "Daftarkan karyawan baru ke database",
  editTitle: "Edit Karyawan",
  // confirm deactivate
  employeeFallback: "karyawan",
  confirmDeactivateTitle: (name: string) => `Nonaktifkan ${name}?`,
  confirmDeactivateMessage:
    "Karyawan tidak akan muncul di absensi & payroll aktif. Anda bisa mengaktifkannya kembali kapan saja.",
  confirmDeactivateLabel: "Ya, nonaktifkan",
  // detail
  email: "Email",
  phone: "Telepon",
  joined: "Bergabung",
  ended: "Berakhir",
  compensationTax: "Kompensasi & Pajak",
  baseSalary: "Gaji pokok",
  allowance: "Tunjangan",
  religion: "Agama",
  npwp: "NPWP",
  identity: "Identitas (KTP)",
  ktpNik: "NIK KTP",
  ktpNikPlaceholder: "16 digit",
  birthPlace: "Tempat lahir",
  birthPlacePlaceholder: "cth. Denpasar",
  dateOfBirth: "Tanggal lahir",
  ktpAddress: "Alamat KTP",
  ktpAddressPlaceholder: "Alamat sesuai KTP",
  ktpPhoto: "Foto KTP",
  ktpPhotoHint: "JPG/PNG — foto besar otomatis dikecilkan",
  ktpReadFailed: "Gagal memproses foto. Coba lagi.",
  viewKtp: "Lihat foto",
  changeFile: "Ganti file",
  bpjsKes: "BPJS Kesehatan",
  bpjsTk: "BPJS Ketenagakerjaan",
  activeLabel: "Aktif",
  salaryAccount: "Rekening Gaji",
  // role card
  systemRole: "Peran Sistem",
  systemRoleHint: "Menentukan hak akses karyawan di aplikasi ini.",
  noAccountOption: "— Belum ada akun —",
  noAccountError: "Karyawan ini belum punya akun login.",
  roleSaveFailed: "Gagal menyimpan peran. Pastikan Anda HR/admin.",
  // work hours card
  workHours: "Jam Kerja",
  workHoursHintBase: "Patokan telat saat clock-in (waktu WITA).",
  workHoursHintManage: "Atur jam masuk & keluar.",
  workHoursHintReadonly: "Hanya HR yang dapat mengubah.",
  clockIn: "Jam masuk",
  clockOut: "Jam keluar",
  saveWorkHours: "Simpan jam kerja",
  workHoursFailed: "Gagal menyimpan jam kerja. Pastikan Anda HR/admin.",
  workHoursSaved: (name: string) => `Jam kerja ${name} tersimpan ✓`,
  // empty state
  emptyTitle: "Tidak ada karyawan",
  emptyHint: "Coba ubah filter atau kata kunci pencarian.",
  // form
  fullName: "Nama lengkap",
  fullNamePlaceholder: "cth. Wayan Putra",
  team: "Tim",
  position: "Posisi",
  positionPlaceholder: "cth. Operator",
  phonePlaceholder: "0812-…",
  emailPlaceholder: "nama@treelogy.com",
  emailHint: "Wajib — akun login dibuat otomatis (sandi awal = email).",
  baseSalaryRp: "Gaji pokok (Rp)",
  allowanceRp: "Tunjangan (Rp)",
  clockInHint: "Patokan telat (WITA)",
  bank: "Bank",
  bankAccount: "No. rekening",
  cancel: "Batal",
  saveChanges: "Simpan perubahan",
  save: "Simpan",
  saveEditFailed: "Gagal menyimpan perubahan. Pastikan Anda HR/admin.",
  saveCreateFailed: "Gagal menambah karyawan. Pastikan Anda HR/admin.",
  accountCreatedMsg: "Akun login dibuat — kata sandi awal = email.",
};

const STR: Record<Locale, typeof ID_STR> = {
  id: ID_STR,
  en: {
    deactivated: (name: string) => `${name} deactivated ✓`,
    reactivated: (name: string) => `${name} reactivated ✓`,
    statusFailed: "Failed to update status. Make sure you are HR/admin.",
    connection: "Connection problem. Please try again.",
    added: (name: string) => `${name} added ✓`,
    changesSaved: "Changes saved ✓",
    roleUpdated: "System role updated ✓",
    searchPlaceholder: "Search name, NIK, position…",
    searchAria: "Search employees",
    addEmployee: "Add Employee",
    filterAll: (n: number) => `All (${n})`,
    filterActive: (n: number) => `Active (${n})`,
    filterInactive: (n: number) => `Inactive (${n})`,
    allTeams: "All teams",
    thEmployee: "Employee",
    thTeam: "Team",
    thPosition: "Position",
    thJoined: "Joined",
    thBaseSalary: "Base salary",
    thStatus: "Status",
    deactivate: "Deactivate",
    activate: "Activate",
    editData: "Edit details",
    addTitle: "Add Employee",
    addDescription: "Register a new employee in the database",
    editTitle: "Edit Employee",
    employeeFallback: "employee",
    confirmDeactivateTitle: (name: string) => `Deactivate ${name}?`,
    confirmDeactivateMessage:
      "The employee will no longer appear in active attendance & payroll. You can reactivate them at any time.",
    confirmDeactivateLabel: "Yes, deactivate",
    email: "Email",
    phone: "Phone",
    joined: "Joined",
    ended: "Ended",
    compensationTax: "Compensation & Tax",
    baseSalary: "Base salary",
    allowance: "Allowance",
    religion: "Religion",
    npwp: "NPWP",
    identity: "Identity (KTP)",
    ktpNik: "KTP NIK",
    ktpNikPlaceholder: "16 digits",
    birthPlace: "Birth place",
    birthPlacePlaceholder: "e.g. Denpasar",
    dateOfBirth: "Date of birth",
    ktpAddress: "KTP address",
    ktpAddressPlaceholder: "Address as on KTP",
    ktpPhoto: "KTP photo",
    ktpPhotoHint: "JPG/PNG — large photos are auto-compressed",
    ktpReadFailed: "Couldn't process the photo. Try again.",
    viewKtp: "View photo",
    changeFile: "Change file",
    bpjsKes: "BPJS Kesehatan",
    bpjsTk: "BPJS Ketenagakerjaan",
    activeLabel: "Active",
    salaryAccount: "Salary Account",
    systemRole: "System Role",
    systemRoleHint: "Determines the employee's access rights in this app.",
    noAccountOption: "— No account yet —",
    noAccountError: "This employee does not have a login account yet.",
    roleSaveFailed: "Failed to save the role. Make sure you are HR/admin.",
    workHours: "Work Hours",
    workHoursHintBase: "Late benchmark at clock-in (WITA time).",
    workHoursHintManage: "Set the clock-in & clock-out times.",
    workHoursHintReadonly: "Only HR can change this.",
    clockIn: "Clock-in time",
    clockOut: "Clock-out time",
    saveWorkHours: "Save work hours",
    workHoursFailed: "Failed to save work hours. Make sure you are HR/admin.",
    workHoursSaved: (name: string) => `Work hours for ${name} saved ✓`,
    emptyTitle: "No employees",
    emptyHint: "Try changing the filters or search keywords.",
    fullName: "Full name",
    fullNamePlaceholder: "e.g. Wayan Putra",
    team: "Team",
    position: "Position",
    positionPlaceholder: "e.g. Operator",
    emailHint: "Required — a login account is created automatically (initial password = email).",
    phonePlaceholder: "0812-…",
    emailPlaceholder: "name@treelogy.com",
    baseSalaryRp: "Base salary (Rp)",
    allowanceRp: "Allowance (Rp)",
    clockInHint: "Late benchmark (WITA)",
    bank: "Bank",
    bankAccount: "Account number",
    cancel: "Cancel",
    saveChanges: "Save changes",
    save: "Save",
    saveEditFailed: "Failed to save changes. Make sure you are HR/admin.",
    saveCreateFailed: "Failed to add the employee. Make sure you are HR/admin.",
    accountCreatedMsg: "Login account created — initial password = email.",
  },
};

export function EmployeesView({
  initial,
  canManage = false,
  canAssignRoles = false,
  roles = [],
  roleByEmployee = {},
  contracts = [],
}: {
  initial: Employee[];
  canManage?: boolean;
  canAssignRoles?: boolean;
  roles?: RoleLite[];
  roleByEmployee?: Record<string, string>;
  contracts?: EmployeeContract[];
}) {
  const [list, setList] = useState<Employee[]>(initial);
  const [q, setQ] = useState("");
  const [team, setTeam] = useState<"all" | Team>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<Employee | null>(null);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [adding, setAdding] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [roleMap, setRoleMap] = useState<Record<string, string>>(roleByEmployee);
  const [confirmDeactivate, setConfirmDeactivate] = useState<Employee | null>(null);
  const toast = useToast();
  const locale = useLocale();
  const t = STR[locale];

  const filtered = useMemo(() => {
    return list.filter((e) => {
      if (team !== "all" && e.team !== team) return false;
      if (status !== "all" && e.status !== status) return false;
      if (q && !`${e.name} ${e.nik} ${e.position} ${e.email}`.toLowerCase().includes(q.toLowerCase()))
        return false;
      return true;
    });
  }, [list, q, team, status]);

  const counts = {
    all: list.length,
    active: list.filter((e) => e.status === "active").length,
    inactive: list.filter((e) => e.status === "inactive").length,
  };

  function upsertLocal(emp: Employee) {
    setList((prev) => (prev.some((e) => e.id === emp.id) ? prev.map((e) => (e.id === emp.id ? emp : e)) : [emp, ...prev]));
  }

  async function toggleStatus(emp: Employee) {
    const next = emp.status === "active" ? "inactive" : "active";
    setTogglingId(emp.id);
    try {
      const res = await fetch("/api/employees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: emp.id, status: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.employee) {
        upsertLocal(data.employee);
        setSelected((s) => (s && s.id === emp.id ? data.employee : s));
        toast.success(
          next === "inactive"
            ? t.deactivated(emp.name)
            : t.reactivated(emp.name),
        );
      } else {
        toast.error(apiErrorMessage(data?.error, locale, res.status));
      }
    } catch {
      toast.error(t.connection);
    } finally {
      setTogglingId(null);
      setConfirmDeactivate(null);
    }
  }

  function onSaved(emp: Employee, mode: "create" | "edit") {
    upsertLocal(emp);
    setAdding(false);
    setEditing(null);
    setSelected(emp);
    toast.success(mode === "create" ? t.added(emp.name) : t.changesSaved);
  }

  return (
    <div className="space-y-4 fade-up">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="pl-9"
            aria-label={t.searchAria}
          />
        </div>
        <Button onClick={() => setAdding(true)} className="shrink-0">
          <Plus className="h-4 w-4" /> {t.addEmployee}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip active={status === "all"} onClick={() => setStatus("all")}>
          {t.filterAll(counts.all)}
        </FilterChip>
        <FilterChip active={status === "active"} onClick={() => setStatus("active")}>
          {t.filterActive(counts.active)}
        </FilterChip>
        <FilterChip active={status === "inactive"} onClick={() => setStatus("inactive")}>
          {t.filterInactive(counts.inactive)}
        </FilterChip>
        <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
        <FilterChip active={team === "all"} onClick={() => setTeam("all")}>
          {t.allTeams}
        </FilterChip>
        {TEAMS.map((tm) => (
          <FilterChip key={tm} active={team === tm} onClick={() => setTeam(tm)}>
            {TEAM_META[tm].label}
          </FilterChip>
        ))}
      </div>

      {/* Desktop table */}
      <Card className="hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-cream/50 text-left text-xs font-semibold uppercase tracking-wide text-faint">
                <th className="px-5 py-3">{t.thEmployee}</th>
                <th className="px-5 py-3">{t.thTeam}</th>
                <th className="px-5 py-3">{t.thPosition}</th>
                <th className="px-5 py-3">{t.thJoined}</th>
                <th className="px-5 py-3 text-right">{t.thBaseSalary}</th>
                <th className="px-5 py-3">{t.thStatus}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => setSelected(e)}
                  className="cursor-pointer transition-colors hover:bg-cream/60"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={e.name} size="sm" />
                      <div>
                        <p className="font-medium text-ink">{e.name}</p>
                        <p className="text-xs text-faint">{e.nik}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", TEAM_META[e.team].chip)}>
                      {TEAM_META[e.team].label}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted">{e.position}</td>
                  <td className="px-5 py-3 text-muted">{formatDate(e.joinDate, "short", locale)}</td>
                  <td className="px-5 py-3 text-right font-medium text-ink">{rupiah(e.baseSalary)}</td>
                  <td className="px-5 py-3">
                    <EmployeeStatusBadge status={e.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <EmptyRow />}
      </Card>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {filtered.map((e) => (
          <button
            key={e.id}
            onClick={() => setSelected(e)}
            className="card flex w-full items-center gap-3 p-4 text-left transition-colors active:bg-cream/60"
          >
            <Avatar name={e.name} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-medium text-ink">{e.name}</p>
                <EmployeeStatusBadge status={e.status} />
              </div>
              <p className="truncate text-xs text-faint">{e.position}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", TEAM_META[e.team].chip)}>
                  {TEAM_META[e.team].label}
                </span>
                <span className="text-xs text-muted">{rupiah(e.baseSalary, { compact: true })}</span>
              </div>
            </div>
          </button>
        ))}
        {filtered.length === 0 && <EmptyRow />}
      </div>

      {/* Detail drawer */}
      <Sheet
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ""}
        description={selected ? `${selected.nik} · ${selected.position}` : ""}
        footer={
          selected &&
          canManage && (
            <div className="flex gap-2">
              <Button
                variant={selected.status === "active" ? "outline" : "primary"}
                className="flex-1"
                disabled={togglingId === selected.id}
                onClick={() =>
                  selected.status === "active" ? setConfirmDeactivate(selected) : toggleStatus(selected)
                }
              >
                {togglingId === selected.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : selected.status === "active" ? (
                  t.deactivate
                ) : (
                  t.activate
                )}
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  const cur = selected;
                  setSelected(null);
                  setEditing(cur);
                }}
              >
                {t.editData}
              </Button>
            </div>
          )
        }
      >
        {selected && (
          <EmployeeDetail
            emp={selected}
            canManage={canManage}
            canAssignRoles={canAssignRoles}
            roles={roles}
            currentRoleId={roleMap[selected.id]}
            contracts={contracts.filter((c) => c.employeeId === selected.id)}
            onRoleAssigned={(empId, roleId) => {
              setRoleMap((prev) => ({ ...prev, [empId]: roleId }));
              toast.success(t.roleUpdated);
            }}
          />
        )}
      </Sheet>

      {/* Add form */}
      <Sheet open={adding} onClose={() => setAdding(false)} title={t.addTitle} description={t.addDescription}>
        <EmployeeForm onSaved={(e) => onSaved(e, "create")} onCancel={() => setAdding(false)} />
      </Sheet>

      {/* Edit form */}
      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={t.editTitle}
        description={editing ? `${editing.nik} · ${editing.name}` : ""}
      >
        {editing && <EmployeeForm initial={editing} onSaved={(e) => onSaved(e, "edit")} onCancel={() => setEditing(null)} />}
      </Sheet>

      {/* Deactivate confirmation */}
      <ConfirmDialog
        open={!!confirmDeactivate}
        tone="danger"
        icon={<UserX className="h-6 w-6" />}
        title={t.confirmDeactivateTitle(confirmDeactivate?.name ?? t.employeeFallback)}
        message={t.confirmDeactivateMessage}
        confirmLabel={t.confirmDeactivateLabel}
        busy={!!confirmDeactivate && togglingId === confirmDeactivate.id}
        onConfirm={() => confirmDeactivate && toggleStatus(confirmDeactivate)}
        onCancel={() => setConfirmDeactivate(null)}
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-forest-600 text-cream" : "bg-panel text-muted ring-1 ring-line hover:bg-sand",
      )}
    >
      {children}
    </button>
  );
}

function EmployeeDetail({
  emp,
  canManage,
  canAssignRoles,
  roles,
  currentRoleId,
  contracts,
  onRoleAssigned,
}: {
  emp: Employee;
  canManage: boolean;
  canAssignRoles: boolean;
  roles: RoleLite[];
  currentRoleId?: string;
  contracts: EmployeeContract[];
  onRoleAssigned: (employeeId: string, roleId: string) => void;
}) {
  const locale = useLocale();
  const t = STR[locale];
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Avatar name={emp.name} size="lg" />
        <div>
          <div className="flex items-center gap-2">
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", TEAM_META[emp.team].chip)}>
              {TEAM_META[emp.team].label}
            </span>
            <EmployeeStatusBadge status={emp.status} />
          </div>
          <p className="mt-1.5 text-sm text-muted">{emp.location}</p>
        </div>
      </div>

      <div className="space-y-2.5">
        <DetailRow icon={<Mail className="h-4 w-4" />} label={t.email} value={emp.email} />
        <DetailRow icon={<Phone className="h-4 w-4" />} label={t.phone} value={emp.phone} />
        <DetailRow icon={<Building2 className="h-4 w-4" />} label={t.joined} value={formatDate(emp.joinDate, "long", locale)} />
        {emp.endDate && <DetailRow icon={<Building2 className="h-4 w-4" />} label={t.ended} value={formatDate(emp.endDate, "long", locale)} />}
      </div>

      {canAssignRoles && roles.length > 0 && (
        <RoleCard emp={emp} roles={roles} currentRoleId={currentRoleId} onAssigned={onRoleAssigned} />
      )}

      <ContractsCard employeeId={emp.id} contracts={contracts} canManage={canManage} />

      {canManage && (
        <div className="rounded-2xl border border-line bg-panel p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <ShieldCheck className="h-4 w-4 text-forest-600" /> {t.identity}
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-y-3 text-sm">
            <Stat label={t.ktpNik} value={emp.ktpNik || "—"} />
            <Stat label={t.dateOfBirth} value={emp.dateOfBirth || "—"} />
            <Stat label={t.birthPlace} value={emp.birthPlace || "—"} />
            <div className="col-span-2">
              <dt className="text-faint">{t.ktpAddress}</dt>
              <dd className="mt-0.5 text-ink">{emp.ktpAddress || "—"}</dd>
            </div>
            <div>
              <dt className="text-faint">{t.ktpPhoto}</dt>
              <dd className="mt-0.5">
                {emp.ktpPhotoPath ? (
                  <a
                    href={`/api/ktp/photo?path=${encodeURIComponent(emp.ktpPhotoPath)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-sky hover:underline"
                  >
                    {t.viewKtp}
                  </a>
                ) : (
                  <span className="text-ink">—</span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      )}

      <div className="rounded-2xl border border-line bg-panel p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Wallet className="h-4 w-4 text-forest-600" /> {t.compensationTax}
        </h3>
        <dl className="mt-3 grid grid-cols-2 gap-y-3 text-sm">
          <Stat label={t.baseSalary} value={rupiah(emp.baseSalary)} />
          <Stat label={t.allowance} value={rupiah(emp.allowance)} />
          <Stat label={t.religion} value={emp.religion ? RELIGION_LABEL[locale][emp.religion] : "—"} />
          <Stat label={t.npwp} value={emp.npwp ?? "—"} />
          <Stat label={t.bpjsKes} value={emp.bpjsKes ? t.activeLabel : "—"} />
          <Stat label={t.bpjsTk} value={emp.bpjsTk ? t.activeLabel : "—"} />
        </dl>
      </div>

      <div className="rounded-2xl border border-line bg-panel p-4">
        <h3 className="text-sm font-semibold text-ink">{t.salaryAccount}</h3>
        <p className="mt-2 text-sm text-muted">
          {emp.bankName} · <span className="font-medium text-ink">{emp.bankAccount}</span>
        </p>
      </div>
    </div>
  );
}

function RoleCard({
  emp,
  roles,
  currentRoleId,
  onAssigned,
}: {
  emp: Employee;
  roles: RoleLite[];
  currentRoleId?: string;
  onAssigned: (employeeId: string, roleId: string) => void;
}) {
  const [roleId, setRoleId] = useState(currentRoleId ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const locale = useLocale();
  const t = STR[locale];

  async function assign(next: string) {
    if (!next || next === roleId) return;
    const prev = roleId;
    setRoleId(next); // optimistic
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: emp.id, roleId: next }),
      });
      if (!res.ok) {
        setRoleId(prev);
        const data = await res.json().catch(() => ({}));
        setMsg({ ok: false, text: apiErrorMessage(data?.error, locale, res.status) });
        return;
      }
      onAssigned(emp.id, next); // success toast is raised by the parent
    } catch {
      setRoleId(prev);
      setMsg({ ok: false, text: t.connection });
    } finally {
      setSaving(false);
    }
  }

  const activeRole = roles.find((r) => r.id === roleId);

  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <ShieldCheck className="h-4 w-4 text-forest-600" /> {t.systemRole}
      </h3>
      <p className="mt-1 text-xs text-muted">{t.systemRoleHint}</p>
      <div className="mt-3 flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: activeRole?.color ?? "#cbd5c0" }} />
        <Select value={roleId} onChange={(e) => assign(e.target.value)} disabled={saving} className="flex-1">
          {!currentRoleId && <option value="">{t.noAccountOption}</option>}
          {roles.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </Select>
        {saving && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
      </div>
      {msg && (
        <p className={cn("mt-2 text-xs", msg.ok ? "text-forest-600" : "text-clay")}>{msg.text}</p>
      )}
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2.5">
      <span className="text-faint">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-faint">{label}</p>
        <p className="truncate text-sm font-medium text-ink">{value}</p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}

function EmptyRow() {
  const locale = useLocale();
  const t = STR[locale];
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-12 text-center">
      <p className="text-sm font-medium text-ink">{t.emptyTitle}</p>
      <p className="text-sm text-faint">{t.emptyHint}</p>
    </div>
  );
}

function EmployeeForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Employee;
  onSaved: (e: Employee) => void;
  onCancel: () => void;
}) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    position: initial?.position ?? "",
    team: initial?.team ?? ("factory" as Team),
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    baseSalary: String(initial?.baseSalary ?? "3500000"),
    allowance: String(initial?.allowance ?? "500000"),
    religion: (initial?.religion ?? "") as Religion | "",
    birthPlace: initial?.birthPlace ?? "",
    dateOfBirth: initial?.dateOfBirth ?? "",
    ktpAddress: initial?.ktpAddress ?? "",
    ktpNik: initial?.ktpNik ?? "",
    bankName: initial?.bankName ?? "BCA",
    bankAccount: initial?.bankAccount ?? "",
    workStart: initial?.workStart ?? "08:00",
    workEnd: initial?.workEnd ?? "17:00",
  });
  // KTP scan as a data URL, only set when the user picks a new file.
  const [ktpPhotoFile, setKtpPhotoFile] = useState<string | null>(null);
  const [ktpFileName, setKtpFileName] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const locale = useLocale();
  const t = STR[locale];

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...(isEdit ? { id: initial!.id } : {}),
        name: form.name,
        team: form.team,
        position: form.position,
        email: form.email,
        phone: form.phone,
        baseSalary: Number(form.baseSalary) || 0,
        allowance: Number(form.allowance) || 0,
        religion: form.religion || null,
        birthPlace: form.birthPlace || null,
        dateOfBirth: form.dateOfBirth || null,
        ktpAddress: form.ktpAddress || null,
        ktpNik: form.ktpNik || null,
        ...(ktpPhotoFile ? { ktpPhotoFile } : {}),
        bankName: form.bankName,
        bankAccount: form.bankAccount,
        workStart: form.workStart,
        workEnd: form.workEnd,
      };
      const res = await fetch("/api/employees", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.employee) {
        toast.error(apiErrorMessage(data?.error, locale, res.status));
        return;
      }
      onSaved(data.employee as Employee);
      if (!isEdit && data.accountCreated) toast.success(t.accountCreatedMsg);
    } catch {
      toast.error(t.connection);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t.fullName} htmlFor="f-name">
        <Input id="f-name" required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={t.fullNamePlaceholder} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.team}>
          <Select value={form.team} onChange={(e) => set("team", e.target.value as Team)}>
            {TEAMS.map((tm) => (
              <option key={tm} value={tm}>{TEAM_META[tm].label}</option>
            ))}
          </Select>
        </Field>
        <Field label={t.position}>
          <Input value={form.position} onChange={(e) => set("position", e.target.value)} placeholder={t.positionPlaceholder} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.email} hint={t.emailHint}>
          <Input type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} placeholder={t.emailPlaceholder} />
        </Field>
        <Field label={t.phone}>
          <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder={t.phonePlaceholder} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.baseSalaryRp}>
          <Input type="number" value={form.baseSalary} onChange={(e) => set("baseSalary", e.target.value)} />
        </Field>
        <Field label={t.allowanceRp}>
          <Input type="number" value={form.allowance} onChange={(e) => set("allowance", e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.religion}>
          <Select value={form.religion} onChange={(e) => set("religion", e.target.value as Religion)}>
            <option value="">—</option>
            {RELIGIONS.map((rg) => (
              <option key={rg} value={rg}>{RELIGION_LABEL[locale][rg]}</option>
            ))}
          </Select>
        </Field>
        <Field label={t.ktpNik}>
          <Input
            value={form.ktpNik}
            onChange={(e) => set("ktpNik", e.target.value.replace(/\D/g, "").slice(0, 16))}
            inputMode="numeric"
            placeholder={t.ktpNikPlaceholder}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.birthPlace}>
          <Input value={form.birthPlace} onChange={(e) => set("birthPlace", e.target.value)} placeholder={t.birthPlacePlaceholder} />
        </Field>
        <Field label={t.dateOfBirth}>
          <Input type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
        </Field>
      </div>
      <Field label={t.ktpAddress}>
        <Input value={form.ktpAddress} onChange={(e) => set("ktpAddress", e.target.value)} placeholder={t.ktpAddressPlaceholder} />
      </Field>
      <Field label={t.ktpPhoto} hint={t.ktpPhotoHint}>
        <div className="flex items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-cream/50 px-3 py-2 text-sm text-ink transition-colors hover:bg-cream">
            <Upload className="h-4 w-4 text-faint" />
            <span className="truncate max-w-[12rem]">{ktpFileName || (initial?.ktpPhotoPath ? t.changeFile : t.ktpPhoto)}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = ""; // allow re-picking the same file
                if (!file) return;
                try {
                  // Compress in a web worker (EXIF-safe) so big phone photos
                  // stay well under the request-body limit when uploaded.
                  setKtpPhotoFile(await prepareUpload(file));
                  setKtpFileName(file.name);
                } catch {
                  toast.error(t.ktpReadFailed);
                }
              }}
            />
          </label>
          {initial?.ktpPhotoPath && !ktpPhotoFile && (
            <a
              href={`/api/ktp/photo?path=${encodeURIComponent(initial.ktpPhotoPath)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-sky hover:underline"
            >
              {t.viewKtp}
            </a>
          )}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.bank}>
          <Select value={form.bankName} onChange={(e) => set("bankName", e.target.value)}>
            {["BCA", "Mandiri", "BRI", "BNI"].map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </Select>
        </Field>
        <Field label={t.bankAccount}>
          <Input value={form.bankAccount} onChange={(e) => set("bankAccount", e.target.value)} />
        </Field>
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>
          {t.cancel}
        </Button>
        <Button type="submit" className="flex-1" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {isEdit ? t.saveChanges : t.save}
        </Button>
      </div>
    </form>
  );
}
