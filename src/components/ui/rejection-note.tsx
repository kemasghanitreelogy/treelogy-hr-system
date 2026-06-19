"use client";

import { Ban } from "lucide-react";
import { useLocale } from "@/components/layout/locale-context";
import type { Locale } from "@/lib/i18n";

const STR: Record<Locale, { title: string; by: (n: string) => string }> = {
  id: { title: "Alasan penolakan", by: (n) => `Ditolak oleh ${n}` },
  en: { title: "Rejection reason", by: (n) => `Rejected by ${n}` },
};

/**
 * Callout yang menampilkan alasan penolakan beserta siapa yang menolak —
 * supaya pengaju paham kenapa pengajuannya ditolak dan dari siapa.
 * Tampil hanya saat ada alasan. Rapi & menonjol di mobile.
 */
export function RejectionNote({ reason, by }: { reason?: string | null; by?: string | null }) {
  const t = STR[useLocale()];
  if (!reason?.trim()) return null;
  return (
    <div className="rounded-2xl border border-clay/30 bg-clay-soft/60 p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-clay/15 text-clay">
          <Ban className="h-4 w-4" />
        </span>
        <p className="text-sm font-semibold text-[#8c3c1f]">{t.title}</p>
      </div>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink">{reason}</p>
      {by?.trim() && <p className="mt-2 text-xs font-medium text-[#8c3c1f]">{t.by(by)}</p>}
    </div>
  );
}
