"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, CalendarRange, Check, Clock, Loader2, Pencil, PiggyBank, Plus, Trash2, Users, Wallet, X } from "lucide-react";
import type { Employee, RequestStatus, ScheduleTemplate, TabunganEntry, TabunganKind, Team } from "@/lib/types";
import { TEAM_META } from "@/lib/constants";
import { useLocale } from "@/components/layout/locale-context";
import type { Locale } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge, RequestBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { ScopeTabs, scopeOptionsFor, inScope, type Scope } from "@/components/ui/scope-tabs";
import { useStickyTab } from "@/lib/use-sticky-tab";
import { useToast } from "@/components/ui/toast";

type Emp = Pick<Employee, "id" | "name" | "team" | "position" | "workDays" | "workStart" | "workEnd" | "scheduleTemplateId">;

// Tampilan minggu mulai Senin → Sabtu → Minggu (getDay: 0=Min..6=Sab).
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WD2: Record<Locale, string[]> = {
  id: ["Mg", "Sn", "Sl", "Rb", "Km", "Jm", "Sb"],
  en: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
};

const KIND_LABEL: Record<Locale, Record<TabunganKind, string>> = {
  id: { deposit: "Setor", withdrawal: "Cairkan" },
  en: { deposit: "Deposit", withdrawal: "Withdraw" },
};

const STR: Record<
  Locale,
  {
    connectionError: string;
    approve: string;
    reject: string;
    cancel: string;
    save: string;
    deleteLabel: string;
    edit: string;
    startTimeLabel: string;
    endTimeLabel: string;
    // Templates
    scheduleTemplates: string;
    templatesDesc: string;
    newTemplate: string;
    noTemplates: string;
    applyToEmployees: string;
    editTemplateAria: (name: string) => string;
    templateNameLabel: string;
    templateNamePlaceholder: string;
    workDaysLabel: string;
    selectAtLeastOneDay: string;
    templateNameRequired: string;
    saveTemplateFailed: string;
    templateAdded: string;
    templateUpdated: string;
    templateDeleted: string;
    deleteTemplateFailed: string;
    deleteTemplateTitle: (name: string) => string;
    deleteTemplateMessage: string;
    deleteTemplateConfirm: string;
    addTemplateTitle: string;
    editTemplateTitle: string;
    // Apply template
    applyTitle: (name: string) => string;
    applyDesc: string;
    selectEmployeesFirst: string;
    applied: (n: number) => string;
    applyFailed: string;
    apply: string;
    // Employee schedules
    employeeSchedules: string;
    employeeSchedulesDesc: string;
    mySchedule: string;
    myScheduleDesc: string;
    dayOffEveryday: string;
    followsTemplate: (name: string) => string;
    customSchedule: string;
    editScheduleTitle: (name: string) => string;
    editScheduleDesc: string;
    saveScheduleFailed: string;
    scheduleSaved: string;
    // Tabungan
    insufficientBalanceEmployee: string;
    decideFailed: string;
    approvedToast: string;
    rejectedToast: string;
    leaveSavings: string;
    leaveSavingsDesc: string;
    pendingCount: (n: number) => string;
    withdrawSavings: string;
    yourLeaveSavings: string;
    days: (n: number) => string;
    noSavingsRecords: string;
    autoFromAttendance: string;
    tabunganSheetTitle: string;
    tabunganSheetDesc: string;
    requestSent: string;
    pickEmployeeFirst: string;
    dateRequired: string;
    minOneDay: string;
    overBalanceError: string;
    insufficientBalance: string;
    submitFailed: string;
    employeeLabel: string;
    kindLabel: string;
    withdrawOption: string;
    depositOption: string;
    workDateLabel: string;
    dayOffDateLabel: string;
    daysCountLabel: string;
    yourSavingsBalance: string;
    reasonLabel: string;
    reasonPlaceholder: string;
    submit: string;
  }
