"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, CalendarDays, Check, Clock, Coffee, Loader2, Pencil, PiggyBank, Plus, Trash2, Wallet, X } from "lucide-react";
import type { Employee, RequestStatus, Shift, ShiftAssignment, TabunganEntry, TabunganKind, Team } from "@/lib/types";
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
import { useToast } from "@/components/ui/toast";

type Emp = Pick<Employee, "id" | "name" | "team" | "position">;

const KIND_LABEL: Record<Locale, Record<TabunganKind, string>> = {
  id: {
    deposit: "Setor",
    withdrawal: "Cairkan",
  },
  en: {
    deposit: "Deposit",
    withdrawal: "Withdraw",
  },
};

const STR: Record<
  Locale,
  {
    // ShiftsView
    insufficientBalanceEmployee: string;
    decideFailed: string;
    approvedToast: string;
    rejectedToast: string;
    connectionError: string;
    deleteShiftFailed: string;
    shiftDeleted: string;
    shiftDefinitions: string;
    addShift: string;
    editShiftAria: (name: string) => string;
    breakMinutes: (min: number) => string;
    overtimeAfter: string;
    leaveSavings: string;
    leaveSavingsDesc: string;
    pendingCount: (n: number) => string;
    withdrawSavings: string;
    yourLeaveSavings: string;
    days: (n: number) => string;
    noSavingsRecords: string;
    autoFromAttendance: string;
    approve: string;
    reject: string;
    tabunganSheetTitle: string;
    tabunganSheetDesc: string;
    requestSent: string;
    addShiftTitle: string;
    editShiftTitle: string;
    newShiftDesc: string;
    shiftAdded: string;
    shiftUpdated: string;
    deleteShiftTitle: (name: string) => string;
    deleteShiftMessage: string;
    deleteShiftConfirm: string;
    // ScheduleCard
    scheduleSaved: string;
    scheduleSaveFailed: string;
    shiftSchedule: string;
    scheduleDescManage: string;
    scheduleDescView: string;
    noShift: string;
    // ShiftForm
    shiftNameRequired: string;
    saveShiftFailed: string;
    shiftNameLabel: string;
    shiftNamePlaceholder: string;
    teamLabel: string;
    startTimeLabel: string;
    endTimeLabel: string;
    breakMinutesLabel: string;
    overtimeAfterLabel: string;
    colorLabel: string;
    shiftColorAria: string;
    deleteLabel: string;
    cancel: string;
    save: string;
    // TabunganForm
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
    insufficientBalanceEmployee: "Saldo tabungan karyawan tidak cukup untuk dicairkan.",
    decideFailed: "Gagal memproses. Pastikan Anda berhak menyetujui.",
    approvedToast: "Disetujui ✓",
    rejectedToast: "Ditolak ✓",
    connectionError: "Koneksi bermasalah. Coba lagi.",
    deleteShiftFailed: "Gagal menghapus shift.",
    shiftDeleted: "Shift dihapus ✓",
    shiftDefinitions: "Definisi Shift",
    addShift: "Tambah shift",
    editShiftAria: (name: string) => `Ubah shift ${name}`,
    breakMinutes: (min: number) => `Istirahat ${min} menit`,
    overtimeAfter: "Lembur setelah",
    leaveSavings: "Tabungan Libur",
    leaveSavingsDesc: "Kerja di hari libur menambah tabungan (dikonfirmasi HR); cairkan untuk ambil libur pengganti.",
    pendingCount: (n: number) => `${n} menunggu`,
    withdrawSavings: "Cairkan tabungan",
    yourLeaveSavings: "Tabungan libur Anda",
    days: (n: number) => `${n} hari`,
    noSavingsRecords: "Belum ada catatan tabungan libur.",
    autoFromAttendance: "otomatis dari absensi",
    approve: "Setujui",
    reject: "Tolak",
    tabunganSheetTitle: "Cairkan / Setor Tabungan Libur",
    tabunganSheetDesc: "Buat catatan tabungan libur baru",
    requestSent: "Pengajuan terkirim ✓",
    addShiftTitle: "Tambah Shift",
    editShiftTitle: "Ubah Shift",
    newShiftDesc: "Definisikan shift baru",
    shiftAdded: "Shift ditambahkan ✓",
    shiftUpdated: "Shift diperbarui ✓",
    deleteShiftTitle: (name: string) => `Hapus shift "${name}"?`,
    deleteShiftMessage: "Jadwal yang memakai shift ini ikut terhapus. Tindakan ini tidak bisa dibatalkan.",
    deleteShiftConfirm: "Ya, hapus",
    scheduleSaved: "Jadwal disimpan ✓",
    scheduleSaveFailed: "Gagal menyimpan jadwal. Coba lagi.",
    shiftSchedule: "Jadwal Shift",
    scheduleDescManage: "Atur shift tiap karyawan untuk tanggal terpilih.",
    scheduleDescView: "Jadwal shift karyawan untuk tanggal terpilih.",
    noShift: "— Tanpa shift",
    shiftNameRequired: "Nama shift wajib diisi.",
    saveShiftFailed: "Gagal menyimpan shift. Pastikan Anda berhak.",
    shiftNameLabel: "Nama shift",
    shiftNamePlaceholder: "cth. Factory Pagi",
    teamLabel: "Tim",
    startTimeLabel: "Jam mulai",
    endTimeLabel: "Jam selesai",
    breakMinutesLabel: "Istirahat (menit)",
    overtimeAfterLabel: "Lembur setelah",
    colorLabel: "Warna",
    shiftColorAria: "Warna shift",
    deleteLabel: "Hapus",
    cancel: "Batal",
    save: "Simpan",
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
    insufficientBalanceEmployee: "The employee's savings balance is not enough to withdraw.",
    decideFailed: "Failed to process. Make sure you are authorized to approve.",
    approvedToast: "Approved ✓",
    rejectedToast: "Rejected ✓",
    connectionError: "Connection problem. Try again.",
    deleteShiftFailed: "Failed to delete the shift.",
    shiftDeleted: "Shift deleted ✓",
    shiftDefinitions: "Shift Definitions",
    addShift: "Add shift",
    editShiftAria: (name: string) => `Edit shift ${name}`,
    breakMinutes: (min: number) => `${min} minute break`,
    overtimeAfter: "Overtime after",
    leaveSavings: "Leave Savings",
    leaveSavingsDesc: "Working on a day off adds to your savings (confirmed by HR); withdraw to take a replacement day off.",
    pendingCount: (n: number) => `${n} pending`,
    withdrawSavings: "Withdraw savings",
    yourLeaveSavings: "Your leave savings",
    days: (n: number) => `${n} day${n === 1 ? "" : "s"}`,
    noSavingsRecords: "No leave savings records yet.",
    autoFromAttendance: "automatic from attendance",
    approve: "Approve",
    reject: "Reject",
    tabunganSheetTitle: "Withdraw / Deposit Leave Savings",
    tabunganSheetDesc: "Create a new leave savings record",
    requestSent: "Request sent ✓",
    addShiftTitle: "Add Shift",
    editShiftTitle: "Edit Shift",
    newShiftDesc: "Define a new shift",
    shiftAdded: "Shift added ✓",
    shiftUpdated: "Shift updated ✓",
    deleteShiftTitle: (name: string) => `Delete shift "${name}"?`,
    deleteShiftMessage: "Schedules using this shift will also be deleted. This action cannot be undone.",
    deleteShiftConfirm: "Yes, delete",
    scheduleSaved: "Schedule saved ✓",
    scheduleSaveFailed: "Failed to save the schedule. Try again.",
    shiftSchedule: "Shift Schedule",
    scheduleDescManage: "Set each employee's shift for the selected date.",
    scheduleDescView: "Employee shift schedule for the selected date.",
    noShift: "— No shift",
    shiftNameRequired: "Shift name is required.",
    saveShiftFailed: "Failed to save the shift. Make sure you are authorized.",
    shiftNameLabel: "Shift name",
    shiftNamePlaceholder: "e.g. Factory Morning",
    teamLabel: "Team",
    startTimeLabel: "Start time",
    endTimeLabel: "End time",
    breakMinutesLabel: "Break (minutes)",
    overtimeAfterLabel: "Overtime after",
    colorLabel: "Color",
    shiftColorAria: "Shift color",
    deleteLabel: "Delete",
    cancel: "Cancel",
    save: "Save",
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

/** YYYY-MM-DD hari ini menurut WITA. */
function todayWita(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());
}

