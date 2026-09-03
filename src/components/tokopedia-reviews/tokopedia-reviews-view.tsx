"use client";

import { useMemo, useState } from "react";
import {
  BookOpenCheck, CheckCircle2, Inbox, MessageSquareOff, Settings2, Star,
} from "lucide-react";
import { apiErrorMessage } from "@/lib/api-error";
import { hasBody } from "@/lib/tokopedia/judgeme";
import type { TokopediaState } from "@/lib/tokopedia/types";
import { SOURCE_LABEL, SOURCES, type MarketplaceSource } from "@/lib/marketplace/sources";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/layout/locale-context";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { useToast } from "@/components/ui/toast";
import { ExportCard } from "./export-card";
import { ProductMapSheet } from "./product-map-sheet";
import { PullCard } from "./pull-card";
import { ReviewList } from "./review-list";
import { RunLog } from "./run-log";
import { STR } from "./strings";

interface PullResponse {
  outcome?: "ok" | "partial" | "rejected" | "failed";
  newCount?: number;
  withBody?: number;
  requests?: number;
  httpStatus?: number;
  detail?: string;
  state?: TokopediaState;
  error?: string;
  nextPullAt?: string;
}

export function TokopediaReviewsView({
  initialState,
  canPull,
  canManage,
}: {
  initialState: TokopediaState;
  canPull: boolean;
  canManage: boolean;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();

  const [state, setState] = useState(initialState);
  /** Tab sumber. "all" = satu layar untuk semuanya, sesuai tujuan modul ini. */
  const [tab, setTab] = useState<MarketplaceSource | "all">("all");
  const [busy, setBusy] = useState(false);
  const [marking, setMarking] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  /** Isi yang sedang ditampilkan — satu-satunya tempat tab diterjemahkan. */
  const tampil = useMemo(
    () => (tab === "all" ? state.reviews : state.reviews.filter((r) => r.source === tab)),
    [state.reviews, tab],
  );
  const runsTampil = useMemo(
    () => (tab === "all" ? state.runs : state.runs.filter((r) => r.source === tab)),
    [state.runs, tab],
  );
  /** Berapa review per sumber — dipakai lencana angka di tab. */
  const perSumber = useMemo(() => {
    const n: Record<string, number> = {};
    for (const r of state.reviews) n[r.source] = (n[r.source] ?? 0) + 1;
    return n;
  }, [state.reviews]);

  const stats = useMemo(() => {
    const pending = tampil.filter((r) => !r.exportedAt);
    return {
      total: tampil.length,
      pending: pending.length,
      importable: pending.filter(hasBody).length,
      starOnly: pending.filter((r) => !hasBody(r)).length,
    };
  }, [tampil]);

  async function pull(force: boolean) {
    setBusy(true);
    try {
      const res = await fetch("/api/tokopedia-reviews/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = (await res.json().catch(() => ({}))) as PullResponse;

      if (!res.ok) {
        // Penolakan jeda datang sebagai 429 dan tetap membawa nextPullAt —
        // dipakai supaya hitung mundur di layar langsung benar.
        if (data.nextPullAt) setState((s) => ({ ...s, nextPullAt: data.nextPullAt! }));
        toast.error(apiErrorMessage(data.error, locale, res.status));
        return;
      }
      if (data.state) setState(data.state);

      if (data.outcome === "rejected") {
        toast.error(apiErrorMessage("cooldown_rejected", locale));
        return;
      }
      if (data.outcome === "failed") {
        toast.error(`${apiErrorMessage("request_failed", locale)} ${data.detail ?? ""}`.trim());
        return;
      }
      const n = data.newCount ?? 0;
      toast.success(
        n === 0
          ? locale === "en"
            ? `No new reviews · ${data.requests ?? 0} requests`
            : `Tidak ada review baru · ${data.requests ?? 0} permintaan`
          : locale === "en"
            ? `${n} new reviews (${data.withBody ?? 0} import-ready) · ${data.requests ?? 0} requests`
            : `${n} review baru (${data.withBody ?? 0} siap import) · ${data.requests ?? 0} permintaan`,
      );
    } catch {
      toast.error(apiErrorMessage(undefined, locale));
    } finally {
      setBusy(false);
    }
  }

  /** Geser penanda "sudah diekspor" secara lokal, tanpa memuat ulang semuanya. */
  function applyMark(ids: string[], value: string | null) {
    const set = new Set(ids);
    setState((s) => ({
      ...s,
      reviews: s.reviews.map((r) => (set.has(r.feedbackId) ? { ...r, exportedAt: value } : r)),
    }));
  }

  async function markExported(ids: string[]) {
    setMarking(true);
    try {
      const res = await fetch("/api/tokopedia-reviews/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackIds: ids }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(apiErrorMessage(data.error, locale, res.status));
        return;
      }
      applyMark(ids, new Date().toISOString());
    } catch {
      toast.error(apiErrorMessage(undefined, locale));
    } finally {
      setMarking(false);
    }
  }

  async function unmark(ids: string[]) {
    setMarking(true);
    try {
      const res = await fetch("/api/tokopedia-reviews/export", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackIds: ids }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(apiErrorMessage(data.error, locale, res.status));
        return;
      }
      applyMark(ids, null);
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Satu menu, banyak sumber. Tab hanya MENYARING tampilan — ledger,
          jeda antar-run, dan ekspor Judge.me tetap satu, karena itulah alasan
          modul ini digabung. */}
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label={t.sourceTabs}>
        {(["all", ...SOURCES] as const).map((k) => {
          const aktif = tab === k;
          const jumlah = k === "all" ? state.reviews.length : (perSumber[k] ?? 0);
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={aktif}
              onClick={() => setTab(k)}
              className={cn(
                "cursor-pointer rounded-xl px-3 py-1.5 text-sm font-medium transition-colors",
                aktif ? "bg-forest-700 text-white" : "border border-line bg-panel text-ink-soft hover:bg-cream",
              )}
            >
              {k === "all" ? t.allSources : SOURCE_LABEL[k]}
              <span className={cn("ml-1.5 tabular-nums", aktif ? "text-white/70" : "text-ink-soft/70")}>{jumlah}</span>
            </button>
          );
        })}
      </div>

      {/* Tombol tarik di layar hanya bekerja untuk Tokopedia. Shopee menjawab
          403 dari IP pusat data (diuji langsung), jadi menawarkan tombolnya
          hanya akan menghasilkan kegagalan yang membingungkan — perintahnya
          yang ditampilkan, bukan tombol palsu. */}
      {tab === "shopee" && (
        <section className="rounded-2xl border border-[#e8d9a8] bg-gold-soft px-4 py-3.5 text-sm text-[#8a6512]">
          <p className="mb-2.5 leading-relaxed">{t.shopeeWhy}</p>
          <p className="font-semibold">{t.shopeeStep1}</p>
          <pre className="mt-1 mb-3 overflow-x-auto rounded-lg bg-panel/70 px-3 py-2 font-mono text-xs text-ink">
node scripts/marketplace-pull.mjs --source=shopee --discover=treelogy.moringa
          </pre>
          <p className="font-semibold">{t.shopeeStep2}</p>
          <pre className="mt-1 overflow-x-auto rounded-lg bg-panel/70 px-3 py-2 font-mono text-xs text-ink">
node scripts/marketplace-pull.mjs --source=shopee
          </pre>
          <p className="mt-3 leading-relaxed">{t.shopeeCookie}</p>
        </section>
      )}

      <PullCard
        locale={locale}
        runs={runsTampil}
        nextPullAt={state.nextPullAt}
        canPull={canPull && state.ready && tab !== "shopee"}
        canForce={canManage}
        busy={busy}
        onPull={pull}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t.inLedger} value={String(stats.total)} sub={t.inLedgerSub} icon={Star} tone="gold" />
        <StatCard label={t.pending} value={String(stats.pending)} sub={t.pendingSub} icon={Inbox} tone="sky" />
        <StatCard
          label={t.importable}
          value={String(stats.importable)}
          sub={t.importableSub}
          icon={CheckCircle2}
          tone="matcha"
        />
        <StatCard
          label={t.starOnly}
          value={String(stats.starOnly)}
          sub={t.starOnlySub}
          icon={MessageSquareOff}
          tone="clay"
        />
      </div>

      {state.reviews.length > 0 && (
        <ExportCard
          locale={locale}
          reviews={state.reviews}
          onMarkExported={markExported}
          onUnmark={unmark}
          marking={marking}
        />
      )}

      {/* Panduan import + ekspektasi. Ditaruh DI HALAMAN, bukan di dokumen
          terpisah: kolom cf_* yang salah dipetakan dan lencana Verified yang
          tidak pernah datang adalah dua hal yang paling sering jadi kejutan. */}
      <section className="card p-4 sm:p-5">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink sm:text-lg">
          <BookOpenCheck className="h-4 w-4 text-forest-600" />
          {t.howTitle}
        </h2>
        <ol className="mt-3 space-y-1.5">
          {[t.how1, t.how2, t.how3, t.how4, t.how5].map((line, i) => (
            <li key={i} className="flex gap-2.5 text-xs leading-relaxed text-muted">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-forest-100 text-[10px] font-bold text-forest-700">
                {i + 1}
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
        <div className="mt-4 rounded-xl bg-sand/60 p-3">
          <p className="text-xs font-semibold text-ink">{t.expectTitle}</p>
          <ul className="mt-1.5 space-y-1">
            {[t.expect1, t.expect2, t.expect3].map((line) => (
              <li key={line} className="flex gap-2 text-[11px] leading-relaxed text-muted">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-faint" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {state.reviews.length > 0 ? (
        <ReviewList locale={locale} reviews={state.reviews} products={state.products} />
      ) : (
        <section className="rounded-2xl border border-dashed border-line bg-cream/40 px-5 py-10 text-center">
          <Star className="mx-auto h-8 w-8 text-faint" />
          <p className="mt-2 text-sm font-semibold text-ink">{t.emptyTitle}</p>
          <p className="mx-auto mt-1 max-w-xl text-xs leading-relaxed text-muted">{t.emptyBody}</p>
        </section>
      )}

      <RunLog locale={locale} runs={state.runs} />

      {canManage && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setMapOpen(true)}>
            <Settings2 className="h-3.5 w-3.5" />
            {t.mapOpen} ({state.products.length})
          </Button>
        </div>
      )}

      <ProductMapSheet
        locale={locale}
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        products={state.products}
        onState={setState}
      />
    </div>
  );
}
