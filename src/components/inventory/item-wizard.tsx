"use client";

import { useState } from "react";
import {
  Armchair,
  ArrowLeft,
  Beef,
  Building2,
  Factory,
  Laptop,
  LandPlot,
  Loader2,
  Package,
  PencilLine,
  PlugZap,
  Plus,
  Sprout,
  Tractor,
  Truck,
  type LucideIcon,
} from "lucide-react";
import type { InventoryCategory, InventoryCompany, InventoryItem } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { CATEGORIES, CATEGORY_LABEL, COMPANIES, COMPANY_LABEL, codePrefix } from "@/lib/inventory";
import { useLocale } from "@/components/layout/locale-context";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { QrPanel } from "./qr-panel";

const STR: Record<
  Locale,
  {
    steps: [string, string, string];
    companyTitle: string;
    companyHint: string;
    categoryTitle: string;
    categoryHint: string;
    back: string;
    generating: string;
    doneTitle: string;
    doneHint: string;
    complete: string;
    again: string;
    finish: string;
    connection: string;
  }
> = {
  id: {
    steps: ["Company", "Kategori", "QR"],
    companyTitle: "Aset milik company mana?",
    companyHint: "Menentukan awalan kode aset.",
    categoryTitle: "Pilih kategori aset",
    categoryHint: "Begitu dipilih, kode aset & QR langsung dibuat.",
    back: "Ganti company",
    generating: "Membuat kode…",
    doneTitle: "QR siap ditempel",
    doneHint: "Detail barang (nama, merk, lokasi, foto) bisa dilengkapi sekarang atau nanti.",
    complete: "Lengkapi detail",
    again: "Tambah lagi",
    finish: "Selesai",
    connection: "Koneksi bermasalah. Coba lagi.",
  },
  en: {
    steps: ["Company", "Category", "QR"],
    companyTitle: "Which company owns this asset?",
    companyHint: "Sets the asset code prefix.",
    categoryTitle: "Choose the asset category",
    categoryHint: "The asset code & QR are generated the moment you pick one.",
    back: "Change company",
    generating: "Generating code…",
    doneTitle: "QR ready to stick on",
    doneHint: "Item details (name, brand, location, photo) can be filled in now or later.",
    complete: "Complete details",
    again: "Add another",
    finish: "Done",
    connection: "Connection problem. Try again.",
  },
};

const COMPANY_ICON: Record<InventoryCompany, LucideIcon> = { PMA: Sprout, PMDN: Factory };

const CATEGORY_ICON: Record<InventoryCategory, LucideIcon> = {
  LND: LandPlot,
  VEH: Truck,
  FMT: Tractor,
  MCH: Factory,
  OFC: Laptop,
  FUR: Armchair,
  ELC: PlugZap,
  LVS: Beef,
  BIO: Sprout,
  OTH: Package,
};

type Step = 0 | 1 | 2;

/**
 * Tambah barang dalam tiga ketukan: company → kategori → QR.
 *
 * Tidak ada form detail di depan — dua pilihan itu sudah cukup bagi database
 * untuk menerbitkan kode aset (<COMPANY>-<KATEGORI>-<nnnn>), jadi QR bisa
 * langsung dicetak dan ditempel. Detail menyusul lewat "Lengkapi detail".
 */