export function ShiftsView({
  shifts,
  assignments,
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
  shifts: Shift[];
  assignments: ShiftAssignment[];
  entries: TabunganEntry[];
  employees: Emp[];
  currentUserName?: string;
  currentEmployeeId?: string | null;
  canRequestForOthers?: boolean;
  canApproveAll?: boolean;
  approverTeam?: Team | null;
  /** HR/admin atau pemegang shifts.manage: boleh CRUD shift & atur jadwal. */
  canManageShifts?: boolean;
  /** Saved-day balance of the logged-in user, for the withdrawal cap. */
  selfBalance?: number;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const [shiftList, setShiftList] = useState(shifts);
  const [list, setList] = useState(entries);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Shift CRUD state: null = closed, "new" = create, otherwise the shift being edited.
  const [shiftForm, setShiftForm] = useState<Shift | "new" | null>(null);
  const [deletingShift, setDeletingShift] = useState<Shift | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();
  // A plain employee only sees their own entries → the name/avatar is redundant.
  const showEmployee = canApproveAll || approverTeam != null;

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
        toast.error(
          data.error === "insufficient_balance"
            ? t.insufficientBalanceEmployee
            : t.decideFailed,
        );
        return;
      }
      setList((cur) => cur.map((e) => (e.id === id ? (data.request as TabunganEntry) : e)));
      toast.success(status === "approved" ? t.approvedToast : t.rejectedToast);
      router.refresh(); // saldo tabungan & halaman lain ikut segar
    } catch {
      setList((cur) => cur.map((e) => (e.id === id ? prev : e)));
      toast.error(t.connectionError);
    } finally {
      setBusyId(null);
    }
  }

  async function deleteShift() {
    if (!deletingShift) return;
    setDeleteBusy(true);
    try {
      const res = await fetch("/api/shifts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deletingShift.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        toast.error(t.deleteShiftFailed);
        return;
      }
      setShiftList((cur) => cur.filter((s) => s.id !== deletingShift.id));
      setShiftForm(null);
      toast.success(t.shiftDeleted);
      router.refresh();
    } catch {
      toast.error(t.connectionError);
    } finally {
      setDeleteBusy(false);
      setDeletingShift(null);
    }
  }

  const pending = list.filter((e) => e.status === "pending" && canDecide(e)).length;

  return (
    <div className="space-y-5 fade-up">
      {/* Shift definitions */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">{t.shiftDefinitions}</h2>
          {canManageShifts && (
            <Button size="sm" variant="outline" onClick={() => setShiftForm("new")}>
              <Plus className="h-4 w-4" /> {t.addShift}
            </Button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shiftList.map((s) => (
            <div key={s.id} className="card overflow-hidden">
              <div className="h-1.5 w-full" style={{ background: s.color }} />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-ink">{s.name}</h3>
                    <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium", TEAM_META[s.team].chip)}>
                      {TEAM_META[s.team].label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-display text-lg font-bold tabular-nums text-forest-600">
                      {s.startTime}
                    </span>
                    {canManageShifts && (
                      <button
                        onClick={() => setShiftForm(s)}
                        className="cursor-pointer rounded-lg p-1.5 text-faint transition-colors hover:bg-sand hover:text-ink"
                        aria-label={t.editShiftAria(s.name)}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-3 space-y-1.5 text-sm text-muted">
                  <p className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-faint" /> {s.startTime} – {s.endTime}
                  </p>
                  <p className="flex items-center gap-2">
                    <Coffee className="h-4 w-4 text-faint" /> {t.breakMinutes(s.breakMinutes)}
                  </p>
                  <p className="flex items-center gap-2">
                    <ArrowUpFromLine className="h-4 w-4 text-faint" /> {t.overtimeAfter} {s.overtimeAfter}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Jadwal shift per tanggal */}
      <ScheduleCard
        shifts={shiftList}
        assignments={assignments}
        employees={employees}
        canManage={canManageShifts}
      />

      {/* Tabungan libur — ledger of deposits (kerja hari libur) & withdrawals (ambil libur) */}
      <Card>
        <CardHeader className="flex-wrap">
          <div className="min-w-0">
            <CardTitle>{t.leaveSavings}</CardTitle>
            <p className="mt-0.5 text-sm text-muted">
              {t.leaveSavingsDesc}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {pending > 0 && (
              <Badge tone="gold" className="whitespace-nowrap">{t.pendingCount(pending)}</Badge>
            )}
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

          {list.length === 0 && (
            <div className="rounded-2xl border border-line bg-cream/40 px-5 py-10 text-center text-sm text-faint">
              {t.noSavingsRecords}
            </div>
          )}

          {list.map((e) => {
            const emp = empMap.get(e.employeeId);
            const isDeposit = e.kind === "deposit";
            return (
              <div
                key={e.id}
                className="flex flex-col gap-3 rounded-2xl border border-line bg-cream/40 p-4 sm:flex-row sm:items-center"
              >
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

      <Sheet
        open={shiftForm !== null}
        onClose={() => setShiftForm(null)}
        title={shiftForm === "new" ? t.addShiftTitle : t.editShiftTitle}
        description={shiftForm === "new" ? t.newShiftDesc : shiftForm?.name}
      >
        <ShiftForm
          key={shiftForm === "new" ? "new" : shiftForm?.id ?? "none"}
          shift={shiftForm === "new" ? null : shiftForm}
          onSaved={(s, isNew) => {
            setShiftList((cur) => (isNew ? [...cur, s] : cur.map((x) => (x.id === s.id ? s : x))));
            setShiftForm(null);
            toast.success(isNew ? t.shiftAdded : t.shiftUpdated);
            router.refresh();
          }}
          onDelete={shiftForm !== "new" && shiftForm ? () => setDeletingShift(shiftForm) : undefined}
          onCancel={() => setShiftForm(null)}
        />
      </Sheet>

      <ConfirmDialog
        open={deletingShift !== null}
        title={t.deleteShiftTitle(deletingShift?.name ?? "")}
        message={t.deleteShiftMessage}
        confirmLabel={t.deleteShiftConfirm}
        tone="danger"
        busy={deleteBusy}
        onConfirm={deleteShift}
        onCancel={() => setDeletingShift(null)}
      />
    </div>
  );
}

/* ---------------- Jadwal shift per tanggal ---------------- */

function ScheduleCard({
  shifts,
  assignments,
  employees,
  canManage,
}: {
  shifts: Shift[];
  assignments: ShiftAssignment[];
  employees: Emp[];
  canManage: boolean;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();
  const router = useRouter();
  const [date, setDate] = useState(todayWita());
  // (employeeId|date) → shiftId, seeded from the server, updated optimistically.
  const [map, setMap] = useState<Map<string, string>>(
    () => new Map(assignments.map((a) => [`${a.employeeId}|${a.date}`, a.shiftId])),
  );
  const [busyEmp, setBusyEmp] = useState<string | null>(null);

  const shiftById = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);
  const teamOrder: Team[] = ["factory", "farm", "office"];
  const rows = useMemo(
    () =>
      [...employees].sort(
        (a, b) => teamOrder.indexOf(a.team) - teamOrder.indexOf(b.team) || a.name.localeCompare(b.name),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [employees],
  );

  async function assign(employeeId: string, shiftId: string) {
    const key = `${employeeId}|${date}`;
    const prev = map.get(key) ?? "";
    setBusyEmp(employeeId);
    setMap((cur) => {
      const next = new Map(cur);
      if (shiftId) next.set(key, shiftId);
      else next.delete(key);
      return next;
    });
    try {
      const res = await fetch("/api/shifts/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, date, shiftId: shiftId || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error();
      toast.success(t.scheduleSaved);
      router.refresh();
    } catch {
      setMap((cur) => {
        const next = new Map(cur);
        if (prev) next.set(key, prev);
        else next.delete(key);
        return next;
      });
      toast.error(t.scheduleSaveFailed);
    } finally {
      setBusyEmp(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-wrap">
        <div className="min-w-0">
          <CardTitle>{t.shiftSchedule}</CardTitle>
          <p className="mt-0.5 text-sm text-muted">
            {canManage ? t.scheduleDescManage : t.scheduleDescView}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <CalendarDays className="h-4 w-4 text-faint" />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" />
        </div>
      </CardHeader>
      <div className="divide-y divide-line">
        {rows.map((e) => {
          const assigned = map.get(`${e.id}|${date}`) ?? "";
          const teamShifts = shifts.filter((s) => s.team === e.team);
          const current = assigned ? shiftById.get(assigned) : undefined;
          return (
            <div key={e.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <Avatar name={e.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{e.name}</p>
                <p className="truncate text-xs text-faint">
                  <span className={TEAM_META[e.team].tone}>{TEAM_META[e.team].label}</span> · {e.position}
                </p>
              </div>
              {canManage ? (
                <div className="flex shrink-0 items-center gap-2">
                  {busyEmp === e.id && <Loader2 className="h-4 w-4 animate-spin text-faint" />}
                  <Select
                    value={assigned}
                    disabled={busyEmp === e.id}
                    onChange={(ev) => assign(e.id, ev.target.value)}
                    className="w-36 sm:w-48"
                  >
                    <option value="">{t.noShift}</option>
                    {teamShifts.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.startTime}–{s.endTime})</option>
                    ))}
                  </Select>
                </div>
              ) : current ? (
                <span className="flex shrink-0 items-center gap-2 text-right text-sm text-muted">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: current.color }} />
                  <span className="hidden sm:inline">{current.name} · </span>
                  {current.startTime}–{current.endTime}
                </span>
              ) : (
                <span className="shrink-0 text-sm text-faint">{t.noShift}</span>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ---------------- Form shift (tambah / ubah) ---------------- */

function ShiftForm({
  shift,
  onSaved,
  onDelete,
  onCancel,
}: {
  shift: Shift | null;
  onSaved: (s: Shift, isNew: boolean) => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: shift?.name ?? "",
    team: (shift?.team ?? "factory") as Team,
    startTime: shift?.startTime ?? "07:00",
    endTime: shift?.endTime ?? "15:00",
    breakMinutes: shift?.breakMinutes ?? 60,
    overtimeAfter: shift?.overtimeAfter ?? "15:00",
    color: shift?.color ?? "#3d5a2e",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error(t.shiftNameRequired);
    setSaving(true);
    try {
      const res = await fetch("/api/shifts", {
        method: shift ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shift ? { id: shift.id, ...form } : form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.shift) {
        toast.error(t.saveShiftFailed);
        return;
      }
      onSaved(data.shift as Shift, !shift);
    } catch {
      toast.error(t.connectionError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t.shiftNameLabel}>
        <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t.shiftNamePlaceholder} required />
      </Field>
      <Field label={t.teamLabel}>
        <Select value={form.team} onChange={(e) => setForm((f) => ({ ...f, team: e.target.value as Team }))}>
          {(["factory", "farm", "office"] as Team[]).map((t) => (
            <option key={t} value={t}>{TEAM_META[t].label}</option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.startTimeLabel}>
          <Input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} required />
        </Field>
        <Field label={t.endTimeLabel}>
          <Input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} required />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.breakMinutesLabel}>
          <Input
            type="number"
            min={0}
            value={form.breakMinutes}
            onChange={(e) => setForm((f) => ({ ...f, breakMinutes: Math.max(0, Number(e.target.value) || 0) }))}
          />
        </Field>
        <Field label={t.overtimeAfterLabel}>
          <Input type="time" value={form.overtimeAfter} onChange={(e) => setForm((f) => ({ ...f, overtimeAfter: e.target.value }))} required />
        </Field>
      </div>
      <Field label={t.colorLabel}>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={form.color}
            onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
            className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-panel p-1"
            aria-label={t.shiftColorAria}
          />
          <span className="text-sm text-muted">{form.color}</span>
        </div>
      </Field>
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
    // Employees can only withdraw; HR may also file a manual deposit.
    kind: "withdrawal" as TabunganKind,
    eventDate: "",
    days: 1,
    reason: "",
  });

  // Cap a self-withdrawal at the visible balance (server re-checks regardless).
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
        toast.error(
          data.error === "insufficient_balance"
            ? t.insufficientBalance
            : t.submitFailed,
        );
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