> = {
  id: {
    connectionError: "Koneksi bermasalah. Coba lagi.",
    approve: "Setujui",
    reject: "Tolak",
    cancel: "Batal",
    save: "Simpan",
    deleteLabel: "Hapus",
    edit: "Edit",
    startTimeLabel: "Jam mulai",
    endTimeLabel: "Jam selesai",
    scheduleTemplates: "Template Jadwal",
    templatesDesc: "Buat pola jadwal lalu terapkan ke beberapa karyawan sekaligus.",
    newTemplate: "Buat template",
    noTemplates: "Belum ada template. Buat satu untuk mempercepat pengaturan jadwal.",
    applyToEmployees: "Terapkan ke karyawan",
    editTemplateAria: (name) => `Ubah template ${name}`,
    templateNameLabel: "Nama template",
    templateNamePlaceholder: "cth. Kantor (Sen–Jum)",
    workDaysLabel: "Hari kerja",
    selectAtLeastOneDay: "Pilih minimal 1 hari kerja.",
    templateNameRequired: "Nama template wajib diisi.",
    saveTemplateFailed: "Gagal menyimpan template. Pastikan Anda berhak.",
    templateAdded: "Template dibuat ✓",
    templateUpdated: "Template diperbarui ✓",
    templateDeleted: "Template dihapus ✓",
    deleteTemplateFailed: "Gagal menghapus template.",
    deleteTemplateTitle: (name) => `Hapus template "${name}"?`,
    deleteTemplateMessage: "Karyawan yang sudah memakai template ini tidak berubah jadwalnya. Tindakan ini tidak bisa dibatalkan.",
    deleteTemplateConfirm: "Ya, hapus",
    addTemplateTitle: "Buat Template Jadwal",
    editTemplateTitle: "Ubah Template Jadwal",
    applyTitle: (name) => `Terapkan "${name}" ke karyawan`,
    applyDesc: "Jadwal karyawan terpilih akan disetel mengikuti template ini.",
    selectEmployeesFirst: "Pilih minimal 1 karyawan.",
    applied: (n) => `Jadwal diterapkan ke ${n} karyawan ✓`,
    applyFailed: "Gagal menerapkan template. Coba lagi.",
    apply: "Terapkan",
    employeeSchedules: "Jadwal Karyawan",
    employeeSchedulesDesc: "Hari & jam kerja tiap karyawan. Edit langsung untuk jadwal khusus.",
    mySchedule: "Jadwal Saya",
    myScheduleDesc: "Hari & jam kerja Anda. Hari di luar ini terhitung libur.",
    dayOffEveryday: "Belum ada hari kerja",
    followsTemplate: (name) => `Template: ${name}`,
    customSchedule: "Jadwal kustom",
    editScheduleTitle: (name) => `Edit Jadwal · ${name}`,
    editScheduleDesc: "Pilih hari & jam kerja karyawan ini.",
    saveScheduleFailed: "Gagal menyimpan jadwal. Pastikan Anda berhak.",
    scheduleSaved: "Jadwal disimpan ✓",
    insufficientBalanceEmployee: "Saldo tabungan karyawan tidak cukup untuk dicairkan.",
    decideFailed: "Gagal memproses. Pastikan Anda berhak menyetujui.",
    approvedToast: "Disetujui ✓",
    rejectedToast: "Ditolak ✓",
    leaveSavings: "Tabungan Libur",
    leaveSavingsDesc: "Kerja di hari libur menambah tabungan (dikonfirmasi HR); cairkan untuk ambil libur pengganti.",
    pendingCount: (n) => `${n} menunggu`,
    withdrawSavings: "Cairkan tabungan",
    yourLeaveSavings: "Tabungan libur Anda",
    days: (n) => `${n} hari`,
    noSavingsRecords: "Belum ada catatan tabungan libur.",
    autoFromAttendance: "otomatis dari absensi",
    tabunganSheetTitle: "Cairkan / Setor Tabungan Libur",
    tabunganSheetDesc: "Buat catatan tabungan libur baru",
    requestSent: "Pengajuan terkirim ✓",
    pickEmployeeFirst: "Pilih karyawan dulu.",
    dateRequired: "Tanggal wajib diisi.",
    minOneDay: "Jumlah hari minimal 1.",
    overBalanceError: "Jumlah melebihi saldo tabungan Anda.",
    insufficientBalance: "Saldo tabungan tidak cukup.",
    submitFailed: "Gagal mengajukan. Coba lagi.",
    employeeLabel: "Karyawan",
    kindLabel: "Jenis",
    withdrawOption: "Cairkan (ambil libur)",
    depositOption: "Setor (kerja hari libur)",
    workDateLabel: "Tanggal kerja",
    dayOffDateLabel: "Tanggal libur",
    daysCountLabel: "Jumlah hari",
    yourSavingsBalance: "Saldo tabungan Anda",
    reasonLabel: "Alasan",
    reasonPlaceholder: "cth. Ambil libur ganti kerja hari Minggu…",
    submit: "Ajukan",
  },
  en: {
    connectionError: "Connection problem. Try again.",
    approve: "Approve",
    reject: "Reject",
    cancel: "Cancel",
    save: "Save",
    deleteLabel: "Delete",
    edit: "Edit",
    startTimeLabel: "Start time",
    endTimeLabel: "End time",
    scheduleTemplates: "Schedule Templates",
    templatesDesc: "Build a schedule pattern, then apply it to several employees at once.",
    newTemplate: "New template",
    noTemplates: "No templates yet. Create one to speed up scheduling.",
    applyToEmployees: "Apply to employees",
    editTemplateAria: (name) => `Edit template ${name}`,
    templateNameLabel: "Template name",
    templateNamePlaceholder: "e.g. Office (Mon–Fri)",
    workDaysLabel: "Work days",
    selectAtLeastOneDay: "Select at least 1 work day.",
    templateNameRequired: "Template name is required.",
    saveTemplateFailed: "Failed to save the template. Make sure you are authorized.",
    templateAdded: "Template created ✓",
    templateUpdated: "Template updated ✓",
    templateDeleted: "Template deleted ✓",
    deleteTemplateFailed: "Failed to delete the template.",
    deleteTemplateTitle: (name) => `Delete template "${name}"?`,
    deleteTemplateMessage: "Employees already using this template keep their schedule. This action cannot be undone.",
    deleteTemplateConfirm: "Yes, delete",
    addTemplateTitle: "Create Schedule Template",
    editTemplateTitle: "Edit Schedule Template",
    applyTitle: (name) => `Apply "${name}" to employees`,
    applyDesc: "The selected employees' schedules will be set to follow this template.",
    selectEmployeesFirst: "Select at least 1 employee.",
    applied: (n) => `Schedule applied to ${n} employee${n === 1 ? "" : "s"} ✓`,
    applyFailed: "Failed to apply the template. Try again.",
    apply: "Apply",
    employeeSchedules: "Employee Schedules",
    employeeSchedulesDesc: "Each employee's work days & hours. Edit directly for a custom schedule.",
    mySchedule: "My Schedule",
    myScheduleDesc: "Your work days & hours. Days outside these count as days off.",
    dayOffEveryday: "No work days set",
    followsTemplate: (name) => `Template: ${name}`,
    customSchedule: "Custom schedule",
    editScheduleTitle: (name) => `Edit Schedule · ${name}`,
    editScheduleDesc: "Pick this employee's work days & hours.",
    saveScheduleFailed: "Failed to save the schedule. Make sure you are authorized.",
    scheduleSaved: "Schedule saved ✓",
    insufficientBalanceEmployee: "The employee's savings balance is not enough to withdraw.",
    decideFailed: "Failed to process. Make sure you are authorized to approve.",
    approvedToast: "Approved ✓",
    rejectedToast: "Rejected ✓",
    leaveSavings: "Leave Savings",
    leaveSavingsDesc: "Working on a day off adds to your savings (confirmed by HR); withdraw to take a replacement day off.",
    pendingCount: (n) => `${n} pending`,
    withdrawSavings: "Withdraw savings",
    yourLeaveSavings: "Your leave savings",
    days: (n) => `${n} day${n === 1 ? "" : "s"}`,
    noSavingsRecords: "No leave savings records yet.",
    autoFromAttendance: "automatic from attendance",
    tabunganSheetTitle: "Withdraw / Deposit Leave Savings",
    tabunganSheetDesc: "Create a new leave savings record",
    requestSent: "Request sent ✓",
    pickEmployeeFirst: "Select an employee first.",
    dateRequired: "Date is required.",
    minOneDay: "Minimum of 1 day.",
    overBalanceError: "The amount exceeds your savings balance.",
    insufficientBalance: "Savings balance is not enough.",
    submitFailed: "Failed to submit. Try again.",
    employeeLabel: "Employee",
    kindLabel: "Type",
    withdrawOption: "Withdraw (take a day off)",
    depositOption: "Deposit (worked on a day off)",
    workDateLabel: "Work date",
    dayOffDateLabel: "Day-off date",
    daysCountLabel: "Number of days",
    yourSavingsBalance: "Your savings balance",
    reasonLabel: "Reason",
    reasonPlaceholder: "e.g. Taking a day off in lieu of working on Sunday…",
    submit: "Submit",
  },
};

