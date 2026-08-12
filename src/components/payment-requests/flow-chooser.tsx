"use client";

import { ArrowRight, Plane, Zap } from "lucide-react";
import type { PaymentFlow } from "@/lib/types";
import { FLOW_HINT, FLOW_LABEL, PAYMENT_FLOWS } from "@/lib/payment-request";
import { useLocale } from "@/components/layout/locale-context";
import type { Locale } from "@/lib/i18n";

const STR: Record<Locale, { intro: string; step: (n: string) => string }> = {
  id: {
    intro: "Pilih dulu jenis pengajuannya. Isian formulirnya sama; yang berbeda hanya jalur persetujuannya.",
    step: (n) => n,
  },
  en: {
    intro: "Pick the request type first. The form fields are identical; only the approval path differs.",
    step: (n) => n,
  },
};

const ICON: Record<PaymentFlow, typeof Zap> = { biasa: Zap, dinas: Plane };

/**
 * Persimpangan sebelum formulir: reimburse biasa (langsung ke sheet) atau
 * reimburse dinas (persetujuan dua tahap dulu).
 *
 * Ditampilkan sebagai dua kartu besar, bukan dropdown — pilihan ini menentukan
 * ke mana pengajuan pergi, jadi konsekuensinya harus terbaca sebelum diklik,
 * bukan tersembunyi di balik satu baris teks.
 */
export function FlowChooser({ onPick }: { onPick: (flow: PaymentFlow) => void }) {
  const locale = useLocale();
  const t = STR[locale];

  return (
    <div className="space-y-3">
      <p className="rounded-xl border border-line bg-cream/60 px-3 py-2.5 text-xs leading-relaxed text-muted">
        {t.intro}
      </p>
      {PAYMENT_FLOWS.map((flow) => {
        const Icon = ICON[flow];
        return (
          <button
            key={flow}
            type="button"
            onClick={() => onPick(flow)}
            className="group flex w-full cursor-pointer items-start gap-3 rounded-2xl border border-line bg-panel p-4 text-left transition-colors hover:border-forest-300 hover:bg-cream/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-400"
          >
            <span
              className={
                flow === "dinas"
                  ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-soft text-[#2b5d7c]"
                  : "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-forest-50 text-forest-600"
              }
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">{t.step(FLOW_LABEL[locale][flow])}</span>
              <span className="mt-0.5 block text-xs leading-snug text-muted">{FLOW_HINT[locale][flow]}</span>
            </span>
            <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" />
          </button>
        );
      })}
    </div>
  );
}
