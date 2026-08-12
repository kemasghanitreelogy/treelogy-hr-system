"use client";

import { useRef, useState } from "react";
import { FileText, Loader2, Paperclip, Send, X } from "lucide-react";
import type { PaymentDept, PaymentFlow, PaymentKind, PaymentRequest } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { apiErrorMessage } from "@/lib/api-error";
import { rupiah, witaToday } from "@/lib/utils";
import { prepareFileForBucket } from "@/lib/upload";
import {
  DEPARTMENTS, DEPT_LABEL, KINDS, KIND_LABEL, MAX_FILE_MB, MAX_INVOICE_FILES,
  composeInvoiceLine,
} from "@/lib/payment-request";
import { useLocale } from "@/components/layout/locale-context";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

const STR: Record<Locale, Record<string, string>> = {
  id: {
    intro:
      "Lengkapi semua isian dan lampirkan faktur yang sudah dipindai. Pengajuan ditutup setiap tanggal 28; lewat dari itu dibayarkan bulan berikutnya.",
    dept: "Departemen", deptPick: "— Pilih —",
    name: "Nama", email: "Email", auto: "Terisi otomatis dari akun Anda.",
    kind: "Jenis reimbursement", kindOther: "Sebutkan jenisnya", kindOtherPh: "cth. Biaya pelatihan",
    descGroup: "Tanggal invoice · Deskripsi · Nama vendor",
    invoiceDate: "Tanggal invoice",
    desc: "Deskripsi",
    descPh: "cth. INVOICE PEMBELIAN PAKAN TERNAK",
    vendor: "Nama vendor",
    vendorPh: "cth. CV PAKAN BALI",
    preview: "Ringkasan yang tercatat:",
    amount: "Total nominal", amountHint: "Angka saja. Contoh: 100.000 → tulis 100000",
    invoice: "Lampirkan faktur", invoiceHint: `Maksimal ${MAX_INVOICE_FILES} berkas, masing-masing ${MAX_FILE_MB} MB.`,
    approval: "Bukti persetujuan atasan",
    approvalHint: "Contoh: tangkapan layar persetujuan dari atasan (WA atau lainnya). Satu berkas.",
    due: "Jatuh tempo", optional: "opsional",
    more: "Detail tambahan", morePh: "Kalau ada",
    addFile: "Tambah berkas", uploading: "Mengunggah…",
    submit: "Kirim pengajuan", submitting: "Mengirim…", cancel: "Batal",
    connection: "Koneksi bermasalah. Coba lagi.",
    tooMany: `Maksimal ${MAX_INVOICE_FILES} faktur.`,
    requiredNote: "* wajib diisi",
    missing: "Belum lengkap:",
    mInvoice: "lampiran faktur",
    mApproval: "bukti persetujuan atasan",
    mDept: "departemen",
    mVendor: "nama vendor",
  },
  en: {
    intro:
      "Fill in all requirements and attach the scanned invoices. Submissions are cut off on the 28th each month; later ones are paid next month.",
    dept: "Department", deptPick: "— Choose —",
    name: "Name", email: "Email address", auto: "Filled automatically from your account.",
    kind: "Type of reimbursement", kindOther: "Specify the type", kindOtherPh: "e.g. Training fee",
    descGroup: "Invoice date · Description · Vendor name",
    invoiceDate: "Invoice date",
    desc: "Description",
    descPh: "e.g. INVOICE PEMBELIAN PAKAN TERNAK",
    vendor: "Vendor name",
    vendorPh: "e.g. CV PAKAN BALI",
    preview: "Recorded summary:",
    amount: "Total amount", amountHint: "Numbers only. Example: 100,000 → write 100000",
    invoice: "Attach your invoice", invoiceHint: `Up to ${MAX_INVOICE_FILES} files, ${MAX_FILE_MB} MB each.`,
    approval: "Proof of approval from your dept. head",
    approvalHint: "e.g. a screenshot of the written approval (WA or else). One file.",
    due: "Due date", optional: "optional",
    more: "More details", morePh: "If any",
    addFile: "Add file", uploading: "Uploading…",
    submit: "Submit request", submitting: "Submitting…", cancel: "Cancel",
    connection: "Connection problem. Try again.",
    tooMany: `At most ${MAX_INVOICE_FILES} invoices.`,
    requiredNote: "* required",
    missing: "Still missing:",
    mInvoice: "invoice attachment",
    mApproval: "dept. head approval",
    mDept: "department",
    mVendor: "vendor name",
  },
};

