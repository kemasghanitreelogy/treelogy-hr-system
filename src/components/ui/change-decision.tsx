"use client";

import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "./button";
import { useLocale } from "@/components/layout/locale-context";
import type { Locale } from "@/lib/i18n";
import type { RequestStatus } from "@/lib/types";

const STR: Record<Locale, { change: string; setApproved: string; setRejected: string; setPending: string; cancel: string }> = {
  id: {
    change: "Ubah keputusan",
    setApproved: "Jadikan Disetujui",
    setRejected: "Jadikan Ditolak",
    setPending: "Kembalikan ke Menunggu",
    cancel: "Batal",
  },
  en: {
    change: "Change decision",
    setApproved: "Set Approved",
    setRejected: "Set Rejected",
    setPending: "Back to Pending",
    cancel: "Cancel",
  },
};

/**
 * Ubah keputusan yang SUDAH dibuat (preventif salah pencet). Butuh dua langkah:
 * klik "Ubah keputusan" dulu, baru pilihan muncul — supaya tidak terganti
 * secara tak sengaja.
 */
export function ChangeDecision({
  status,
  deciding,
  onDecide,
}: {
  status: RequestStatus;
  deciding: boolean;
  onDecide: (status: RequestStatus) => void;
}) {
  const t = STR[useLocale()];
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="border-t border-line pt-4">
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          <Pencil className="h-4 w-4" /> {t.change}
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2 border-t border-line pt-4">
      {status !== "approved" && (
        <Button size="sm" disabled={deciding} onClick={() => onDecide("approved")}>
          <Check className="h-4 w-4" /> {t.setApproved}
        </Button>
      )}
      {status !== "rejected" && (
        <Button size="sm" variant="outline" disabled={deciding} onClick={() => onDecide("rejected")}>
          <X className="h-4 w-4" /> {t.setRejected}
        </Button>
      )}
      <Button size="sm" variant="outline" disabled={deciding} onClick={() => onDecide("pending")}>
        {t.setPending}
      </Button>
      <Button size="sm" variant="ghost" disabled={deciding} onClick={() => setOpen(false)}>
        {t.cancel}
      </Button>
    </div>
  );
}
