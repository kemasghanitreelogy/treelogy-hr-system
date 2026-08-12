"use client";

import { Ban, Pencil, Undo2 } from "lucide-react";
import { useLocale } from "@/components/layout/locale-context";
import type { Locale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

const STR: Record<
  Locale,
  { rejected: string; by: (n: string) => string; fix: string; resent: string; resentBody: string }
> = {
  id: {
    rejected: "Alasan penolakan",
    by: (n) => `Ditolak oleh ${n}`,
    fix: "Revisi & kirim ulang",
    resent: "Kiriman ulang setelah revisi",
    resentBody: "Sebelumnya ditolak dengan alasan:",
  },
  en: {
    rejected: "Rejection reason",
    by: (n) => `Rejected by ${n}`,
    fix: "Revise & resubmit",
    resent: "Resubmitted after revision",
    resentBody: "Previously rejected because:",
  },
};

/**
 * Penolakan bukan jalan buntu.
 *
 * Satu komponen untuk dua sisi cerita yang sama, dipakai semua modul
 * berpersetujuan (cuti, lembur, perjalanan dinas, reimbursement):
 *
 *  · PENGAJU melihat alasan penolakan + tombol "Revisi & kirim ulang" —
 *    jalan keluarnya ada tepat di sebelah masalahnya, bukan tersembunyi di
 *    menu lain.
 *  · PENYETUJU melihat konteks bahwa pengajuan ini kiriman ulang beserta
 *    alasan penolakan sebelumnya, jadi tahu apa yang seharusnya diperbaiki.
 */
export function RevisionBanner({
  rejectionReason,
  rejectedBy,
  revisionNote,
  canRevise = false,
  onRevise,
}: {
  /** Terisi saat status = rejected. */
  rejectionReason?: string | null;
  rejectedBy?: string | null;
  /** Terisi setelah pengaju mengirim ulang — alasan penolakan yang memicunya. */
  revisionNote?: string | null;
  /** Pemilik pengajuan & masih boleh direvisi → tampilkan tombolnya. */
  canRevise?: boolean;
  onRevise?: () => void;
}) {
  const t = STR[useLocale()];

  if (rejectionReason?.trim()) {
    return (
      <div className="rounded-2xl border border-clay/30 bg-clay-soft/60 p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-clay/15 text-clay">
            <Ban className="h-4 w-4" />
          </span>
          <p className="text-sm font-semibold text-[#8c3c1f]">{t.rejected}</p>
        </div>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink">{rejectionReason}</p>
        {rejectedBy?.trim() && (
          <p className="mt-2 text-xs font-medium text-[#8c3c1f]">{t.by(rejectedBy)}</p>
        )}
        {canRevise && onRevise && (
          <Button size="sm" className="mt-3" onClick={onRevise}>
            <Pencil className="h-4 w-4" /> {t.fix}
          </Button>
        )}
      </div>
    );
  }

  // Sudah dikirim ulang → tampilkan konteksnya untuk penyetuju.
  if (revisionNote?.trim()) {
    return (
      <div className="rounded-2xl border border-gold/40 bg-gold-soft/60 p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold/20 text-[#8a6512]">
            <Undo2 className="h-4 w-4" />
          </span>
          <p className="text-sm font-semibold text-[#8a6512]">{t.resent}</p>
        </div>
        <p className="mt-2 text-xs font-medium text-[#8a6512]">{t.resentBody}</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">{revisionNote}</p>
      </div>
    );
  }

  return null;
}
