"use client";

import { useState } from "react";
import { ChevronDown, History } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { TokopediaRun, TokopediaRunStatus } from "@/lib/tokopedia/types";
import { Badge } from "@/components/ui/badge";
import { STR } from "./strings";

const TONE: Record<TokopediaRunStatus, "matcha" | "gold" | "clay" | "neutral"> = {
  ok: "matcha",
  partial: "gold",
  rejected: "clay",
  failed: "clay",
  running: "neutral",
};

export function RunLog({ locale, runs }: { locale: Locale; runs: TokopediaRun[] }) {
  const t = STR[locale];
  const [open, setOpen] = useState(false);

  const label: Record<TokopediaRunStatus, string> = {
    ok: t.stOk, partial: t.stPartial, rejected: t.stRejected, failed: t.stFailed, running: t.stRunning,
  };

  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-3 p-4 text-left transition-colors hover:bg-sand/40 sm:p-5"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sand text-muted">
          <History className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-sm font-semibold text-ink">{t.runsTitle}</span>
          <span className="block text-[11px] text-faint">{t.runsLead}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-faint transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-line px-4 pb-4 sm:px-5 sm:pb-5">
          {runs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">{t.noRuns}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {runs.map((r) => (
                <li key={r.id} className="rounded-xl border border-line bg-panel p-3">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Badge tone={TONE[r.status]} dot>
                      {label[r.status]}
                    </Badge>
                    <span className="text-xs tabular-nums text-ink">
                      {new Date(r.startedAt).toLocaleString(locale === "en" ? "en-GB" : "id-ID", {
                        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                    {r.startedByName && <span className="text-[11px] text-faint">· {r.startedByName}</span>}
                  </div>
                  <p className="mt-1.5 text-[11px] tabular-nums text-muted">
                    <span className="font-semibold text-ink">{r.requests}</span> {t.requests} ·{" "}
                    <span className="font-semibold text-ink">{r.reviewsNew}</span> {t.newLabel} ({r.withBody}{" "}
                    {t.fBodyWith.toLowerCase()}, {r.noBody} {t.fBodyNone.toLowerCase()})
                  </p>
                  {/* Galat ditampilkan APA ADANYA: kalau `shopName` rusak lagi
                      suatu hari, kalimat mentah dari server itulah petunjuknya. */}
                  {r.error && (
                    <p className="mt-1 break-all rounded-lg bg-clay-soft px-2 py-1 font-mono text-[10px] text-[#8c3c1f]">
                      {r.error}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
