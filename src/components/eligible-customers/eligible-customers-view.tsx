"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle, BadgePercent, ChevronDown, FileSpreadsheet, RefreshCw, Search, ShieldAlert, UserPlus, Users,
} from "lucide-react";
import { apiErrorMessage } from "@/lib/api-error";
import type { EligibleCustomer, EligibleState, GrantInput, SeedStatus } from "@/lib/eligible-customers/types";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/layout/locale-context";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/field";
import { StatCard } from "@/components/ui/stat-card";
import { useToast } from "@/components/ui/toast";
import { AddSheet } from "./add-sheet";
import { CustomerList } from "./customer-list";
import { ImportSheet } from "./import-sheet";
import { runBulk, tally } from "./run-bulk";
import { STR } from "./strings";

type Filter = "all" | SeedStatus;

export function EligibleCustomersView({
  initialState,
  canGrant,
}: {
  initialState: EligibleState;
  canGrant: boolean;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();

  const [state, setState] = useState(initialState);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [confirmRegrant, setConfirmRegrant] = useState(false);

  const counts = useMemo(() => {
    const n = { seeded: 0, pending: 0, failed: 0 };
    for (const c of state.customers) n[c.seedStatus]++;
    return n;
  }, [state.customers]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return state.customers.filter((c) => {
      if (filter !== "all" && c.seedStatus !== filter) return false;
      if (!needle) return true;
      return (
        c.email.includes(needle) ||
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(needle) ||
        c.tags.some((tag) => tag.toLowerCase().includes(needle))
      );
    });
  }, [state.customers, q, filter]);

  /** Baris ledger → permintaan grant yang sama persis (idempoten di server). */
  const toInput = (c: EligibleCustomer): GrantInput => ({
    email: c.email,
    firstName: c.firstName,
    lastName: c.lastName,
    tags: c.tags,
    seedDate: c.seedDate,
    source: c.source,
  });

  async function retryOne(c: EligibleCustomer) {
    setRetrying(c.email);
    try {
      const res = await fetch("/api/eligible-customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toInput(c)),
      });
      const data = (await res.json().catch(() => ({}))) as {
        customer?: EligibleCustomer; state?: EligibleState; error?: string; detail?: string;
      };
      if (!res.ok || !data.customer) {
        toast.error([apiErrorMessage(data.error, locale, res.status), data.detail].filter(Boolean).join(" "));
        return;
      }
      if (data.state) setState(data.state);
      if (data.customer.seedStatus === "seeded") toast.success(t.retried);
      else toast.error(`${data.customer.seedStatus === "failed" ? t.savedFailed : t.savedPending} ${apiErrorMessage(data.customer.seedError, locale)}`);
    } catch {
      toast.error(apiErrorMessage(undefined, locale));
    } finally {
      setRetrying(null);
    }
  }

  async function verifyOne(c: EligibleCustomer) {
    setVerifying(c.email);
    try {
      const res = await fetch("/api/eligible-customers/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: c.email }),
      });
      const data = (await res.json().catch(() => ({}))) as { state?: EligibleState; error?: string; detail?: string };
      if (!res.ok) {
        toast.error([apiErrorMessage(data.error, locale, res.status), data.detail].filter(Boolean).join(" "));
        return;
      }
      if (data.state) setState(data.state);
      toast.success(t.verified);
    } catch {
      toast.error(apiErrorMessage(undefined, locale));
    } finally {
      setVerifying(null);
    }
  }

  async function runMany(list: EligibleCustomer[]) {
    if (!list.length) return;
    setBulk({ done: 0, total: list.length });
    const results = await runBulk(list.map(toInput), (p) => setBulk({ done: p.done, total: p.total }), setState);
    setBulk(null);
    const n = tally(results);
    const msg = `${n.seeded} ${t.resSeeded} · ${n.pending} ${t.resPending} · ${n.failedSeed + n.error} ${t.filterFailed.toLowerCase()}`;
    if (n.failedSeed + n.error + n.pending === 0) toast.success(`${t.retried} ${msg}`);
    else toast.error(msg);
  }

  const notSeeded = state.customers.filter((c) => c.seedStatus !== "seeded");

  return (
    <div className="space-y-4">
      {/* Kesiapan dua kredensial — ditampilkan di atas, bukan disembunyikan di
          balik kegagalan per-baris, karena akibatnya berlaku untuk SEMUA baris. */}
      {!state.shopifyReady && (
        <Notice tone="clay" icon={ShieldAlert}>{t.shopifyMissing}</Notice>
      )}
      {state.shopifyReady && !state.seedReady && (
        <Notice tone="gold" icon={AlertTriangle}>{state.verifyReady ? t.seedMissingWithToken : t.seedMissing}</Notice>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t.statTotal} value={String(state.customers.length)} icon={Users} tone="forest" />
        <StatCard label={t.statSeeded} value={String(counts.seeded)} sub={t.statSeededSub} icon={BadgePercent} tone="matcha" />
        <StatCard label={t.statPending} value={String(counts.pending)} sub={t.statPendingSub} icon={AlertTriangle} tone="gold" />
        <StatCard label={t.statFailed} value={String(counts.failed)} sub={t.statFailedSub} icon={ShieldAlert} tone="clay" />
      </div>

      {canGrant && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setAddOpen(true)} disabled={!state.shopifyReady || !!bulk}>
            <UserPlus className="h-4 w-4" /> {t.add}
          </Button>
          <Button variant="secondary" onClick={() => setImportOpen(true)} disabled={!state.shopifyReady || !!bulk}>
            <FileSpreadsheet className="h-4 w-4" /> {t.importBtn}
          </Button>
          {notSeeded.length > 0 && (
            <Button variant="outline" onClick={() => runMany(notSeeded)} disabled={!state.shopifyReady || !state.seedReady || !!bulk}>
              <RefreshCw className={cn("h-4 w-4", bulk && "animate-spin")} />
              {bulk ? `${bulk.done}/${bulk.total}` : `${t.retryPending} (${notSeeded.length})`}
            </Button>
          )}
          {state.customers.length > 0 && (
            <Button variant="ghost" onClick={() => setConfirmRegrant(true)} disabled={!state.shopifyReady || !state.seedReady || !!bulk}>
              <RefreshCw className="h-4 w-4" /> {t.regrantAll}
            </Button>
          )}
        </div>
      )}

      {/* Cara kerja — dilipat, tapi selalu ada: aturan "harus login dengan
          email yang sama" adalah penyebab #1 "diskonnya tidak muncul". */}
      <div className="card">
        <button
          type="button"
          onClick={() => setHowOpen((v) => !v)}
          aria-expanded={howOpen}
          className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left text-sm font-semibold text-ink"
        >
          {t.howTitle}
          <ChevronDown className={cn("h-4 w-4 text-muted transition-transform", howOpen && "rotate-180")} />
        </button>
        {howOpen && (
          <ol className="space-y-2 border-t border-line px-4 py-3 text-sm text-ink-soft">
            {[t.how1, t.how2, t.how3, t.how4].map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-forest-100 text-xs font-semibold text-forest-700">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} className="pl-9" aria-label={t.search} />
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist">
          {(
            [
              ["all", t.filterAll, state.customers.length],
              ["seeded", t.filterSeeded, counts.seeded],
              ["pending", t.filterPending, counts.pending],
              ["failed", t.filterFailed, counts.failed],
            ] as [Filter, string, number][]
          ).map(([k, label, n]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={filter === k}
              onClick={() => setFilter(k)}
              className={cn(
                "cursor-pointer rounded-xl px-3 py-1.5 text-sm font-medium transition-colors",
                filter === k ? "bg-forest-700 text-white" : "border border-line bg-panel text-ink-soft hover:bg-cream",
              )}
            >
              {label}
              <span className={cn("ml-1.5 tabular-nums", filter === k ? "text-white/70" : "text-ink-soft/70")}>{n}</span>
            </button>
          ))}
        </div>
      </div>

      <CustomerList
        locale={locale}
        customers={shown}
        storeHandle={state.storeHandle}
        canGrant={canGrant && !bulk}
        canVerify={state.verifyReady}
        retryingEmail={retrying}
        verifyingEmail={verifying}
        onRetry={retryOne}
        onVerify={verifyOne}
        emptyText={state.customers.length ? t.emptyFiltered : t.empty}
      />

      <AddSheet locale={locale} open={addOpen} onClose={() => setAddOpen(false)} onState={setState} />
      <ImportSheet locale={locale} open={importOpen} onClose={() => setImportOpen(false)} onState={setState} />

      <ConfirmDialog
        open={confirmRegrant}
        title={t.regrantAllTitle}
        message={t.regrantAllBody}
        confirmLabel={t.regrantAllYes}
        tone="primary"
        icon={<RefreshCw className="h-5 w-5" />}
        onCancel={() => setConfirmRegrant(false)}
        onConfirm={() => {
          setConfirmRegrant(false);
          void runMany(state.customers);
        }}
      />
    </div>
  );
}

function Notice({ tone, icon: Icon, children }: { tone: "clay" | "gold"; icon: typeof AlertTriangle; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2.5 rounded-2xl px-4 py-3 text-sm",
        tone === "clay" ? "bg-clay-soft text-[#8c3c1f]" : "bg-gold-soft text-[#8a6512]",
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{children}</p>
    </div>
  );
}
