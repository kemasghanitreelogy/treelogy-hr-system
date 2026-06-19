"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { Button } from "./button";
import { Textarea } from "./field";
import { useLocale } from "@/components/layout/locale-context";
import type { Locale } from "@/lib/i18n";

const STR: Record<Locale, { title: string; desc: string; label: string; placeholder: string; hint: string; cancel: string; confirm: string }> = {
  id: {
    title: "Tolak pengajuan",
    desc: "Wajib beri alasan agar pengaju tahu kenapa ditolak.",
    label: "Alasan penolakan",
    placeholder: "cth. Tanggal bentrok dengan jadwal produksi…",
    hint: "Alasan ini akan dilihat oleh pengaju beserta nama Anda.",
    cancel: "Batal",
    confirm: "Tolak",
  },
  en: {
    title: "Reject request",
    desc: "A reason is required so the requester knows why it was rejected.",
    label: "Rejection reason",
    placeholder: "e.g. Dates clash with the production schedule…",
    hint: "The requester will see this reason together with your name.",
    cancel: "Cancel",
    confirm: "Reject",
  },
};

/**
 * Modal yang memaksa pemberi keputusan menulis alasan saat MENOLAK sebuah
 * pengajuan. Tombol "Tolak" nonaktif sampai alasan terisi. Rapi di mobile
 * (portal ke body, kartu terpusat, textarea besar yang mudah disentuh).
 */
export function RejectDialog({
  open,
  title,
  description,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  /** Override the default "Tolak pengajuan" heading (e.g. include who/what). */
  title?: string;
  description?: string;
  busy?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const t = STR[useLocale()];
  const [mounted, setMounted] = useState(false);
  const [reason, setReason] = useState("");
  useEffect(() => setMounted(true), []);

  // Reset the text each time the dialog opens.
  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, busy, onCancel]);

  if (!open || !mounted) return null;

  const trimmed = reason.trim();

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-bark/50 backdrop-blur-sm animate-overlay" onClick={busy ? undefined : onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md rounded-t-2xl bg-panel p-5 shadow-pop animate-sheet sm:rounded-2xl sm:p-6 sm:animate-dialog"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-ink">{title ?? t.title}</h2>
            <p className="mt-0.5 text-sm text-muted">{description ?? t.desc}</p>
          </div>
          <button
            onClick={busy ? undefined : onCancel}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sand"
            aria-label={t.cancel}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mb-1.5 block text-sm font-medium text-ink">{t.label}</label>
        <Textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t.placeholder}
          rows={3}
          disabled={busy}
        />
        <p className="mt-1.5 text-xs text-faint">{t.hint}</p>

        <div className="mt-5 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>
            {t.cancel}
          </Button>
          <Button variant="danger" className="flex-1" onClick={() => onConfirm(trimmed)} disabled={busy || !trimmed}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} {t.confirm}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
