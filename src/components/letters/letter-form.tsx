"use client";

import { useRef, useState } from "react";
import { FilePlus2, Loader2, Trash2 } from "lucide-react";
import type { OutgoingLetter } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { apiErrorMessage } from "@/lib/api-error";
import { prepareFileForBucket } from "@/lib/upload";
import { witaToday } from "@/lib/utils";
import {
  LETTER_CATEGORIES, LETTER_CATEGORY_LABEL, LETTER_DELIVERIES, LETTER_DELIVERY_LABEL,
  LETTER_STATUSES, LETTER_STATUS_LABEL, LETTER_URGENCIES, LETTER_URGENCY_LABEL, fileExtOf,
} from "@/lib/letters";
import { useLocale } from "@/components/layout/locale-context";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { DocFileBadge } from "@/components/documents/doc-file-badge";

const STR: Record<Locale, Record<string, string>> = {
  id: {
    secLetter: "I. Identitas Surat",
    letterNumber: "Nomor surat",
    letterNumberPh: "cth. 045/TRL-GA/VIII/2026",
    letterNumberHint: "Boleh dikosongkan selama masih draft.",
    letterDate: "Tanggal surat",
    category: "Jenis surat",
    urgency: "Sifat surat",
    secRecipient: "II. Tujuan",
    recipient: "Ditujukan kepada",
    recipientPh: "cth. PT Sumber Tani Makmur",
    address: "Alamat tujuan",
    addressPh: "cth. Jl. Raya Denpasar No. 88, Badung",
    subject: "Perihal",
    subjectPh: "cth. Penawaran kerja sama pasokan daun kelor",
    secSend: "III. Pengiriman",
    signer: "Penanda tangan",
    signerPh: "cth. Tantiyawati — General Affairs",
    delivery: "Metode pengiriman",
    deliveryNone: "— Belum ditentukan —",
    status: "Status",
    sentDate: "Tanggal kirim",
    sentDateHint: "Terisi otomatis saat status diubah ke Terkirim.",
    secArchive: "IV. Arsip",
    file: "Berkas surat",
    fileHint: "PDF atau hasil pindai surat yang ditandatangani. Gambar otomatis dikompres.",
    fileAdd: "Pilih berkas",
    fileReplace: "Ganti berkas",
    fileRemove: "Hapus",
    fileUploaded: "Berkas terunggah",
    uploading: "Mengunggah…",
    note: "Catatan",
    notePh: "cth. Berkas pendukung menyusul lewat email",
    requiredNote: "* wajib diisi",
    cancel: "Batal",
    save: "Simpan",
    saving: "Menyimpan…",
    recipientRequired: "Tujuan surat wajib diisi.",
    subjectRequired: "Perihal wajib diisi.",
    connection: "Koneksi bermasalah. Coba lagi.",
    codeHint: "Nomor agenda dibuat otomatis oleh sistem setelah disimpan.",
  },
  en: {
    secLetter: "I. Letter Identity",
    letterNumber: "Letter number",
    letterNumberPh: "e.g. 045/TRL-GA/VIII/2026",
    letterNumberHint: "May stay empty while it is still a draft.",
    letterDate: "Letter date",
    category: "Letter type",
    urgency: "Priority",
    secRecipient: "II. Recipient",
    recipient: "Addressed to",
    recipientPh: "e.g. PT Sumber Tani Makmur",
    address: "Recipient address",
    addressPh: "e.g. Jl. Raya Denpasar No. 88, Badung",
    subject: "Subject",
    subjectPh: "e.g. Moringa supply partnership quotation",
    secSend: "III. Delivery",
    signer: "Signed by",
    signerPh: "e.g. Tantiyawati — General Affairs",
    delivery: "Delivery method",
    deliveryNone: "— Not decided —",
    status: "Status",
    sentDate: "Sent date",
    sentDateHint: "Filled in automatically when the status becomes Sent.",
    secArchive: "IV. Archive",
    file: "Letter file",
    fileHint: "PDF or a scan of the signed letter. Images are compressed automatically.",
    fileAdd: "Choose file",
    fileReplace: "Replace file",
    fileRemove: "Remove",
    fileUploaded: "File uploaded",
    uploading: "Uploading…",
    note: "Note",
    notePh: "e.g. Supporting documents to follow by email",
    requiredNote: "* required",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving…",
    recipientRequired: "The recipient is required.",
    subjectRequired: "The subject is required.",
    connection: "Connection problem. Try again.",
    codeHint: "The agenda number is generated automatically once saved.",
  },
};

