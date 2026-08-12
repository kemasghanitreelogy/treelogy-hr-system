"use client";

import { useRef, useState } from "react";
import { FilePlus2, Loader2, Trash2 } from "lucide-react";
import type { CompanyDocument } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { apiErrorMessage } from "@/lib/api-error";
import { prepareFileForBucket } from "@/lib/upload";
import { DOC_CATEGORIES, DOC_CATEGORY_LABEL, fileExt } from "@/lib/documents";
import { useLocale } from "@/components/layout/locale-context";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { DocFileBadge } from "./doc-file-badge";

const STR: Record<
  Locale,
  {
    name: string;
    namePh: string;
    category: string;
    docNumber: string;
    docNumberPh: string;
    issueDate: string;
    expiryDate: string;
    expiryHint: string;
    file: string;
    fileHint: string;
    fileAdd: string;
    fileReplace: string;
    fileRemove: string;
    fileUploaded: (ext: string) => string;
    uploading: string;
    note: string;
    notePh: string;
    cancel: string;
    save: string;
    saving: string;
    nameRequired: string;
    fileRequired: string;
    connection: string;
    codeHint: string;
  }
> = {
  id: {
    name: "Nama dokumen",
    namePh: "cth. Akta Pendirian Perusahaan",
    category: "Kategori",
    docNumber: "Nomor dokumen",
    docNumberPh: "cth. AHU-0031244.AH.01.01",
    issueDate: "Tanggal terbit",
    expiryDate: "Berlaku sampai",
    expiryHint: "Kosongkan bila berlaku selamanya.",
    file: "Berkas",
    fileHint: "PDF, gambar, atau berkas Office. Gambar otomatis dikompres ke WebP.",
    fileAdd: "Pilih berkas",
    fileReplace: "Ganti berkas",
    fileRemove: "Hapus berkas",
    fileUploaded: (ext) => `Berkas terunggah (.${ext})`,
    uploading: "Mengunggah…",
    note: "Catatan",
    notePh: "cth. Perpanjangan diurus lewat DPMPTSP",
    cancel: "Batal",
    save: "Simpan",
    saving: "Menyimpan…",
    nameRequired: "Nama dokumen wajib diisi.",
    fileRequired: "Berkas dokumen wajib diunggah.",
    connection: "Koneksi bermasalah. Coba lagi.",
    codeHint: "Kode dokumen dibuat otomatis oleh sistem setelah disimpan.",
  },
  en: {
    name: "Document name",
    namePh: "e.g. Deed of Incorporation",
    category: "Category",
    docNumber: "Document number",
    docNumberPh: "e.g. AHU-0031244.AH.01.01",
    issueDate: "Issue date",
    expiryDate: "Valid until",
    expiryHint: "Leave empty if it never expires.",
    file: "File",
    fileHint: "PDF, image, or Office file. Images are compressed to WebP automatically.",
    fileAdd: "Choose file",
    fileReplace: "Replace file",
    fileRemove: "Remove file",
    fileUploaded: (ext) => `File uploaded (.${ext})`,
    uploading: "Uploading…",
    note: "Note",
    notePh: "e.g. Renewal handled via DPMPTSP",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving…",
    nameRequired: "Document name is required.",
    fileRequired: "The document file is required.",
    connection: "Connection problem. Try again.",
    codeHint: "The document code is generated automatically once saved.",
  },
};

const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.pptx,image/*,application/pdf";

type FormState = {
  name: string;
  category: CompanyDocument["category"];
  docNumber: string;
  issueDate: string;
  expiryDate: string;
  filePath: string | null;
  note: string;
};

function initial(doc?: CompanyDocument): FormState {
  return {
    name: doc?.name ?? "",
    category: doc?.category ?? "legal",
    docNumber: doc?.docNumber ?? "",
    issueDate: doc?.issueDate ?? "",
    expiryDate: doc?.expiryDate ?? "",
    filePath: doc?.filePath ?? null,
    note: doc?.note ?? "",
  };
}

/**
 * Form tambah/ubah dokumen. Kode dokumen sengaja TIDAK ada di form — dibuat
 * database (sequence) seperti kode aset inventaris, supaya tidak mungkin
 * bentrok dan tidak ada penomoran manual.
 */
export function DocumentForm({
  doc,
  onSaved,
  onCancel,
}: {
  doc?: CompanyDocument;
  onSaved: (saved: CompanyDocument) => void;
  onCancel: () => void;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormState>(() => initial(doc));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const prepared = await prepareFileForBucket("company-documents", "files", file);
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
    if (!form.name.trim()) return toast.error(t.nameRequired);
    // Arsip tanpa berkas cuma daftar judul — berkas wajib saat membuat baru.
    if (!doc && !form.filePath) return toast.error(t.fileRequired);

    setSaving(true);
    try {
      const payload = {
        ...(doc ? { id: doc.id } : {}),
        name: form.name,
        category: form.category,
        docNumber: form.docNumber,
        issueDate: form.issueDate || null,
        expiryDate: form.expiryDate || null,
        filePath: form.filePath,
        note: form.note,
      };
      const res = await fetch("/api/documents", {
        method: doc ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.doc) {
        toast.error(apiErrorMessage(data?.error, locale, res.status));
        return;
      }
      onSaved(data.doc as CompanyDocument);
    } catch {
      toast.error(t.connection);
    } finally {
      setSaving(false);
    }
  }

  const ext = fileExt(form.filePath);

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t.name} required>
        <Input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder={t.namePh}
          required
          autoFocus
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t.category}>
          <Select
            value={form.category}
            onChange={(e) => set("category", e.target.value as CompanyDocument["category"])}
          >
            {DOC_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {DOC_CATEGORY_LABEL[locale][c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.docNumber}>
          <Input
            value={form.docNumber}
            onChange={(e) => set("docNumber", e.target.value)}
            placeholder={t.docNumberPh}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t.issueDate}>
          <Input type="date" value={form.issueDate} onChange={(e) => set("issueDate", e.target.value)} />
        </Field>
        <Field label={t.expiryDate} hint={t.expiryHint}>
          <Input type="date" value={form.expiryDate} onChange={(e) => set("expiryDate", e.target.value)} />
        </Field>
      </div>

      {/* Keadaan unggahan selalu terlihat: skeleton saat proses, chip berkas
          saat sudah ada — tanpa ini pengguna tidak tahu unggahannya berhasil. */}
      <Field label={t.file} required hint={t.fileHint}>
        <div className="flex items-center gap-3">
          <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={pickFile} />
          {uploading ? (
            <div className="flex h-9 w-9 shrink-0 animate-pulse items-center justify-center rounded-xl bg-sand">
              <Loader2 className="h-4 w-4 animate-spin text-muted" />
            </div>
          ) : form.filePath ? (
            <span className="flex min-w-0 items-center gap-2">
              <DocFileBadge ext={ext} />
              <span className="truncate text-xs font-medium text-muted">{t.fileUploaded(ext ?? "?")}</span>
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
        <Textarea value={form.note} onChange={(e) => set("note", e.target.value)} placeholder={t.notePh} rows={3} />
      </Field>

      {!doc && <p className="text-xs text-faint">{t.codeHint}</p>}

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
