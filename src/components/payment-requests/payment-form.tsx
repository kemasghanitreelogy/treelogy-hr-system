"use client";

import { useRef, useState } from "react";
import { FileText, Loader2, Paperclip, Send, X } from "lucide-react";
import type { PaymentDept, PaymentKind, PaymentRequest } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { apiErrorMessage } from "@/lib/api-error";
import { rupiah } from "@/lib/utils";
import { prepareFileForBucket } from "@/lib/upload";
import {
  DEPARTMENTS, DEPT_LABEL, KINDS, KIND_LABEL, MAX_FILE_MB, MAX_INVOICE_FILES,
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
    desc: "Tanggal invoice - Deskripsi - Nama vendor",
    descHint: "Contoh: 28/05/2024 - INVOICE PEMBELIAN PAKAN TERNAK - CV PAKAN BALI",
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
  },
  en: {
    intro:
      "Fill in all requirements and attach the scanned invoices. Submissions are cut off on the 28th each month; later ones are paid next month.",
    dept: "Department", deptPick: "— Choose —",
    name: "Name", email: "Email address", auto: "Filled automatically from your account.",
    kind: "Type of reimbursement", kindOther: "Specify the type", kindOtherPh: "e.g. Training fee",
    desc: "Invoice date - Description - Vendor Name",
    descHint: "Example: 28/05/2024 - INVOICE PEMBELIAN PAKAN TERNAK - CV PAKAN BALI",
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
  },
};

export function PaymentForm({
  employeeId,
  name,
  email,
  onSaved,
  onCancel,
}: {
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

  const [dept, setDept] = useState<PaymentDept | "">("");
  const [kind, setKind] = useState<PaymentKind>("petty_cash");
  const [kindOther, setKindOther] = useState("");
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [invoices, setInvoices] = useState<{ path: string; label: string }[]>([]);
  const [approval, setApproval] = useState<{ path: string; label: string } | null>(null);
  const [due, setDue] = useState("");
  const [more, setMore] = useState("");
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department: dept, kind, kindOther,
          description: desc, totalAmount: Number(amount) || 0,
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

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="rounded-xl border border-line bg-cream/60 px-3 py-2.5 text-xs leading-relaxed text-muted">
        {t.intro}
      </p>

      <Field label={t.dept}>
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

      <Field label={t.kind}>
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

      <Field label={t.desc} hint={t.descHint}>
        <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} required />
      </Field>

      <Field label={t.amount} hint={nominal > 0 ? rupiah(nominal) : t.amountHint}>
        <Input
          type="number" min={1} inputMode="numeric" placeholder="0"
          value={amount} onChange={(e) => setAmount(e.target.value)} required
        />
      </Field>

      {/* Lampiran faktur */}
      <Field label={t.invoice} hint={t.invoiceHint}>
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
      <Field label={t.approval} hint={t.approvalHint}>
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

      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>
          {t.cancel}
        </Button>
        <Button
          type="submit" className="flex-1"
          disabled={saving || busyUpload || !dept || invoices.length === 0 || !approval}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {saving ? t.submitting : t.submit}
        </Button>
      </div>
    </form>
  );
}