const ACCEPT = ".pdf,.doc,.docx,image/*,application/pdf";

/** Judul seksi — meniru penomoran form perjalanan dinas agar terasa satu keluarga. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-b border-line pb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">
      {children}
    </p>
  );
}

type FormState = {
  letterNumber: string;
  letterDate: string;
  recipient: string;
  recipientAddress: string;
  subject: string;
  category: OutgoingLetter["category"];
  urgency: OutgoingLetter["urgency"];
  signer: string;
  delivery: string;
  status: OutgoingLetter["status"];
  sentDate: string;
  filePath: string | null;
  note: string;
};

function initial(letter?: OutgoingLetter): FormState {
  return {
    letterNumber: letter?.letterNumber ?? "",
    // Tanggal surat default HARI INI — kasus paling umum, jarang perlu diubah.
    letterDate: letter?.letterDate ?? witaToday(),
    recipient: letter?.recipient ?? "",
    recipientAddress: letter?.recipientAddress ?? "",
    subject: letter?.subject ?? "",
    category: letter?.category ?? "pemberitahuan",
    urgency: letter?.urgency ?? "biasa",
    signer: letter?.signer ?? "",
    delivery: letter?.delivery ?? "",
    status: letter?.status ?? "draft",
    sentDate: letter?.sentDate ?? "",
    filePath: letter?.filePath ?? null,
    note: letter?.note ?? "",
  };
}

/**
 * Form catat/ubah surat keluar. Nomor agenda sengaja TIDAK ada di form —
 * dibuat database (sequence) supaya tidak mungkin bentrok; yang diketik staf
 * hanya nomor surat resmi sesuai tata naskah.
 */
