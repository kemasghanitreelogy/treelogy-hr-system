"use client";

import { CheckCircle2, Download, ExternalLink, FileX2, Pencil, Send, Trash2 } from "lucide-react";
import type { OutgoingLetter } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";
import {
  LETTER_CATEGORY_LABEL, LETTER_DELIVERY_LABEL, LETTER_STATUS_LABEL, LETTER_STATUS_TONE,
  LETTER_URGENCY_LABEL, LETTER_URGENCY_TONE, fileExtOf,
} from "@/lib/letters";
import { useLocale } from "@/components/layout/locale-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocFileBadge } from "@/components/documents/doc-file-badge";

const STR: Record<Locale, Record<string, string>> = {
  id: {
    agenda: "Nomor agenda",
    letterNumber: "Nomor surat",
    letterDate: "Tanggal surat",
    recipient: "Ditujukan kepada",
    address: "Alamat",
    category: "Jenis surat",
    urgency: "Sifat surat",
    signer: "Penanda tangan",
    delivery: "Metode pengiriman",
    sentDate: "Tanggal kirim",
    note: "Catatan",
    updated: "Diperbarui",
    none: "—",
    open: "Buka",
    download: "Unduh",
    noFile: "Belum ada berkas — tambahkan lewat Ubah.",
    edit: "Ubah",
    delete: "Hapus",
    markSent: "Tandai terkirim",
    createdTitle: "Tersimpan di agenda",
    createdHint: "Surat sudah masuk agenda dan bisa dicari kapan pun.",
  },
  en: {
    agenda: "Agenda number",
    letterNumber: "Letter number",
    letterDate: "Letter date",
    recipient: "Addressed to",
    address: "Address",
    category: "Letter type",
    urgency: "Priority",
    signer: "Signed by",
    delivery: "Delivery method",
    sentDate: "Sent date",
    note: "Note",
    updated: "Updated",
    none: "—",
    open: "Open",
    download: "Download",
    noFile: "No file yet — add one via Edit.",
    edit: "Edit",
    delete: "Delete",
    markSent: "Mark as sent",
    createdTitle: "Saved to the agenda",
    createdHint: "The letter is registered and searchable at any time.",
  },
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2.5">
      <span className="shrink-0 text-xs font-medium text-faint">{label}</span>
      {/* break-words: alamat / perihal panjang tanpa spasi tidak boleh
          melebarkan panel dan memicu scroll horizontal di sheet. */}
      <span className="min-w-0 break-words text-right text-sm text-ink">{children}</span>
    </div>
  );
}

export function LetterDetail({
  letter: l,
  canManage,
  justCreated = false,
  busy = false,
  onEdit,
  onDelete,
  onMarkSent,
}: {
  letter: OutgoingLetter;
  canManage: boolean;
  /** Baru saja dicatat → sorot nomor agenda yang otomatis dibuat sistem. */
  justCreated?: boolean;
  busy?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMarkSent: () => void;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const ext = fileExtOf(l.filePath);
  const fileUrl = l.filePath ? `/api/letters/file?path=${encodeURIComponent(l.filePath)}` : null;
  const downloadName = ext ? `${l.code} ${l.subject}.${ext}` : `${l.code} ${l.subject}`;

  return (
    <div className="animate-flip-in space-y-4">
      {justCreated && (
        <div className="animate-pop-in flex items-start gap-2.5 rounded-2xl border border-forest-200 bg-forest-50 px-3.5 py-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-forest-600" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-forest-700">
              {t.createdTitle} — {l.code}
            </p>
            <p className="mt-0.5 text-xs text-forest-700/80">{t.createdHint}</p>
          </div>
        </div>
      )}

      <div>
        {/* Perihal adalah judul sesungguhnya sebuah surat — itu yang dicari orang. */}
        <h3 className="font-display text-lg font-semibold leading-tight text-ink">{l.subject}</h3>
        <p className="mt-0.5 text-sm text-muted">{l.recipient}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge tone={LETTER_STATUS_TONE[l.status]} dot>
            {LETTER_STATUS_LABEL[locale][l.status]}
          </Badge>
          {l.urgency !== "biasa" && (
            <Badge tone={LETTER_URGENCY_TONE[l.urgency]}>{LETTER_URGENCY_LABEL[locale][l.urgency]}</Badge>
          )}
          <Badge tone="neutral">{LETTER_CATEGORY_LABEL[locale][l.category]}</Badge>
        </div>
      </div>

      {/* Panel berkas — aksi utama halaman ini: buka atau unduh arsip suratnya. */}
      {l.filePath && fileUrl ? (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-panel px-3.5 py-3">
          <DocFileBadge ext={ext} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">{l.code}</span>
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
        <Row label={t.agenda}>
          <span className="font-mono text-xs font-semibold">{l.code}</span>
        </Row>
        <Row label={t.letterNumber}>
          {l.letterNumber ? <span className="font-mono text-xs">{l.letterNumber}</span> : t.none}
        </Row>
        <Row label={t.letterDate}>{formatDate(l.letterDate, "long", locale)}</Row>
        <Row label={t.recipient}>{l.recipient}</Row>
        {l.recipientAddress && <Row label={t.address}>{l.recipientAddress}</Row>}
        <Row label={t.category}>{LETTER_CATEGORY_LABEL[locale][l.category]}</Row>
        <Row label={t.urgency}>{LETTER_URGENCY_LABEL[locale][l.urgency]}</Row>
        {l.signer && <Row label={t.signer}>{l.signer}</Row>}
        {l.delivery && <Row label={t.delivery}>{LETTER_DELIVERY_LABEL[locale][l.delivery]}</Row>}
        {l.sentDate && <Row label={t.sentDate}>{formatDate(l.sentDate, "long", locale)}</Row>}
        {l.note && <Row label={t.note}>{l.note}</Row>}
        {l.updatedAt && <Row label={t.updated}>{formatDate(l.updatedAt, "long", locale)}</Row>}
      </div>

      {canManage && (
        <div className="space-y-2">
          {/* Jalur cepat status paling sering dipakai: draft → terkirim, tanpa
              harus membuka form dan mencari selectnya. */}
          {l.status === "draft" && (
            <Button className="w-full" onClick={onMarkSent} disabled={busy}>
              <Send className="h-4 w-4" /> {t.markSent}
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onEdit}>
              <Pencil className="h-4 w-4" /> {t.edit}
            </Button>
            <Button variant="danger" className="flex-1" onClick={onDelete}>
              <Trash2 className="h-4 w-4" /> {t.delete}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
