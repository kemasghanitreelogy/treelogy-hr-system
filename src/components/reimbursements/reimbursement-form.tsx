"use client";

import { useMemo, useRef, useState } from "react";
import { FileText, Loader2, Paperclip, Wallet, X } from "lucide-react";
import type { ReimbursementCategory, TravelReimbursement } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { apiErrorMessage } from "@/lib/api-error";
import { prepareFileForBucket } from "@/lib/upload";
import { rupiah, witaToday } from "@/lib/utils";
import {
  MAX_RECEIPTS, REIMB_CATEGORIES, REIMB_CATEGORY_LABEL, tripDuration,
} from "@/lib/reimbursement";
import { useLocale } from "@/components/layout/locale-context";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

export interface ReimbEmployeeOption {
  id: string;
  name: string;
  position: string;
}

const STR: Record<Locale, Record<string, string>> = {
  id: {
    secTrip: "I. Informasi Karyawan & Perjalanan",
    employee: "Karyawan",
    jobTitle: "Jabatan",
    jobTitleAuto: "Diambil otomatis dari data karyawan.",
    purpose: "Keperluan perjalanan",
    purposePh: "cth. Kunjungan klien & negosiasi kontrak",
    start: "Tanggal mulai",
    end: "Tanggal selesai",
    duration: "Lama perjalanan",
    durationAuto: "Dihitung dari kedua tanggal (inklusif).",
    secExpense: "II. Rincian Biaya",
    expenseDate: "Tanggal biaya",
    category: "Kategori biaya",
    description: "Deskripsi biaya",
    descriptionPh: "cth. Tiket pesawat Denpasar–Surabaya PP",
    receiptNumber: "Nomor kuitansi",
    receiptNumberPh: "cth. INV-88231 (opsional)",
    amount: "Nominal",
    amountHint: "Angka saja. Contoh: 100.000 → tulis 100000",
    receipts: "Unggah bukti / kuitansi",
    receiptsHint: `Maksimal ${MAX_RECEIPTS} berkas: PDF, dokumen, atau gambar.`,
    addFile: "Tambah berkas",
    uploading: "Mengunggah…",
    secDeclare: "III. Pernyataan Karyawan",
    confirm: "Konfirmasi karyawan",
    confirmText:
      "Saya menyatakan biaya yang diajukan pada formulir ini benar-benar dikeluarkan untuk keperluan dinas dan didukung kuitansi atau dokumen sah lainnya. Saya menyatakan informasi yang diberikan akurat dan lengkap.",
    requiredNote: "* wajib diisi",
    missing: "Belum lengkap:",
    mPurpose: "keperluan perjalanan",
    mDesc: "deskripsi biaya",
    mAmount: "nominal",
    mReceipt: "bukti/kuitansi",
    cancel: "Batal",
    submit: "Kirim klaim",
    submitting: "Mengirim…",
    connection: "Koneksi bermasalah. Coba lagi.",
    tooMany: `Maksimal ${MAX_RECEIPTS} berkas bukti.`,
    flowHint: "Klaim akan melewati persetujuan tahap 1 (Ops/GA), lalu persetujuan akhir Finance.",
  },
  en: {
    secTrip: "I. Employee & Business Trip Information",
    employee: "Employee",
    jobTitle: "Position",
    jobTitleAuto: "Taken automatically from the employee record.",
    purpose: "Business trip / purpose",
    purposePh: "e.g. Client visit & contract negotiation",
    start: "Start date",
    end: "End date",
    duration: "Trip duration",
    durationAuto: "Computed from both dates (inclusive).",
    secExpense: "II. Expense Details",
    expenseDate: "Expense date",
    category: "Expense category",
    description: "Expense description",
    descriptionPh: "e.g. Return flight Denpasar–Surabaya",
    receiptNumber: "Receipt number",
    receiptNumberPh: "e.g. INV-88231 (optional)",
    amount: "Amount",
    amountHint: "Numbers only. Example: 100,000 → write 100000",
    receipts: "Upload receipt",
    receiptsHint: `Up to ${MAX_RECEIPTS} files: PDF, document or image.`,
    addFile: "Add file",
    uploading: "Uploading…",
    secDeclare: "III. Employee Declaration",
    confirm: "Employee confirmation",
    confirmText:
      "I confirm that the expenses submitted in this form were incurred for legitimate business purposes and are supported by valid receipts or other required documentation. I confirm that the information provided is accurate and complete.",
    requiredNote: "* required",
    missing: "Still missing:",
    mPurpose: "trip purpose",
    mDesc: "expense description",
    mAmount: "amount",
    mReceipt: "receipt",
    cancel: "Cancel",
    submit: "Submit claim",
    submitting: "Submitting…",
    connection: "Connection problem. Try again.",
    tooMany: `At most ${MAX_RECEIPTS} receipt files.`,
    flowHint: "The claim goes through step-1 approval (Ops/GA), then the final Finance approval.",
  },
};