export function LetterForm({
  letter,
  onSaved,
  onCancel,
}: {
  letter?: OutgoingLetter;
  onSaved: (saved: OutgoingLetter) => void;
  onCancel: () => void;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormState>(() => initial(letter));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  /** Ubah status → tanggal kirim ikut menyesuaikan, tak perlu diisi manual. */
  function setStatus(next: OutgoingLetter["status"]) {
    setForm((f) => ({
      ...f,
      status: next,
      sentDate: next === "terkirim" ? f.sentDate || witaToday() : "",
    }));
  }

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const prepared = await prepareFileForBucket("letter-files", "letters", file);
      // Mode demo (tanpa Supabase) tidak menghasilkan path — abaikan dengan tenang.
      if (prepared.path) set("filePath", prepared.path);
    } catch (err) {
      toast.error(apiErrorMessage(err instanceof Error ? err.message : null, locale));
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.recipient.trim()) return toast.error(t.recipientRequired);
    if (!form.subject.trim()) return toast.error(t.subjectRequired);

    setSaving(true);
    try {
      const payload = {
        ...(letter ? { id: letter.id } : {}),
        letterNumber: form.letterNumber,
        letterDate: form.letterDate,
        recipient: form.recipient,
        recipientAddress: form.recipientAddress,
        subject: form.subject,
        category: form.category,
        urgency: form.urgency,
        signer: form.signer,
        delivery: form.delivery || null,
        status: form.status,
        sentDate: form.sentDate || null,
        filePath: form.filePath,
        note: form.note,
      };
      const res = await fetch("/api/letters", {
        method: letter ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.letter) {
        toast.error(apiErrorMessage(data?.error, locale, res.status));
        return;
      }
      onSaved(data.letter as OutgoingLetter);
    } catch {
      toast.error(t.connection);
    } finally {
      setSaving(false);
    }
  }

  const ext = fileExtOf(form.filePath);

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* I. Identitas surat */}
      <div className="space-y-3">
        <SectionTitle>{t.secLetter}</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.letterNumber} hint={t.letterNumberHint}>
            <Input
              value={form.letterNumber}
              onChange={(e) => set("letterNumber", e.target.value)}
              placeholder={t.letterNumberPh}
            />
          </Field>
          <Field label={t.letterDate} required>
            <Input
              type="date"
              value={form.letterDate}
              onChange={(e) => set("letterDate", e.target.value)}
              required
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.category} required>
            <Select
              value={form.category}
              onChange={(e) => set("category", e.target.value as OutgoingLetter["category"])}
            >
              {LETTER_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {LETTER_CATEGORY_LABEL[locale][c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.urgency}>
            <Select
              value={form.urgency}
              onChange={(e) => set("urgency", e.target.value as OutgoingLetter["urgency"])}
            >
              {LETTER_URGENCIES.map((u) => (
                <option key={u} value={u}>
                  {LETTER_URGENCY_LABEL[locale][u]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      {/* II. Tujuan */}
      <div className="space-y-3">
        <SectionTitle>{t.secRecipient}</SectionTitle>
        <Field label={t.recipient} required>
          <Input
            value={form.recipient}
            onChange={(e) => set("recipient", e.target.value)}
            placeholder={t.recipientPh}
            required
            autoFocus
          />
        </Field>
        <Field label={t.address}>
          <Textarea
            value={form.recipientAddress}
            onChange={(e) => set("recipientAddress", e.target.value)}
            placeholder={t.addressPh}
            rows={2}
          />
        </Field>
        <Field label={t.subject} required>
          <Textarea
            value={form.subject}
            onChange={(e) => set("subject", e.target.value)}
            placeholder={t.subjectPh}
            rows={2}
            required
          />
        </Field>
      </div>

      {/* III. Pengiriman */}
      <div className="space-y-3">
        <SectionTitle>{t.secSend}</SectionTitle>
        <Field label={t.signer}>
          <Input
            value={form.signer}
            onChange={(e) => set("signer", e.target.value)}
            placeholder={t.signerPh}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.delivery}>
            <Select value={form.delivery} onChange={(e) => set("delivery", e.target.value)}>
              <option value="">{t.deliveryNone}</option>
              {LETTER_DELIVERIES.map((d) => (
                <option key={d} value={d}>
                  {LETTER_DELIVERY_LABEL[locale][d]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.status}>
            <Select
              value={form.status}
              onChange={(e) => setStatus(e.target.value as OutgoingLetter["status"])}
            >
              {LETTER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {LETTER_STATUS_LABEL[locale][s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {/* Tanggal kirim hanya relevan saat suratnya memang sudah dikirim. */}
        {form.status === "terkirim" && (
          <Field label={t.sentDate} hint={t.sentDateHint}>
            <Input
              type="date"
              value={form.sentDate}
              onChange={(e) => set("sentDate", e.target.value)}
            />
          </Field>
        )}
      </div>

      {/* IV. Arsip */}
      <div className="space-y-3">
        <SectionTitle>{t.secArchive}</SectionTitle>
        <Field label={t.file} hint={t.fileHint}>
          <div className="flex items-center gap-3">
            <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={pickFile} />
            {uploading ? (
              <div className="flex h-9 w-9 shrink-0 animate-pulse items-center justify-center rounded-xl bg-sand">
                <Loader2 className="h-4 w-4 animate-spin text-muted" />
              </div>
            ) : form.filePath ? (
              <span className="flex min-w-0 items-center gap-2">
                <DocFileBadge ext={ext} />
                <span className="truncate text-xs font-medium text-muted">{t.fileUploaded}</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label={t.fileAdd}
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-dashed border-line bg-cream/50 text-faint transition-colors hover:border-forest-300 hover:text-forest-600"
              >
                <FilePlus2 className="h-4 w-4" />
              </button>
            )}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
                {uploading ? t.uploading : form.filePath ? t.fileReplace : t.fileAdd}
              </Button>
              {form.filePath && !uploading && (
                <button
                  type="button"
                  onClick={() => set("filePath", null)}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-clay-soft hover:text-[#8c3c1f]"
                >
                  <Trash2 className="h-3.5 w-3.5" /> {t.fileRemove}
                </button>
              )}
            </div>
          </div>
        </Field>
        <Field label={t.note}>
          <Textarea
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            placeholder={t.notePh}
            rows={2}
          />
        </Field>
      </div>

      {!letter && <p className="text-xs text-faint">{t.codeHint}</p>}
      <p className="text-[11px] text-faint">{t.requiredNote}</p>

      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>
          {t.cancel}
        </Button>
        <Button type="submit" className="flex-1" disabled={saving || uploading}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? t.saving : t.save}
        </Button>
      </div>
    </form>
  );
}
