"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Clock, Download, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { TokopediaRun } from "@/lib/tokopedia/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { STR } from "./strings";

/** Sisa waktu dalam bahasa manusia — "3 hari 4 jam", "12 menit". */
function untilLabel(iso: string, locale: Locale, now: number): string {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return locale === "en" ? "now" : "sekarang";
  const mins = Math.ceil(ms / 60_000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const parts: string[] = [];
  if (d) parts.push(locale === "en" ? `${d}d` : `${d} hari`);
  if (h) parts.push(locale === "en" ? `${h}h` : `${h} jam`);
  if (!d && m) parts.push(locale === "en" ? `${m}m` : `${m} menit`);
  return parts.join(" ");
}

export function PullCard({
  locale,
  runs,
  nextPullAt,
  canPull,
  canForce,
  busy,
  onPull,
}: {
  locale: Locale;
  runs: TokopediaRun[];
  nextPullAt: string | null;
  canPull: boolean;
  canForce: boolean;
  busy: boolean;
  onPull: (force: boolean) => void;
}) {
  const t = STR[locale];
  const last = runs[0];
  const [askForce, setAskForce] = useState(false);

  // Hitung mundur berdetak sendiri: kalau tidak, layar yang dibiarkan terbuka
  // akan terus bilang "3 hari lagi" padahal tombolnya sudah boleh ditekan.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!nextPullAt) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [nextPullAt]);

  const locked = Boolean(nextPullAt) && new Date(nextPullAt!).getTime() > now;
  const rejected = last?.status === "rejected";
  const partial = last?.status === "partial";

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold text-ink sm:text-lg">{t.pullTitle}</h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted">{t.pullLead}</p>

          <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-forest-600" />
              <dt className="text-faint">{t.footprint}:</dt>
              <dd className="font-semibold text-ink">{t.footprintValue}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0 text-faint" />
              <dt className="text-faint">{t.lastRun}:</dt>
              <dd className="font-medium text-ink">
                {last
                  ? `${new Date(last.startedAt).toLocaleDateString(locale === "en" ? "en-GB" : "id-ID", {
                      day: "numeric", month: "short", year: "numeric",
                    })} · ${last.requests} ${t.requests}`
                  : t.never}
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-1.5 sm:items-end">
          <Button
            size="lg"
            onClick={() => onPull(false)}
            disabled={!canPull || busy || locked}
            className="w-full sm:w-auto"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {busy ? t.pulling : t.pull}
          </Button>
          {busy && <p className="text-[11px] text-faint sm:text-right">{t.pullingHint}</p>}
          {locked && !busy && (
            <p className="text-[11px] text-faint sm:text-right">
              {t.cooldownIn} <span className="font-semibold text-ink">{untilLabel(nextPullAt!, locale, now)}</span>
            </p>
          )}
        </div>
      </div>

      {/* Kenapa footprint-nya sekecil itu — ditulis di layar, bukan hanya di
          dokumen, karena inilah yang membuat orang tenang menekan tombolnya. */}
      <p className="mt-3 rounded-xl bg-sand/60 px-3 py-2 text-[11px] leading-relaxed text-muted">
        {t.footprintWhy}
      </p>

      {rejected && (
        <div className="mt-3 flex gap-2.5 rounded-xl border border-[#e6c9bd] bg-clay-soft px-3 py-2.5">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-clay" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#8c3c1f]">
              {t.rejectedTitle}
              {last?.error ? ` — ${last.error}` : ""}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[#8c3c1f]/85">{t.rejectedBody}</p>
          </div>
        </div>
      )}

      {partial && (
        <div className="mt-3 flex gap-2.5 rounded-xl border border-[#e8d9a8] bg-gold-soft px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#8a6512]" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#8a6512]">{t.partialTitle}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[#8a6512]/85">{t.partialBody}</p>
          </div>
        </div>
      )}

      {/* Menembus jeda hanya ditawarkan bila memang boleh ditembus. Sesudah
          PENOLAKAN endpoint tombol ini sengaja tidak pernah muncul — server pun
          menolaknya, jadi menampilkannya hanya akan mengundang percobaan. */}
      {locked && !busy && canForce && !rejected && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone="neutral" dot>
            {t.cooldownTitle}
          </Badge>
          <button
            type="button"
            onClick={() => setAskForce(true)}
            className={cn(
              "cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-muted",
              "transition-colors hover:bg-sand hover:text-ink",
            )}
          >
            {t.force}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={askForce}
        title={t.forceConfirm}
        message={t.forceBody}
        confirmLabel={t.forceYes}
        tone="primary"
        onCancel={() => setAskForce(false)}
        onConfirm={() => {
          setAskForce(false);
          onPull(true);
        }}
      />
    </section>
  );
}