/** Pil hari kerja (read-only). */
function DayChips({ days, locale }: { days: number[]; locale: Locale }) {
  return (
    <div className="flex flex-wrap gap-1">
      {DAY_ORDER.map((d) => {
        const on = days.includes(d);
        return (
          <span
            key={d}
            className={cn(
              "flex h-6 w-7 items-center justify-center rounded-md text-[11px] font-medium",
              on ? "bg-forest-100 text-forest-700" : "bg-sand text-faint/70",
            )}
          >
            {WD2[locale][d]}
          </span>
        );
      })}
    </div>
  );
}

/** Toggle hari kerja (editable). */
function DayToggle({ value, onChange, locale }: { value: number[]; onChange: (d: number[]) => void; locale: Locale }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {DAY_ORDER.map((d) => {
        const on = value.includes(d);
        return (
          <button
            type="button"
            key={d}
            onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d].sort((a, b) => a - b))}
            className={cn(
              "h-9 w-11 rounded-lg text-sm font-medium transition-colors",
              on ? "bg-forest-600 text-cream" : "bg-sand text-muted hover:bg-sand/70",
            )}
            aria-pressed={on}
          >
            {WD2[locale][d]}
          </button>
        );
      })}
    </div>
  );
}

export function ShiftsView({
  templates,
  entries,
  employees,
  currentUserName = "HR",
  currentEmployeeId = null,
  canRequestForOthers = true,
  canApproveAll = false,
  approverTeam = null,
  canManageShifts = false,
  selfBalance = 0,
}: {
  templates: ScheduleTemplate[];
  entries: TabunganEntry[];
  employees: Emp[];
  currentUserName?: string;
  currentEmployeeId?: string | null;
  canRequestForOthers?: boolean;
  canApproveAll?: boolean;
  approverTeam?: Team | null;
  /** HR/admin atau pemegang shifts.manage: boleh kelola template & jadwal. */
  canManageShifts?: boolean;
  selfBalance?: number;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const [list, setList] = useState(entries);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  // Scope: HR/pengelola → Semua/Data Saya (default Data Saya).
  const scopeOpts = scopeOptionsFor(canManageShifts, false);
  const [scope, setScope] = useStickyTab<Scope>("schedule.scope", "mine", scopeOpts.length ? scopeOpts : ["mine"]);
  const matchScope = (employeeId: string) =>
    scopeOpts.length === 0 || inScope(scope, employeeId, empMap.get(employeeId)?.team, currentEmployeeId, approverTeam);
  const showEmployee = scope !== "mine" && (canApproveAll || approverTeam != null);

  const canDecide = useMemo(
    () => (e: TabunganEntry) => {
      if (canApproveAll) return true;
      if (!approverTeam) return false;
      if (e.employeeId === currentEmployeeId) return false;
      return empMap.get(e.employeeId)?.team === approverTeam;
    },
    [canApproveAll, approverTeam, currentEmployeeId, empMap],
  );

  async function decide(id: string, status: RequestStatus) {
    const prev = list.find((e) => e.id === id);
    if (!prev) return;
    setBusyId(id);
    setList((cur) => cur.map((e) => (e.id === id ? { ...e, status, approver: currentUserName } : e)));
    try {
      const res = await fetch("/api/tabungan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, approver: currentUserName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.request) {
        setList((cur) => cur.map((e) => (e.id === id ? prev : e)));
        toast.error(data.error === "insufficient_balance" ? t.insufficientBalanceEmployee : t.decideFailed);
        return;
      }
      setList((cur) => cur.map((e) => (e.id === id ? (data.request as TabunganEntry) : e)));
      toast.success(status === "approved" ? t.approvedToast : t.rejectedToast);
      router.refresh();
    } catch {
      setList((cur) => cur.map((e) => (e.id === id ? prev : e)));
      toast.error(t.connectionError);
    } finally {
      setBusyId(null);
    }
  }

  const pending = list.filter((e) => e.status === "pending" && canDecide(e)).length;
  const self = currentEmployeeId ? empMap.get(currentEmployeeId) : undefined;

  const scopedList = list.filter((e) => matchScope(e.employeeId));

  return (
    <div className="space-y-5 fade-up">
      {scopeOpts.length > 0 && <ScopeTabs options={scopeOpts} value={scope} onChange={setScope} />}

      {canManageShifts && scope === "all" ? (
        <>
          <TemplatesSection templates={templates} employees={employees} />
          <EmployeeSchedules employees={employees} templates={templates} />
        </>
      ) : (
        self && <MyScheduleCard emp={self} />
      )}

      {/* Tabungan libur */}
      <Card>
        <CardHeader className="flex-wrap">
          <div className="min-w-0">
            <CardTitle>{t.leaveSavings}</CardTitle>
            <p className="mt-0.5 text-sm text-muted">{t.leaveSavingsDesc}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {pending > 0 && <Badge tone="gold" className="whitespace-nowrap">{t.pendingCount(pending)}</Badge>}
            <Button size="sm" onClick={() => setAdding(true)}>
              <Wallet className="h-4 w-4" /> {t.withdrawSavings}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {currentEmployeeId && (
            <div className="flex items-center gap-3 rounded-2xl bg-bark px-4 py-3 text-cream">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-forest-700">
                <PiggyBank className="h-5 w-5 text-lime" />
              </span>
              <p className="text-sm text-forest-100/70">{t.yourLeaveSavings}</p>
              <p className="ml-auto font-display text-xl font-bold">{t.days(selfBalance)}</p>
            </div>
          )}

          {scopedList.length === 0 && (
            <div className="rounded-2xl border border-line bg-cream/40 px-5 py-10 text-center text-sm text-faint">
              {t.noSavingsRecords}
            </div>
          )}

          {scopedList.map((e) => {
            const emp = empMap.get(e.employeeId);
            const isDeposit = e.kind === "deposit";
            return (
              <div key={e.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-cream/40 p-4 sm:flex-row sm:items-center">
                {showEmployee && (
                  <div className="flex items-center gap-3 sm:w-52">
                    <Avatar name={emp?.name ?? "?"} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{emp?.name}</p>
                      <p className="truncate text-xs text-faint">{emp?.position}</p>
                    </div>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={isDeposit ? "matcha" : "clay"}>
                      {isDeposit ? <ArrowDownToLine className="h-3.5 w-3.5" /> : <ArrowUpFromLine className="h-3.5 w-3.5" />}
                      {KIND_LABEL[locale][e.kind]}
                    </Badge>
                    <span className={cn("text-sm font-semibold", isDeposit ? "text-forest-700" : "text-[#8c3c1f]")}>
                      {isDeposit ? "+" : "−"}{t.days(e.days)}
                    </span>
                    <span className="text-sm text-muted">{formatDate(e.eventDate, "short", locale)}</span>
                    {e.source === "attendance" && (
                      <span className="rounded-full bg-sand px-2 py-0.5 text-[10px] font-medium text-muted">{t.autoFromAttendance}</span>
                    )}
                  </div>
                  {e.reason && <p className="mt-1 line-clamp-1 text-sm text-faint">{e.reason}</p>}
                </div>
                <div className="flex items-center gap-2 sm:w-auto">
                  {e.status === "pending" && canDecide(e) ? (
                    <>
                      <Button size="sm" disabled={busyId === e.id} onClick={() => decide(e.id, "approved")} className="flex-1 sm:flex-none">
                        <Check className="h-4 w-4" /> {t.approve}
                      </Button>
                      <Button size="sm" variant="outline" disabled={busyId === e.id} onClick={() => decide(e.id, "rejected")} className="flex-1 sm:flex-none">
                        <X className="h-4 w-4" /> {t.reject}
                      </Button>
                    </>
                  ) : (
                    <RequestBadge status={e.status} />
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Sheet open={adding} onClose={() => setAdding(false)} title={t.tabunganSheetTitle} description={t.tabunganSheetDesc}>
        <TabunganForm
          employees={employees}
          currentEmployeeId={currentEmployeeId}
          canRequestForOthers={canRequestForOthers}
          selfBalance={selfBalance}
          onSubmit={(entry) => {
            setList((prev) => [entry, ...prev]);
            setAdding(false);
            toast.success(t.requestSent);
            router.refresh();
          }}
          onCancel={() => setAdding(false)}
        />
      </Sheet>
    </div>
  );
}

/* ---------------- Template Jadwal ---------------- */

function TemplatesSection({ templates, employees }: { templates: ScheduleTemplate[]; employees: Emp[] }) {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();
  const router = useRouter();
  const [list, setList] = useState(templates);
  const [form, setForm] = useState<ScheduleTemplate | "new" | null>(null);
  const [applying, setApplying] = useState<ScheduleTemplate | null>(null);
  const [deleting, setDeleting] = useState<ScheduleTemplate | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function remove() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const res = await fetch("/api/schedule/templates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleting.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        toast.error(t.deleteTemplateFailed);
        return;
      }
      setList((cur) => cur.filter((x) => x.id !== deleting.id));
      setForm(null);
      toast.success(t.templateDeleted);
      router.refresh();
    } catch {
      toast.error(t.connectionError);
    } finally {
      setDeleteBusy(false);
      setDeleting(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-wrap">
        <div className="min-w-0">
          <CardTitle>{t.scheduleTemplates}</CardTitle>
          <p className="mt-0.5 text-sm text-muted">{t.templatesDesc}</p>
        </div>
        <Button size="sm" variant="outline" className="shrink-0" onClick={() => setForm("new")}>
          <Plus className="h-4 w-4" /> {t.newTemplate}
        </Button>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-cream/40 px-5 py-8 text-center text-sm text-faint">
            {t.noTemplates}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {list.map((tpl) => (
              <div key={tpl.id} className="rounded-2xl border border-line bg-cream/40 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{tpl.name}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
                      <Clock className="h-3.5 w-3.5 text-faint" /> {tpl.workStart}–{tpl.workEnd}
                    </p>
                  </div>
                  <button
                    onClick={() => setForm(tpl)}
                    className="shrink-0 cursor-pointer rounded-lg p-1.5 text-faint transition-colors hover:bg-sand hover:text-ink"
                    aria-label={t.editTemplateAria(tpl.name)}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3">
                  <DayChips days={tpl.workDays} locale={locale} />
                </div>
                <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => setApplying(tpl)}>
                  <Users className="h-4 w-4" /> {t.applyToEmployees}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Sheet
        open={form !== null}
        onClose={() => setForm(null)}
        title={form === "new" ? t.addTemplateTitle : t.editTemplateTitle}
        description={form === "new" ? undefined : (form?.name ?? undefined)}
      >
        <TemplateForm
          key={form === "new" ? "new" : form?.id ?? "none"}
          template={form === "new" ? null : form}
          onSaved={(tpl, isNew) => {
            setList((cur) => (isNew ? [...cur, tpl] : cur.map((x) => (x.id === tpl.id ? tpl : x))));
            setForm(null);
            toast.success(isNew ? t.templateAdded : t.templateUpdated);
            router.refresh();
          }}
          onDelete={form !== "new" && form ? () => setDeleting(form) : undefined}
          onCancel={() => setForm(null)}
        />
      </Sheet>

      <Sheet open={applying !== null} onClose={() => setApplying(null)} title={applying ? t.applyTitle(applying.name) : ""} description={t.applyDesc}>
        {applying && (
          <ApplyTemplateForm
            template={applying}
            employees={employees}
            onDone={() => {
              setApplying(null);
              router.refresh();
            }}
            onCancel={() => setApplying(null)}
          />
        )}
      </Sheet>

      <ConfirmDialog
        open={deleting !== null}
        title={t.deleteTemplateTitle(deleting?.name ?? "")}
        message={t.deleteTemplateMessage}
        confirmLabel={t.deleteTemplateConfirm}
        tone="danger"
        busy={deleteBusy}
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </Card>
  );
}

function TemplateForm({
  template,
  onSaved,
  onDelete,
  onCancel,
}: {
  template: ScheduleTemplate | null;
  onSaved: (tpl: ScheduleTemplate, isNew: boolean) => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: template?.name ?? "",
    workDays: template?.workDays ?? [1, 2, 3, 4, 5],
    workStart: template?.workStart ?? "08:00",
    workEnd: template?.workEnd ?? "17:00",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error(t.templateNameRequired);
    if (form.workDays.length === 0) return toast.error(t.selectAtLeastOneDay);
    setSaving(true);
    try {
      const res = await fetch("/api/schedule/templates", {
        method: template ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(template ? { id: template.id, ...form } : form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.template) {
        toast.error(t.saveTemplateFailed);
        return;
      }
      onSaved(data.template as ScheduleTemplate, !template);
    } catch {
      toast.error(t.connectionError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t.templateNameLabel}>
        <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t.templateNamePlaceholder} required />
      </Field>
      <Field label={t.workDaysLabel}>
        <DayToggle value={form.workDays} onChange={(workDays) => setForm((f) => ({ ...f, workDays }))} locale={locale} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.startTimeLabel}>
          <Input type="time" value={form.workStart} onChange={(e) => setForm((f) => ({ ...f, workStart: e.target.value }))} required />
        </Field>
        <Field label={t.endTimeLabel}>
          <Input type="time" value={form.workEnd} onChange={(e) => setForm((f) => ({ ...f, workEnd: e.target.value }))} required />
        </Field>
      </div>
      <div className="flex gap-2 pt-2">
        {onDelete && (
          <Button type="button" variant="outline" onClick={onDelete} disabled={saving} className="text-[#8c3c1f]">
            <Trash2 className="h-4 w-4" /> {t.deleteLabel}
          </Button>
        )}
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>{t.cancel}</Button>
        <Button type="submit" className="flex-1" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {t.save}
        </Button>
      </div>
    </form>
  );
}

function ApplyTemplateForm({
  template,
  employees,
  onDone,
  onCancel,
}: {
  template: ScheduleTemplate;
  employees: Emp[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());

  function toggle(id: string) {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (picked.size === 0) return toast.error(t.selectEmployeesFirst);
    setSaving(true);
    try {
      const res = await fetch("/api/schedule/employee", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: template.id, employeeIds: [...picked] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        toast.error(t.applyFailed);
        return;
      }
      toast.success(t.applied(data.applied ?? picked.size));
      onDone();
    } catch {
      toast.error(t.connectionError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="max-h-[55vh] space-y-1.5 overflow-y-auto">
        {employees.map((e) => {
          const on = picked.has(e.id);
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => toggle(e.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                on ? "border-forest-300 bg-[#e9f0d8]" : "border-line bg-panel hover:bg-sand",
              )}
            >
              <Avatar name={e.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{e.name}</p>
                <p className="truncate text-xs text-faint">{TEAM_META[e.team].label} · {e.position}</p>
              </div>
              <span className={cn("flex h-5 w-5 items-center justify-center rounded-md border", on ? "border-forest-600 bg-forest-600 text-cream" : "border-line")}>
                {on && <Check className="h-3.5 w-3.5" />}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>{t.cancel}</Button>
        <Button type="button" className="flex-1" onClick={submit} disabled={saving || picked.size === 0}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {t.apply}
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Jadwal per karyawan ---------------- */

function EmployeeSchedules({ employees, templates }: { employees: Emp[]; templates: ScheduleTemplate[] }) {
  const locale = useLocale();
  const t = STR[locale];
  const router = useRouter();
  const tplMap = useMemo(() => new Map(templates.map((tp) => [tp.id, tp])), [templates]);
  const teamOrder: Team[] = ["factory", "farm", "office"];
  const rows = useMemo(
    () => [...employees].sort((a, b) => teamOrder.indexOf(a.team) - teamOrder.indexOf(b.team) || a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [employees],
  );
  const [editing, setEditing] = useState<Emp | null>(null);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{t.employeeSchedules}</CardTitle>
          <p className="mt-0.5 text-sm text-muted">{t.employeeSchedulesDesc}</p>
        </div>
      </CardHeader>
      <div className="divide-y divide-line">
        {rows.map((e) => {
          const tpl = e.scheduleTemplateId ? tplMap.get(e.scheduleTemplateId) : undefined;
          return (
            <div key={e.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
              <div className="flex items-center gap-3 sm:w-56">
                <Avatar name={e.name} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{e.name}</p>
                  <p className="truncate text-xs text-faint">
                    <span className={TEAM_META[e.team].tone}>{TEAM_META[e.team].label}</span> · {e.position}
                  </p>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <DayChips days={e.workDays} locale={locale} />
                  <span className="text-sm text-muted">{e.workStart}–{e.workEnd}</span>
                  <span className="text-xs text-faint">{tpl ? t.followsTemplate(tpl.name) : t.customSchedule}</span>
                </div>
              </div>
              <Button size="sm" variant="outline" className="shrink-0 sm:w-auto" onClick={() => setEditing(e)}>
                <Pencil className="h-4 w-4" /> {t.edit}
              </Button>
            </div>
          );
        })}
      </div>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing ? t.editScheduleTitle(editing.name) : ""} description={t.editScheduleDesc}>
        {editing && (
          <ScheduleForm
            key={editing.id}
            emp={editing}
            onDone={() => {
              setEditing(null);
              router.refresh();
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Sheet>
    </Card>
  );
}

function ScheduleForm({ emp, onDone, onCancel }: { emp: Emp; onDone: () => void; onCancel: () => void }) {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    workDays: emp.workDays,
    workStart: emp.workStart ?? "08:00",
    workEnd: emp.workEnd ?? "17:00",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.workDays.length === 0) return toast.error(t.selectAtLeastOneDay);
    setSaving(true);
    try {
      const res = await fetch("/api/schedule/employee", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: emp.id, ...form }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        toast.error(t.saveScheduleFailed);
        return;
      }
      toast.success(t.scheduleSaved);
      onDone();
    } catch {
      toast.error(t.connectionError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t.workDaysLabel}>
        <DayToggle value={form.workDays} onChange={(workDays) => setForm((f) => ({ ...f, workDays }))} locale={locale} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.startTimeLabel}>
          <Input type="time" value={form.workStart} onChange={(e) => setForm((f) => ({ ...f, workStart: e.target.value }))} required />
        </Field>
        <Field label={t.endTimeLabel}>
          <Input type="time" value={form.workEnd} onChange={(e) => setForm((f) => ({ ...f, workEnd: e.target.value }))} required />
        </Field>
      </div>
      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>{t.cancel}</Button>
        <Button type="submit" className="flex-1" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {t.save}
        </Button>
      </div>
    </form>
  );
}

/** Kartu jadwal read-only untuk karyawan (melihat jadwalnya sendiri). */
function MyScheduleCard({ emp }: { emp: Emp }) {
  const locale = useLocale();
  const t = STR[locale];
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-forest-100 text-forest-700">
            <CalendarRange className="h-4 w-4" />
          </span>
          <div>
            <CardTitle>{t.mySchedule}</CardTitle>
            <p className="mt-0.5 text-sm text-muted">{t.myScheduleDesc}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          {emp.workDays.length > 0 ? <DayChips days={emp.workDays} locale={locale} /> : <span className="text-sm text-faint">{t.dayOffEveryday}</span>}
          <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
            <Clock className="h-4 w-4 text-faint" /> {emp.workStart}–{emp.workEnd}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- Form tabungan (cairkan / setor) ---------------- */

function TabunganForm({
  employees,
  currentEmployeeId = null,
  canRequestForOthers = true,
  selfBalance = 0,
  onSubmit,
  onCancel,
}: {
  employees: Emp[];
  currentEmployeeId?: string | null;
  canRequestForOthers?: boolean;
  selfBalance?: number;
  onSubmit: (e: TabunganEntry) => void;
  onCancel: () => void;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const selfEmployee = currentEmployeeId ? employees.find((e) => e.id === currentEmployeeId) : undefined;
  const lockToSelf = !canRequestForOthers && !!selfEmployee;
  const [form, setForm] = useState({
    employeeId: lockToSelf ? selfEmployee!.id : employees[0]?.id ?? "",
    kind: "withdrawal" as TabunganKind,
    eventDate: "",
    days: 1,
    reason: "",
  });

  const selfWithdraw = form.employeeId === currentEmployeeId && form.kind === "withdrawal";
  const overBalance = selfWithdraw && form.days > selfBalance;

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!form.employeeId) return toast.error(t.pickEmployeeFirst);
    if (!form.eventDate) return toast.error(t.dateRequired);
    if (form.days < 1) return toast.error(t.minOneDay);
    if (overBalance) return toast.error(t.overBalanceError);
    setSaving(true);
    try {
      const res = await fetch("/api/tabungan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: form.employeeId,
          kind: form.kind,
          eventDate: form.eventDate,
          days: form.days,
          reason: form.reason,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.request) {
        toast.error(data.error === "insufficient_balance" ? t.insufficientBalance : t.submitFailed);
        return;
      }
      onSubmit(data.request as TabunganEntry);
    } catch {
      toast.error(t.connectionError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {lockToSelf ? (
        <Field label={t.employeeLabel}>
          <div className="flex items-center gap-3 rounded-xl border border-line bg-sand px-3 py-2.5">
            <Avatar name={selfEmployee!.name} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{selfEmployee!.name}</p>
              <p className="truncate text-xs text-faint">{TEAM_META[selfEmployee!.team].label}</p>
            </div>
          </div>
        </Field>
      ) : (
        <Field label={t.employeeLabel}>
          <Select value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name} — {TEAM_META[e.team].label}</option>
            ))}
          </Select>
        </Field>
      )}

      {canRequestForOthers && (
        <Field label={t.kindLabel}>
          <Select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as TabunganKind }))}>
            <option value="withdrawal">{t.withdrawOption}</option>
            <option value="deposit">{t.depositOption}</option>
          </Select>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label={form.kind === "deposit" ? t.workDateLabel : t.dayOffDateLabel}>
          <Input type="date" value={form.eventDate} onChange={(e) => setForm((f) => ({ ...f, eventDate: e.target.value }))} required />
        </Field>
        <Field label={t.daysCountLabel}>
          <Input type="number" min={1} value={form.days} onChange={(e) => setForm((f) => ({ ...f, days: Math.max(1, Number(e.target.value) || 1) }))} required />
        </Field>
      </div>

      {selfWithdraw && (
        <div className={cn("flex items-center justify-between rounded-xl px-3 py-2.5 text-sm", overBalance ? "bg-clay-soft text-[#8c3c1f]" : "bg-sand text-muted")}>
          <span>{t.yourSavingsBalance}</span>
          <span className="font-semibold">{t.days(selfBalance)}</span>
        </div>
      )}

      <Field label={t.reasonLabel}>
        <Textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder={t.reasonPlaceholder} />
      </Field>

      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>{t.cancel}</Button>
        <Button type="submit" className="flex-1" disabled={saving || overBalance}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {t.submit}
        </Button>
      </div>
    </form>
  );
}