export function PaymentForm({
  flow,
  item,
  employeeId,
  name,
  email,
  onSaved,
  onCancel,
}: {
  /** Jalur yang dipilih sebelum form dibuka — menentukan alur setelah dikirim. */
  flow: PaymentFlow;
  /** Diisi saat pengaju MEMPERBAIKI pengajuan dinas yang ditolak. */
  item?: PaymentRequest;
  employeeId: string;
  name: string;
  email: string;
  onSaved: (saved: PaymentRequest, sheet: { ok: boolean; reason?: string }) => void;
  onCancel: () => void;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();
  const invoiceRef = useRef<HTMLInputElement>(null);
  const approvalRef = useRef<HTMLInputElement>(null);

  const [dept, setDept] = useState<PaymentDept | "">(item?.department ?? "");
  const [kind, setKind] = useState<PaymentKind>(item?.kind ?? "petty_cash");
  const [kindOther, setKindOther] = useState(item?.kindOther ?? "");
  // Tanggal invoice default HARI INI — kasus paling umum, jadi biasanya tak perlu diubah.
  const [invoiceDate, setInvoiceDate] = useState(() => item?.invoiceDate ?? witaToday());
  const [desc, setDesc] = useState(item?.description ?? "");
  const [vendor, setVendor] = useState(item?.vendorName ?? "");
  const [amount, setAmount] = useState(item ? String(item.totalAmount) : "");
  const [invoices, setInvoices] = useState<{ path: string; label: string }[]>(() =>
    (item?.invoicePaths ?? []).map((path, i) => ({ path, label: `Faktur ${i + 1}` })),
  );
  const [approval, setApproval] = useState<{ path: string; label: string } | null>(() =>
    item?.approvalPath ? { path: item.approvalPath, label: "Bukti persetujuan" } : null,
  );
  const [due, setDue] = useState(item?.dueDate ?? "");
  const [more, setMore] = useState(item?.moreDetails ?? "");
  const [busyUpload, setBusyUpload] = useState(false);
  const [saving, setSaving] = useState(false);

  async function pick(e: React.ChangeEvent<HTMLInputElement>, target: "invoice" | "approval") {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (files.length === 0) return;
    if (target === "invoice" && invoices.length + files.length > MAX_INVOICE_FILES) {
      toast.error(t.tooMany);
      return;
    }
    setBusyUpload(true);
    try {
      for (const file of files) {
        const prepared = await prepareFileForBucket("payment-files", employeeId, file);
        if (!prepared.path) continue; // mode demo tanpa Supabase
        const entry = { path: prepared.path, label: file.name };
        if (target === "invoice") setInvoices((cur) => [...cur, entry]);
        else setApproval(entry);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err instanceof Error ? err.message : null, locale));
    } finally {
      setBusyUpload(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/payment-requests", {
        // PUT = pengaju memperbaiki pengajuan dinas yang ditolak, lalu kirim ulang.
        method: item ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(item ? { id: item.id } : {}),
          flow,
          department: dept, kind, kindOther,
          invoiceDate, description: desc, vendorName: vendor,
          totalAmount: Number(amount) || 0,
          invoicePaths: invoices.map((i) => i.path),
          approvalPath: approval?.path,
          dueDate: due || null, moreDetails: more,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.request) {
        toast.error(apiErrorMessage(data?.error, locale, res.status));
        return;
      }
      onSaved(data.request as PaymentRequest, data.sheet ?? { ok: false });
    } catch {
      toast.error(t.connection);
    } finally {
      setSaving(false);
    }
  }

  const nominal = Number(amount) || 0;
  const kurang = [
    !dept && t.mDept,
    !vendor.trim() && t.mVendor,
    invoices.length === 0 && t.mInvoice,
    !approval && t.mApproval,
  ].filter((x): x is string => typeof x === "string");

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="rounded-xl border border-line bg-cream/60 px-3 py-2.5 text-xs leading-relaxed text-muted">
        {t.intro}
      </p>

      <Field label={t.dept} required>
        <Select value={dept} onChange={(e) => setDept(e.target.value as PaymentDept)} required>
          <option value="">{t.deptPick}</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>{DEPT_LABEL[locale][d]}</option>
          ))}
        </Select>
      </Field>

      {/* Nama & email tidak diketik — diambil dari akun yang sedang masuk. */}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.name} hint={t.auto}>
          <Input value={name} readOnly className="bg-cream/60 text-muted" />
        </Field>
        <Field label={t.email}>
          <Input value={email} readOnly className="bg-cream/60 text-muted" />
        </Field>
      </div>

      <Field label={t.kind} required>
        <Select value={kind} onChange={(e) => setKind(e.target.value as PaymentKind)}>
          {KINDS.map((k) => (
            <option key={k} value={k}>{KIND_LABEL[locale][k]}</option>
          ))}
        </Select>
      </Field>
      {kind === "other" && (
        <Field label={t.kindOther}>
          <Input value={kindOther} onChange={(e) => setKindOther(e.target.value)} placeholder={t.kindOtherPh} required />
        </Field>
      )}

      {/* Satu kelompok, tiga isian. Di sheet ketiganya disatukan kembali menjadi
          satu kolom — pratinjau di bawah memperlihatkan hasil persisnya. */}
      <fieldset className="space-y-3 rounded-2xl border border-line bg-cream/40 p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-faint">
          {t.descGroup}
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.invoiceDate} required>
            <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} required />
          </Field>
          <Field label={t.vendor} required>
            <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder={t.vendorPh} required />
          </Field>
        </div>
        <Field label={t.desc} required>
          <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder={t.descPh} required />
        </Field>
        <div className="rounded-xl bg-panel px-3 py-2">
          <p className="text-[11px] font-medium text-faint">{t.preview}</p>
          <p className="mt-0.5 break-words text-xs text-ink">
            {composeInvoiceLine({ invoiceDate, description: desc, vendorName: vendor }) || "—"}
          </p>
        </div>
      </fieldset>

      <Field label={t.amount} required hint={nominal > 0 ? rupiah(nominal) : t.amountHint}>
        <Input
          type="number" min={1} inputMode="numeric" placeholder="0"
          value={amount} onChange={(e) => setAmount(e.target.value)} required
        />
      </Field>

      {/* Lampiran faktur */}
      <Field label={t.invoice} required hint={t.invoiceHint}>
        <div className="space-y-2">
          <input ref={invoiceRef} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => pick(e, "invoice")} />
          <Button
            type="button" variant="outline" size="sm"
            onClick={() => invoiceRef.current?.click()}
            disabled={busyUpload || invoices.length >= MAX_INVOICE_FILES}
          >
            {busyUpload ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            {busyUpload ? t.uploading : t.addFile}
          </Button>
          {invoices.map((f, i) => (
            <div key={f.path} className="flex items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2">
              <FileText className="h-4 w-4 shrink-0 text-faint" />
              <span className="min-w-0 flex-1 truncate text-xs text-ink">{f.label}</span>
              <button
                type="button"
                onClick={() => setInvoices((cur) => cur.filter((_, j) => j !== i))}
                className="shrink-0 cursor-pointer rounded-lg p-1 text-faint hover:bg-clay-soft hover:text-[#8c3c1f]"
                aria-label="Hapus"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={`${t.due} (${t.optional})`}>
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label={`${t.more} (${t.optional})`}>
          <Input value={more} onChange={(e) => setMore(e.target.value)} placeholder={t.morePh} />
        </Field>
      </div>

      {/* Bukti persetujuan atasan */}
      <Field label={t.approval} required hint={t.approvalHint}>
        <div className="space-y-2">
          <input ref={approvalRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => pick(e, "approval")} />
          <Button type="button" variant="outline" size="sm" onClick={() => approvalRef.current?.click()} disabled={busyUpload}>
            {busyUpload ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            {approval ? t.addFile : t.addFile}
          </Button>
          {approval && (
            <div className="flex items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2">
              <FileText className="h-4 w-4 shrink-0 text-faint" />
              <span className="min-w-0 flex-1 truncate text-xs text-ink">{approval.label}</span>
              <button
                type="button" onClick={() => setApproval(null)}
                className="shrink-0 cursor-pointer rounded-lg p-1 text-faint hover:bg-clay-soft hover:text-[#8c3c1f]"
                aria-label="Hapus"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </Field>

      {/* Tombol kirim yang mati tanpa penjelasan membuat orang menebak-nebak.
          Sebutkan persis apa yang belum lengkap. */}
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
          type="submit" className="flex-1"
          disabled={saving || busyUpload || !dept || !vendor.trim() || invoices.length === 0 || !approval}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {saving ? t.submitting : t.submit}
        </Button>
      </div>
    </form>
  );
}
