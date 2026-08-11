"use client";

import { CheckCircle2, Download, ExternalLink, FileX2, Pencil, Trash2 } from "lucide-react";
import type { CompanyDocument } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { formatDate, witaToday } from "@/lib/utils";
import {
  DOC_CATEGORY_LABEL,
  EXPIRY_LABEL,
  EXPIRY_TEXT,
  EXPIRY_TONE,
  expiryStatus,
  fileExt,
} from "@/lib/documents";
import { useLocale } from "@/components/layout/locale-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocFileBadge } from "./doc-file-badge";

const STR: Record<
  Locale,
  {
    category: string;
    docNumber: string;
    issueDate: string;
    expiryDate: string;
    forever: string;
    note: string;
    updated: string;
    open: string;
    download: string;
    noFile: string;
    edit: string;
    delete: string;
    createdTitle: (code: string) => string;
    createdHint: string;
  }
> = {
  id: {
    category: "Kategori",
    docNumber: "Nomor dokumen",
    issueDate: "Tanggal terbit",
    expiryDate: "Berlaku sampai",
    forever: "Selamanya",
    note: "Catatan",
    updated: "Diperbarui",
    open: "Buka",
    download: "Unduh",
    noFile: "Belum ada berkas — tambahkan lewat Ubah.",
    edit: "Ubah",
    delete: "Hapus",
    createdTitle: (code) => `Tersimpan — kode dokumen ${code}`,
    createdHint: "Dokumen sudah masuk arsip dan bisa dibuka siapa pun yang berhak.",
  },
  en: {
    category: "Category",
    docNumber: "Document number",
    issueDate: "Issue date",
    expiryDate: "Valid until",
    forever: "Forever",
    note: "Note",
    updated: "Updated",
    open: "Open",
    download: "Download",
    noFile: "No file yet — add one via Edit.",
    edit: "Edit",
    delete: "Delete",
    createdTitle: (code) => `Saved — document code ${code}`,
    createdHint: "The document is archived and available to anyone with access.",
  },
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2.5">
      <span className="shrink-0 text-xs font-medium text-faint">{label}</span>
      {/* break-words: nomor dokumen / catatan panjang tanpa spasi tidak boleh
          melebarkan panel dan memicu scroll horizontal di sheet. */}
      <span className="min-w-0 break-words text-right text-sm text-ink">{children}</span>
    </div>
  );
}

export function DocumentDetail({
  doc,
  canManage,
  justCreated = false,
  onEdit,
  onDelete,
}: {
  doc: CompanyDocument;
  canManage: boolean;
  /** Baru saja dibuat → sorot kode yang otomatis dibuat sistem. */
  justCreated?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const today = witaToday();
  const status = expiryStatus(doc, today);
  const ext = fileExt(doc.filePath);
  const fileUrl = doc.filePath ? `/api/documents/file?path=${encodeURIComponent(doc.filePath)}` : null;
  const downloadName = ext ? `${doc.code} ${doc.name}.${ext}` : `${doc.code} ${doc.name}`;

  return (
    <div className="animate-flip-in space-y-4">
      {justCreated && (
        <div className="animate-pop-in flex items-start gap-2.5 rounded-2xl border border-forest-200 bg-forest-50 px-3.5 py-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-forest-600" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-forest-700">{t.createdTitle(doc.code)}</p>
            <p className="mt-0.5 text-xs text-forest-700/80">{t.createdHint}</p>
          </div>
        </div>
      )}

      <div>
        <h3 className="font-display text-lg font-semibold leading-tight text-ink">{doc.name}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {doc.expiryDate && (
            <Badge tone={EXPIRY_TONE[status]} dot>
              {EXPIRY_LABEL[locale][status]}
            </Badge>
          )}
          <Badge tone="neutral">{DOC_CATEGORY_LABEL[locale][doc.category]}</Badge>
        </div>
      </div>

      {/* Panel berkas — aksi utama halaman ini: buka atau unduh dokumennya. */}
      {doc.filePath && fileUrl ? (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-panel px-3.5 py-3">
          <DocFileBadge ext={ext} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">{doc.code}</span>
            <span className="block text-xs uppercase text-faint">{ext ?? "?"}</span>
          </span>
          <a href={fileUrl} target="_blank" rel="noreferrer" className="shrink-0">
            <Button variant="outline" size="sm" type="button">
              <ExternalLink className="h-4 w-4" /> {t.open}
            </Button>
          </a>
          <a href={`${fileUrl}&dl=${encodeURIComponent(downloadName)}`} className="shrink-0">
            <Button variant="outline" size="sm" type="button">
              <Download className="h-4 w-4" /> {t.download}
            </Button>
          </a>
        </div>
      ) : (
        canManage && (
          <div className="flex h-20 items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-cream/40 text-xs text-faint">
            <FileX2 className="h-4 w-4" /> {t.noFile}
          </div>
        )
      )}

      <div className="overflow-hidden rounded-2xl border border-line bg-panel divide-y divide-line">
        <Row label={t.category}>{DOC_CATEGORY_LABEL[locale][doc.category]}</Row>
        {doc.docNumber && (
          <Row label={t.docNumber}>
            <span className="font-mono text-xs">{doc.docNumber}</span>
          </Row>
        )}
        {doc.issueDate && <Row label={t.issueDate}>{formatDate(doc.issueDate, "long", locale)}</Row>}
        <Row label={t.expiryDate}>
          {doc.expiryDate ? (
            <span className={EXPIRY_TEXT[status]}>{formatDate(doc.expiryDate, "long", locale)}</span>
          ) : (
            t.forever
          )}
        </Row>
        {doc.note && <Row label={t.note}>{doc.note}</Row>}
        {doc.updatedAt && <Row label={t.updated}>{formatDate(doc.updatedAt, "long", locale)}</Row>}
      </div>

      {canManage && (
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onEdit}>
            <Pencil className="h-4 w-4" /> {t.edit}
          </Button>
          <Button variant="danger" className="flex-1" onClick={onDelete}>
            <Trash2 className="h-4 w-4" /> {t.delete}
          </Button>
        </div>
      )}
    </div>
  );
}
