"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Check, Loader2, Paperclip, Plus, Wallet, X } from "lucide-react";
import type { Employee, OvertimeRequest, RequestStatus, Team } from "@/lib/types";
import { TEAM_META } from "@/lib/constants";
import { compressImageFile } from "@/lib/image";
import { formatDate, rupiah } from "@/lib/utils";
import { useLocale } from "@/components/layout/locale-context";
import type { Locale } from "@/lib/i18n";
import { Avatar } from "@/components/ui/avatar";
import { Badge, RequestBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";

type Emp = Pick<Employee, "id" | "name" | "team" | "position">;

const STR: Record<
  Locale,
  {
    processFailed: string;
    connectionError: string;
    approvedToast: string;
    rejectedToast: string;
    markedPaidToast: string;
    needApproval: (n: number) => string;
    unpaidTotal: (amount: string) => string;
    requestOvertime: string;
    emptyRequests: string;
    hours: (n: number) => string;
    viewProof: string;
    approve: string;
    reject: string;
    paid: string;
    markPaid: string;
    unpaid: string;
    sheetTitle: string;
    sheetDesc: string;
    requestSent: string;
    onlyImageOrPdf: string;
    maxFileSize: string;
    readFileFailed: string;
    pickEmployeeFirst: string;
    dateRequired: string;
    timesRequired: string;
    endAfterStart: string;
    invalidTime: string;
    invalidProofType: string;
    proofTooLarge: string;
    proofUploadFailed: string;
    submitFailed: string;
    employee: string;
    overtimeDate: string;
    startTime: string;
    endTime: string;
    duration: string;
    estimatedPay: string;
    reasonLabel: string;
    reasonPlaceholder: string;
    proofOptional: string;
    removeAttachment: string;
    attachImageOrPdf: string;
    proofNote: string;
    cancel: string;
    submit: string;
  }
> = {
  id: {
    processFailed: "Gagal memproses. Pastikan Anda berhak.",
    connectionError: "Koneksi bermasalah. Coba lagi.",
    approvedToast: "Lembur disetujui ✓",
    rejectedToast: "Lembur ditolak ✓",
    markedPaidToast: "Ditandai sudah dibayar ✓",
    needApproval: (n: number) => `${n} perlu persetujuan`,
    unpaidTotal: (amount: string) => `Belum dibayar: ${amount}`,
    requestOvertime: "Ajukan Lembur",
    emptyRequests: "Belum ada pengajuan lembur.",
    hours: (n: number) => `${n} jam`,
    viewProof: "Lihat bukti",
    approve: "Setujui",
    reject: "Tolak",
    paid: "Dibayar",
    markPaid: "Tandai dibayar",
    unpaid: "Belum dibayar",
    sheetTitle: "Ajukan Lembur",
    sheetDesc: "Buat pengajuan lembur baru",
    requestSent: "Pengajuan lembur terkirim ✓",
    onlyImageOrPdf: "Hanya file gambar atau PDF yang didukung.",
    maxFileSize: "Ukuran file maksimal 5 MB.",
    readFileFailed: "Gagal membaca file.",
    pickEmployeeFirst: "Pilih karyawan dulu.",
    dateRequired: "Tanggal lembur wajib diisi.",
    timesRequired: "Jam mulai & selesai wajib diisi.",
    endAfterStart: "Jam selesai harus setelah jam mulai.",
    invalidTime: "Format jam tidak valid.",
    invalidProofType: "Bukti harus berupa gambar atau PDF.",
    proofTooLarge: "Ukuran file bukti maksimal 5 MB.",
    proofUploadFailed: "Gagal mengunggah file bukti. Coba lagi.",
    submitFailed: "Gagal mengajukan lembur.",
    employee: "Karyawan",
    overtimeDate: "Tanggal lembur",
    startTime: "Jam mulai",
    endTime: "Jam selesai",
    duration: "Durasi",
    estimatedPay: "Perkiraan upah lembur",
    reasonLabel: "Alasan / uraian pekerjaan",
    reasonPlaceholder: "cth. Kejar target produksi…",
    proofOptional: "Bukti (opsional)",
    removeAttachment: "Hapus lampiran",
    attachImageOrPdf: "Lampirkan gambar atau PDF",
    proofNote: "Maks. 5 MB. Tidak wajib.",
    cancel: "Batal",
    submit: "Ajukan",
  },
  en: {
    processFailed: "Failed to process. Make sure you are authorized.",
    connectionError: "Connection problem. Please try again.",
    approvedToast: "Overtime approved ✓",
    rejectedToast: "Overtime rejected ✓",
    markedPaidToast: "Marked as paid ✓",
    needApproval: (n: number) => `${n} awaiting approval`,
    unpaidTotal: (amount: string) => `Unpaid: ${amount}`,
    requestOvertime: "Request Overtime",
    emptyRequests: "No overtime requests yet.",
    hours: (n: number) => `${n} hour${n === 1 ? "" : "s"}`,
    viewProof: "View proof",
    approve: "Approve",
    reject: "Reject",
    paid: "Paid",
    markPaid: "Mark as paid",
    unpaid: "Unpaid",
    sheetTitle: "Request Overtime",
    sheetDesc: "Create a new overtime request",
    requestSent: "Overtime request submitted ✓",
    onlyImageOrPdf: "Only image or PDF files are supported.",
    maxFileSize: "Maximum file size is 5 MB.",
    readFileFailed: "Failed to read the file.",
    pickEmployeeFirst: "Select an employee first.",
    dateRequired: "Overtime date is required.",
    timesRequired: "Start & end times are required.",
    endAfterStart: "End time must be after the start time.",
    invalidTime: "Invalid time format.",
    invalidProofType: "Proof must be an image or PDF.",
    proofTooLarge: "Proof file size must be at most 5 MB.",
    proofUploadFailed: "Failed to upload the proof file. Please try again.",
    submitFailed: "Failed to submit overtime request.",
    employee: "Employee",
    overtimeDate: "Overtime date",
    startTime: "Start time",
    endTime: "End time",
    duration: "Duration",
    estimatedPay: "Estimated overtime pay",
    reasonLabel: "Reason / work description",
    reasonPlaceholder: "e.g. Meeting production targets…",
    proofOptional: "Proof (optional)",
    removeAttachment: "Remove attachment",
    attachImageOrPdf: "Attach an image or PDF",
    proofNote: "Max 5 MB. Optional.",
    cancel: "Cancel",
    submit: "Submit",
  },
};

export function OvertimeView({
  requests,
  employees,
  currentUserName = "HR",
  currentEmployeeId = null,
  canRequestForOthers = true,
  canApproveAll = false,
  approverTeam = null,
  canMarkPaid = false,
  selfRatePerHour = 0,
}: {
  requests: OvertimeRequest[];
  employees: Emp[];
  currentUserName?: string;
  currentEmployeeId?: string | null;
  canRequestForOthers?: boolean;
  canApproveAll?: boolean;
  approverTeam?: Team | null;
  /** Payroll/HR may mark an approved request as paid. */
  canMarkPaid?: boolean;
  /** Hourly rate of the logged-in user (own salary only) for the live estimate. */
  selfRatePerHour?: number;
}) {
  const [list, setList] = useState(requests);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const toast = useToast();
  const router = useRouter();
  const locale = useLocale();
  const t = STR[locale];
  // A plain employee only sees their own rows → the name/avatar is redundant.
  const showEmployee = canApproveAll || approverTeam != null;

  const canDecide = useMemo(
    () => (r: OvertimeRequest) => {
      if (canApproveAll) return true;
      if (!approverTeam) return false;
      if (r.employeeId === currentEmployeeId) return false;
      return empMap.get(r.employeeId)?.team === approverTeam;
    },
    [canApproveAll, approverTeam, currentEmployeeId, empMap],
  );

  async function patch(id: string, payload: Record<string, unknown>, optimistic: Partial<OvertimeRequest>) {
    const prev = list.find((r) => r.id === id);
    if (!prev) return;
    setBusyId(id);
    setList((cur) => cur.map((r) => (r.id === id ? { ...r, ...optimistic } : r)));
    try {
      const res = await fetch("/api/overtime", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.request) {
        setList((cur) => cur.map((r) => (r.id === id ? prev : r)));
        toast.error(t.processFailed);
        return false;
      }
      setList((cur) => cur.map((r) => (r.id === id ? (data.request as OvertimeRequest) : r)));
      router.refresh(); // sinkronkan dashboard & halaman lain di latar belakang
      return true;
    } catch {
      setList((cur) => cur.map((r) => (r.id === id ? prev : r)));
      toast.error(t.connectionError);
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function decide(id: string, status: RequestStatus) {
    const ok = await patch(id, { status, approver: currentUserName }, { status, approver: currentUserName });
    if (ok) toast.success(status === "approved" ? t.approvedToast : t.rejectedToast);
  }

  async function markPaid(id: string) {
    const ok = await patch(id, { paid: true }, { paid: true });
    if (ok) toast.success(t.markedPaidToast);
  }

  const pending = list.filter((r) => r.status === "pending" && canDecide(r)).length;
  const unpaidTotal = list
    .filter((r) => r.status === "approved" && !r.paid)
    .reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {pending > 0 && (
            <Badge tone="gold" className="shrink-0 whitespace-nowrap">
              {t.needApproval(pending)}
            </Badge>
          )}
          {unpaidTotal > 0 && (
            <Badge tone="clay" className="shrink-0 whitespace-nowrap">
              {t.unpaidTotal(rupiah(unpaidTotal))}
            </Badge>
          )}
        </div>
        <Button onClick={() => setAdding(true)} className="shrink-0">
          <Plus className="h-4 w-4" /> {t.requestOvertime}
        </Button>
      </div>

      <div className="space-y-3">
        {list.length === 0 && (
          <div className="card px-5 py-10 text-center text-sm text-faint">{t.emptyRequests}</div>
        )}
        {list.map((r) => {
          const emp = empMap.get(r.employeeId);
          return (
            <div key={r.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              {showEmployee && (
                <div className="flex items-center gap-3 sm:w-44">
                  <Avatar name={emp?.name ?? "?"} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{emp?.name ?? "?"}</p>
                    <p className="truncate text-xs text-faint">
                      {emp && <span className={TEAM_META[emp.team].tone}>{TEAM_META[emp.team].label}</span>}
                    </p>
                  </div>
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-sm font-medium text-ink">
                    {formatDate(r.date, "short", locale)} · {r.startTime}–{r.endTime}
                  </span>
                  <span className="text-sm text-muted">{t.hours(r.hours)}</span>
                  <span className="text-sm font-semibold text-forest-700">{rupiah(r.amount)}</span>
                </div>
                {r.reason && <p className="mt-1 line-clamp-1 text-sm text-faint">{r.reason}</p>}
                {r.proofPath && (
                  <a
                    href={`/api/overtime/proof?path=${encodeURIComponent(r.proofPath)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-sky hover:underline"
                  >
                    <Paperclip className="h-3.5 w-3.5" /> {t.viewProof}
                  </a>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 sm:w-auto">
                {r.status === "pending" && canDecide(r) ? (
                  <>
                    <Button size="sm" disabled={busyId === r.id} onClick={() => decide(r.id, "approved")} className="flex-1 sm:flex-none">
                      <Check className="h-4 w-4" /> {t.approve}
                    </Button>
                    <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => decide(r.id, "rejected")} className="flex-1 sm:flex-none">
                      <X className="h-4 w-4" /> {t.reject}
                    </Button>
                  </>
                ) : (
                  <RequestBadge status={r.status} />
                )}

                {r.status === "approved" &&
                  (r.paid ? (
                    <Badge tone="matcha" className="whitespace-nowrap">
                      <BadgeCheck className="h-3.5 w-3.5" /> {t.paid}
                    </Badge>
                  ) : canMarkPaid ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyId === r.id}
                      onClick={() => markPaid(r.id)}
                      className="whitespace-nowrap"
                    >
                      {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                      {t.markPaid}
                    </Button>
                  ) : (
                    <Badge tone="gold" className="whitespace-nowrap">
                      {t.unpaid}
                    </Badge>
                  ))}
              </div>
            </div>
          );
        })}
      </div>

      <Sheet open={adding} onClose={() => setAdding(false)} title={t.sheetTitle} description={t.sheetDesc}>
        <OvertimeForm
          employees={employees}
          currentEmployeeId={currentEmployeeId}
          canRequestForOthers={canRequestForOthers}
          selfRatePerHour={selfRatePerHour}
          onSubmit={(r) => {
            setList((prev) => [r, ...prev]);
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

/** Minutes since midnight for an "HH:MM" string (empty/invalid → null). */
function toMin(t: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function OvertimeForm({
  employees,
  currentEmployeeId = null,
  canRequestForOthers = true,
  selfRatePerHour = 0,
  onSubmit,
  onCancel,
}: {
  employees: Emp[];
  currentEmployeeId?: string | null;
  canRequestForOthers?: boolean;
  selfRatePerHour?: number;
  onSubmit: (r: OvertimeRequest) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const locale = useLocale();
  const t = STR[locale];
  const [saving, setSaving] = useState(false);
  const selfEmployee = currentEmployeeId ? employees.find((e) => e.id === currentEmployeeId) : undefined;
  const lockToSelf = !canRequestForOthers && !!selfEmployee;
  const [form, setForm] = useState({
    employeeId: lockToSelf ? selfEmployee!.id : employees[0]?.id ?? "",
    date: "",
    startTime: "",
    endTime: "",
    reason: "",
  });
  const [proof, setProof] = useState<{ dataUrl: string; name: string } | null>(null);

  // Live duration + estimated pay (own salary only).
  const startMin = toMin(form.startTime);
  const endMin = toMin(form.endTime);
  const hours = startMin != null && endMin != null && endMin > startMin ? (endMin - startMin) / 60 : 0;
  const showEstimate = form.employeeId === currentEmployeeId && selfRatePerHour > 0 && hours > 0;

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast.error(t.onlyImageOrPdf);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t.maxFileSize);
      return;
    }
    try {
      if (file.type.startsWith("image/")) {
        // Kompres di Web Worker (EXIF aman, UI tidak macet) sebelum upload.
        setProof({ dataUrl: await compressImageFile(file), name: file.name });
      } else {
        const reader = new FileReader();
        reader.onload = () => setProof({ dataUrl: String(reader.result), name: file.name });
        reader.onerror = () => toast.error(t.readFileFailed);
        reader.readAsDataURL(file);
      }
    } catch {
      toast.error(t.readFileFailed);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.employeeId) return toast.error(t.pickEmployeeFirst);
    if (!form.date) return toast.error(t.dateRequired);
    if (!form.startTime || !form.endTime) return toast.error(t.timesRequired);
    if (endMin == null || startMin == null || endMin <= startMin) {
      return toast.error(t.endAfterStart);
    }
    setSaving(true);
    try {
      const res = await fetch("/api/overtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: form.employeeId,
          date: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
          reason: form.reason,
          proofFile: proof?.dataUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.request) {
        const msg: Record<string, string> = {
          end_before_start: t.endAfterStart,
          invalid_time: t.invalidTime,
          invalid_proof_type: t.invalidProofType,
          proof_too_large: t.proofTooLarge,
          proof_upload_failed: t.proofUploadFailed,
        };
        toast.error(msg[data.error as string] ?? t.submitFailed);
        return;
      }
      onSubmit(data.request as OvertimeRequest);
    } catch {
      toast.error(t.connectionError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {lockToSelf ? (
        <Field label={t.employee}>
          <div className="flex items-center gap-3 rounded-xl border border-line bg-sand px-3 py-2.5">
            <Avatar name={selfEmployee!.name} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{selfEmployee!.name}</p>
              <p className="truncate text-xs text-faint">{TEAM_META[selfEmployee!.team].label}</p>
            </div>
          </div>
        </Field>
      ) : (
        <Field label={t.employee}>
          <Select value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} — {TEAM_META[e.team].label}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label={t.overtimeDate}>
        <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t.startTime}>
          <Input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} required />
        </Field>
        <Field label={t.endTime}>
          <Input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} required />
        </Field>
      </div>

      <div className="flex items-center justify-between rounded-xl bg-sand px-3 py-2.5 text-sm">
        <span className="text-muted">{t.duration}</span>
        <span className="font-semibold text-ink">{hours > 0 ? t.hours(hours) : "—"}</span>
      </div>
      {showEstimate && (
        <div className="flex items-center justify-between rounded-xl bg-[#e9f0d8] px-3 py-2.5 text-sm">
          <span className="text-forest-700">{t.estimatedPay}</span>
          <span className="font-semibold text-forest-700">{rupiah(Math.round(selfRatePerHour * hours))}</span>
        </div>
      )}

      <Field label={t.reasonLabel}>
        <Textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder={t.reasonPlaceholder} />
      </Field>

      <Field label={t.proofOptional}>
        {proof ? (
          <div className="flex items-center gap-3 rounded-xl border border-line bg-sand px-3 py-2.5">
            <Paperclip className="h-4 w-4 shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate text-sm text-ink">{proof.name}</span>
            <button type="button" onClick={() => setProof(null)} className="shrink-0 text-faint transition-colors hover:text-ink" aria-label={t.removeAttachment}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line bg-sand/40 px-3 py-2.5 text-sm text-muted transition-colors hover:bg-sand">
            <Paperclip className="h-4 w-4" />
            {t.attachImageOrPdf}
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={pickFile} />
          </label>
        )}
        <p className="mt-1 text-xs text-faint">{t.proofNote}</p>
      </Field>

      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>
          {t.cancel}
        </Button>
        <Button type="submit" className="flex-1" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {t.submit}
        </Button>
      </div>
    </form>
  );
}