export function ItemWizard({
  onCreated,
  onComplete,
  onClose,
}: {
  /** Barang tersimpan — masukkan ke daftar (wizard tetap terbuka di langkah QR). */
  onCreated: (item: InventoryItem) => void;
  /** "Lengkapi detail" → buka form ubah untuk barang ini. */
  onComplete: (item: InventoryItem) => void;
  onClose: () => void;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();

  const [step, setStep] = useState<Step>(0);
  /** Arah transisi — maju masuk dari kanan, mundur dari kiri. */
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [company, setCompany] = useState<InventoryCompany | null>(null);
  const [pending, setPending] = useState<InventoryCategory | null>(null);
  const [created, setCreated] = useState<InventoryItem | null>(null);

  function go(next: Step) {
    setDir(next > step ? "fwd" : "back");
    setStep(next);
  }

  function pickCompany(c: InventoryCompany) {
    setCompany(c);
    go(1);
  }

  async function pickCategory(category: InventoryCategory) {
    if (!company || pending) return;
    setPending(category);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company, category, name: CATEGORY_LABEL[locale][category] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.item) {
        toast.error(apiErrorMessage(data?.error, locale, res.status));
        return;
      }
      const item = data.item as InventoryItem;
      setCreated(item);
      onCreated(item);
      go(2);
    } catch {
      toast.error(t.connection);
    } finally {
      setPending(null);
    }
  }

  /** Tambah lagi: company biasanya sama untuk satu sesi input — langsung ke kategori. */
  function again() {
    setCreated(null);
    setDir("back");
    setStep(1);
  }

  return (
    <div className="space-y-5">
      <Stepper step={step} labels={t.steps} />

      {/* key = step → setiap pergantian langkah memutar ulang animasi masuk */}
      <div key={step} className={dir === "fwd" ? "wz-in-fwd" : "wz-in-back"}>
        {step === 0 && (
          <section aria-labelledby="wz-company">
            <h3 id="wz-company" className="font-display text-lg font-semibold text-ink">
              {t.companyTitle}
            </h3>
            <p className="mt-0.5 text-sm text-muted">{t.companyHint}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {COMPANIES.map((c, i) => {
                const Icon = COMPANY_ICON[c];
                const active = company === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => pickCompany(c)}
                    aria-pressed={active}
                    style={{ ["--i" as string]: i }}
                    className={cn(
                      "wz-card group flex cursor-pointer items-center gap-4 rounded-2xl border bg-panel p-4 text-left transition-colors duration-200 hover:border-forest-300 hover:bg-forest-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-400",
                      active ? "border-forest-400 bg-forest-50" : "border-line",
                    )}
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-forest-600/10 text-forest-700 transition-colors duration-200 group-hover:bg-forest-600 group-hover:text-cream">
                      <Icon className="h-6 w-6" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-display text-xl font-bold tracking-tight text-ink">{c}</span>
                      <span className="block text-sm text-muted">{COMPANY_LABEL[locale][c]}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {step === 1 && company && (
          <section aria-labelledby="wz-category">
            <button
              type="button"
              onClick={() => go(0)}
              disabled={pending !== null}
              className="mb-3 inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-panel py-1 pl-2 pr-3 text-xs font-medium text-muted transition-colors hover:bg-sand hover:text-ink disabled:opacity-50"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="font-semibold text-ink">{company}</span>
              <span className="text-faint">·</span>
              {t.back}
            </button>
            <h3 id="wz-category" className="font-display text-lg font-semibold text-ink">
              {t.categoryTitle}
            </h3>
            <p className="mt-0.5 text-sm text-muted">{t.categoryHint}</p>

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              {CATEGORIES.map((cat, i) => {
                const Icon = CATEGORY_ICON[cat];
                const busy = pending === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => pickCategory(cat)}
                    disabled={pending !== null}
                    aria-busy={busy}
                    style={{ ["--i" as string]: i }}
                    className={cn(
                      "wz-card group relative flex min-h-[96px] cursor-pointer flex-col justify-between gap-2 overflow-hidden rounded-2xl border border-line bg-panel p-3 text-left transition-colors duration-200 hover:border-forest-300 hover:bg-forest-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-400 disabled:cursor-default",
                      busy && "hf-checking border-forest-400",
                      pending !== null && !busy && "opacity-45",
                    )}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-forest-600/10 text-forest-700 transition-colors duration-200 group-hover:bg-forest-600 group-hover:text-cream">
                        {busy ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Icon className="h-4.5 w-4.5" />}
                      </span>
                      <span className="rounded-md bg-cream px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wide text-muted">
                        {cat}
                      </span>
                    </span>
                    <span className="text-[13px] font-medium leading-snug text-ink">
                      {busy ? (
                        <span className="font-mono text-xs text-forest-700">
                          {codePrefix(company, cat)}-····
                        </span>
                      ) : (
                        CATEGORY_LABEL[locale][cat]
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            {pending && (
              <p className="mt-3 text-center text-xs text-muted" role="status">
                {t.generating}
              </p>
            )}
          </section>
        )}

        {step === 2 && created && (
          <section aria-labelledby="wz-done" className="hf-done-panel space-y-4">
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 44 44" className="hf-done-ring h-11 w-11 shrink-0" aria-hidden>
                <circle cx="22" cy="22" r="20" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-forest-500" />
                <path d="M14 22.5l5.5 5.5L30 17" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-forest-600" />
              </svg>
              <div className="min-w-0">
                <h3 id="wz-done" className="font-display text-lg font-semibold text-ink">
                  {t.doneTitle}
                </h3>
                {/* Kode "tercetak" per karakter — satu ketukan, lalu diam. */}
                <p className="font-mono text-sm font-semibold tracking-wide text-forest-700" aria-label={created.code}>
                  {created.code.split("").map((ch, i) => (
                    <span key={i} aria-hidden className="wz-char" style={{ ["--i" as string]: i }}>
                      {ch}
                    </span>
                  ))}
                </p>
              </div>
            </div>

            <div className="hf-done-row" style={{ ["--i" as string]: 0 }}>
              <QrPanel item={created} />
            </div>

            <p className="hf-done-row text-xs text-muted" style={{ ["--i" as string]: 1 }}>
              {t.doneHint}
            </p>

            <div className="hf-done-row flex flex-col gap-2 sm:flex-row" style={{ ["--i" as string]: 2 }}>
              <Button className="flex-1" onClick={() => onComplete(created)}>
                <PencilLine className="h-4 w-4" /> {t.complete}
              </Button>
              <Button variant="outline" className="flex-1" onClick={again}>
                <Plus className="h-4 w-4" /> {t.again}
              </Button>
              <Button variant="ghost" className="sm:flex-none" onClick={onClose}>
                {t.finish}
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/** Tiga titik + bilah kemajuan — posisi terbaca sekilas, tanpa angka "1/3". */
function Stepper({ step, labels }: { step: Step; labels: [string, string, string] }) {
  return (
    <div>
      <ol className="flex items-center justify-between gap-2 text-xs font-medium">
        {labels.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? "step" : undefined}
            className={cn(
              "flex items-center gap-1.5 transition-colors duration-200",
              i < step ? "text-forest-700" : i === step ? "text-ink" : "text-faint",
            )}
          >
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors duration-300",
                i <= step ? "bg-forest-600 text-cream" : "bg-sand text-faint",
              )}
            >
              {i + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>
      <div className="hf-progress-track mt-2.5 h-1 rounded-full bg-sand">
        <div
          className="hf-progress-fill h-full rounded-full bg-forest-600"
          style={{ transform: `scaleX(${(step + 1) / 3})` }}
        />
      </div>
    </div>
  );
}
