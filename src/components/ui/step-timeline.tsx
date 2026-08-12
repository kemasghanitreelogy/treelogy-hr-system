"use client";

import { Check, Clock3, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepState = "done" | "current" | "rejected" | "upcoming";

/**
 * Satu langkah pada garis waktu persetujuan (dipakai pembayaran & perjalanan
 * dinas). Garis penghubung digambar per langkah (di bawah ikonnya) supaya
 * warnanya mengikuti sejauh mana alur sudah berjalan — hijau untuk yang
 * terlewati, abu untuk yang belum. Status tidak mengandalkan warna saja:
 * ikon ✓ / jam / ✕ membedakannya bagi pengguna buta warna.
 */
export function Step({
  state,
  title,
  detail,
  last = false,
}: {
  state: StepState;
  title: string;
  detail: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1",
            state === "done" && "bg-forest-600 text-cream ring-forest-600",
            state === "current" && "bg-gold-soft text-[#8a6512] ring-gold",
            state === "rejected" && "bg-clay text-cream ring-clay",
            state === "upcoming" && "bg-cream text-faint ring-line",
          )}
        >
          {state === "done" && <Check className="h-4 w-4" />}
          {state === "current" && <Clock3 className="h-4 w-4" />}
          {state === "rejected" && <X className="h-4 w-4" />}
          {state === "upcoming" && <span className="h-1.5 w-1.5 rounded-full bg-line" />}
        </span>
        {!last && (
          <span className={cn("w-px flex-1 min-h-4", state === "done" ? "bg-forest-300" : "bg-line")} />
        )}
      </div>
      <div className={cn("min-w-0 pb-4", last && "pb-0")}>
        <p
          className={cn(
            "text-sm font-semibold leading-7",
            state === "upcoming" ? "text-faint" : state === "rejected" ? "text-clay" : "text-ink",
          )}
        >
          {title}
        </p>
        <div className="text-xs text-muted">{detail}</div>
      </div>
    </div>
  );
}