const ACCEPT = ".pdf,.doc,.docx,image/*,application/pdf";

/** Judul seksi — meniru penomoran form aslinya agar HR langsung mengenalinya. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-b border-line pb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">
      {children}
    </p>
  );
}

export function ReimbursementForm({
  item,
  employees,
  defaultEmployeeId,
  canPickEmployee,
  onSaved,
  onCancel,
}: {
  /** Diisi saat pengaju MEMPERBAIKI klaimnya (ditolak / masih menunggu). */
  item?: TravelReimbursement;
  employees: ReimbEmployeeOption[];
  defaultEmployeeId: string;
  /** HR boleh mengajukan atas nama karyawan lain; karyawan hanya dirinya. */
  canPickEmployee: boolean;
  onSaved: (saved: TravelReimbursement) => void;
  onCancel: () => void;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [employeeId, setEmployeeId] = useState(item?.employeeId ?? defaultEmployeeId);
  const [purpose, setPurpose] = useState(item?.purpose ?? "");
  const [startDate, setStartDate] = useState(item?.startDate ?? "");
  const [endDate, setEndDate] = useState(item?.endDate ?? "");
  // Tanggal biaya default HARI INI — kasus paling umum.
  const [expenseDate, setExpenseDate] = useState(() => item?.expenseDate ?? witaToday());
  const [category, setCategory] = useState<ReimbursementCategory>(item?.category ?? "transportation");
  const [description, setDescription] = useState(item?.description ?? "");
  const [receiptNumber, setReceiptNumber] = useState(item?.receiptNumber ?? "");
  const [amount, setAmount] = useState(item ? String(item.amount) : "");
  const [receipts, setReceipts] = useState<{ path: string; label: string }[]>(() =>
    (item?.receiptPaths ?? []).map((path, i) => ({ path, label: `Bukti ${i + 1}` })),
  );
  // Pernyataan wajib dicentang ulang tiap kirim — harus disadari kembali.
  const [confirmed, setConfirmed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const emp = employees.find((e) => e.id === employeeId);
  const duration = useMemo(() => tripDuration(startDate, endDate), [startDate, endDate]);
  const nominal = Number(amount) || 0;

  async function pickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (files.length === 0) return;
    if (receipts.length + files.length > MAX_RECEIPTS) {
      toast.error(t.tooMany);
      return;
    }
    setUploading(true);
    try {
      for (const file of files) {
        // Folder = karyawan yang DIKLAIM (bisa berbeda dari pengunggah saat HR
        // mengajukan atas nama orang lain) — server memvalidasi bentuk path ini.
        const prepared = await prepareFileForBucket("reimbursement-files", employeeId, file);
        if (!prepared.path) continue; // mode demo tanpa Supabase
        setReceipts((cur) => [...cur, { path: prepared.path!, label: file.name }]);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err instanceof Error ? err.message : null, locale));
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/reimbursements", {
        // PUT = pengaju memperbaiki & mengirim ulang (status kembali menunggu).
        method: item ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(item ? { id: item.id } : {}),
          employeeId,
          purpose,
          startDate,
          endDate,
          expenseDate,
          category,
          description,
          receiptNumber,
          amount: nominal,
          receiptPaths: receipts.map((r) => r.path),
          confirmed,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.request) {
        toast.error(apiErrorMessage(data?.error, locale, res.status));
        return;
      }
      onSaved(data.request as TravelReimbursement);
    } catch {
      toast.error(t.connection);
    } finally {
      setSaving(false);
    }
  }

  const kurang = [
    !purpose.trim() && t.mPurpose,
    !description.trim() && t.mDesc,
    nominal <= 0 && t.mAmount,
    receipts.length === 0 && t.mReceipt,
  ].filter((x): x is string => typeof x === "string");

  return (
    <form onSubmit={submit} className="space-y-5">
      <p className="rounded-xl border border-line bg-cream/60 px-3 py-2.5 text-xs leading-relaxed text-muted">
        {t.flowHint}
      </p>

      {/* I. Karyawan & perjalanan */}
      <div className="space-y-3">
        <SectionTitle>{t.secTrip}</SectionTitle>
        {canPickEmployee ? (
          <Field label={t.employee} required>
            <Select
              value={employeeId}
              onChange={(e) => {
                setEmployeeId(e.target.value);
                // Berkas diunggah ke folder karyawan terpilih — ganti orang
                // berarti bukti lama salah folder dan harus diunggah ulang.
                setReceipts([]);
              }}
              required
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label={t.employee} hint={t.jobTitleAuto}>
            <Input value={emp?.name ?? ""} readOnly className="bg-cream/60" />
          </Field>
        )}
        <Field label={t.jobTitle} hint={t.jobTitleAuto}>
          <Input value={emp?.position ?? "—"} readOnly className="bg-cream/60" />
        </Field>
        <Field label={t.purpose} required>
          <Textarea
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder={t.purposePh}
            rows={2}
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.start} required>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </Field>
          <Field label={t.end} required>
            <Input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </Field>
        </div>
        {duration > 0 && (
          <p className="text-xs text-faint">
            {t.duration}: <span className="font-medium text-ink">{duration} hari</span> · {t.durationAuto}
          </p>
        )}
      </div>

      {/* II. Rincian biaya */}
      <div className="space-y-3">
        <SectionTitle>{t.secExpense}</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.expenseDate} required>
            <Input
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              required
            />
          </Field>
          <Field label={t.category}>
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value as ReimbursementCategory)}
            >
              {REIMB_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {REIMB_CATEGORY_LABEL[locale][c]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t.description} required>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t.descriptionPh}
            rows={2}
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.receiptNumber}>
            <Input
              value={receiptNumber}
              onChange={(e) => setReceiptNumber(e.target.value)}
              placeholder={t.receiptNumberPh}
            />
          </Field>
          {/* Hint rupiah hidup: angka panjang tanpa pemisah ribuan mudah salah ketik. */}
          <Field label={t.amount} required hint={nominal > 0 ? rupiah(nominal) : t.amountHint}>
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </Field>
        </div>

        <Field label={t.receipts} required hint={t.receiptsHint}>
          <div className="space-y-2">
            <input ref={fileRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={pickFiles} />
            {receipts.length > 0 && (
              <ul className="space-y-1.5">
                {receipts.map((r) => (
                  <li
                    key={r.path}
                    className="flex items-center gap-2 rounded-xl border border-line bg-panel px-2.5 py-2"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-faint" />
                    <span className="min-w-0 flex-1 truncate text-xs text-ink">{r.label}</span>
                    <button
                      type="button"
                      onClick={() => setReceipts((cur) => cur.filter((x) => x.path !== r.path))}
                      aria-label="Hapus berkas"
                      className="cursor-pointer rounded-lg p-1 text-muted transition-colors hover:bg-clay-soft hover:text-[#8c3c1f]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || receipts.length >= MAX_RECEIPTS}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              {uploading ? t.uploading : t.addFile}
            </Button>
          </div>
        </Field>
      </div>

      {/* III. Pernyataan */}
      <div className="space-y-3">
        <SectionTitle>{t.secDeclare}</SectionTitle>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-panel p-3">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            required
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-forest-600"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink">{t.confirm}</span>
            <span className="mt-0.5 block text-xs leading-snug text-muted">{t.confirmText}</span>
          </span>
        </label>
      </div>

      {kurang.length > 0 && (
        <p className="rounded-xl border border-gold/40 bg-gold-soft/50 px-3 py-2 text-xs text-[#8a6512]">
          <span className="font-semibold">{t.missing}</span> {kurang.join(" · ")}
        </p>
      )}
      <p className="text-[11px] text-faint">{t.requiredNote}</p>

      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>
          {t.cancel}
        </Button>
        <Button
          type="submit"
          className="flex-1"
          disabled={saving || uploading || !confirmed || kurang.length > 0}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          {saving ? t.submitting : t.submit}
        </Button>
      </div>
    </form>
  );
}
