"use client";

import { useEffect } from "react";
import { Button } from "./button";

type Tone = "primary" | "danger";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Ya, lanjutkan",
  cancelLabel = "Batal",
  tone = "primary",
  icon,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  icon?: React.ReactNode;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-bark/50 backdrop-blur-sm animate-overlay"
        onClick={busy ? undefined : onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-xs rounded-2xl bg-panel p-6 shadow-pop animate-dialog"
      >
        {icon && (
          <div
            className={
              tone === "danger"
                ? "mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-clay-soft text-clay"
                : "mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-forest-100 text-forest-700"
            }
          >
            {icon}
          </div>
        )}
        <h2 className="text-center font-display text-lg font-semibold text-ink">{title}</h2>
        {message && <p className="mt-1.5 text-center text-sm text-muted">{message}</p>}

        <div className="mt-6 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone} className="flex-1" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
