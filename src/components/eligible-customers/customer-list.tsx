"use client";

import { ExternalLink, Loader2, RotateCcw, ScanSearch } from "lucide-react";
import { apiErrorMessage } from "@/lib/api-error";
import type { Locale } from "@/lib/i18n";
import { numericCustomerId } from "@/lib/eligible-customers/map";
import type { EligibleCustomer } from "@/lib/eligible-customers/types";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetafieldLine } from "./metafield-line";
import { STR } from "./strings";

export function StatusBadge({ c, t }: { c: EligibleCustomer; t: Record<string, string> }) {
  if (c.seedStatus === "seeded") return <Badge tone="matcha" dot>{t.statusSeeded}</Badge>;
  if (c.seedStatus === "failed") return <Badge tone="clay" dot>{t.statusFailed}</Badge>;
  return <Badge tone="gold" dot>{t.statusPending}</Badge>;
}

export function CustomerList({
  locale,
  customers,
  storeHandle,
  canGrant,
  canVerify,
  retryingEmail,
  verifyingEmail,
  onRetry,
  onVerify,
  emptyText,
}: {
  locale: Locale;
  customers: EligibleCustomer[];
  storeHandle: string | null;
  canGrant: boolean;
  canVerify: boolean;
  retryingEmail: string | null;
  verifyingEmail: string | null;
  onRetry: (c: EligibleCustomer) => void;
  onVerify: (c: EligibleCustomer) => void;
  emptyText: string;
}) {
  const t = STR[locale];

  if (!customers.length) {
    return (
      <p className="rounded-2xl border border-dashed border-line bg-cream/40 px-4 py-10 text-center text-sm text-muted">
        {emptyText}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {customers.map((c) => {
        const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
        const numeric = numericCustomerId(c.shopifyCustomerId);
        const adminUrl = storeHandle && numeric ? `https://admin.shopify.com/store/${storeHandle}/customers/${numeric}` : null;
        const retrying = retryingEmail === c.email;
        const verifying = verifyingEmail === c.email;
        const why = c.seedStatus !== "seeded" && c.seedError ? apiErrorMessage(c.seedError, locale) : null;
        return (
          <li key={c.email} className="card p-3 sm:p-4">
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold text-ink">{name || c.email}</span>
                  <StatusBadge c={c} t={t} />
                </div>
                {name && <div className="mt-0.5 break-all text-sm text-ink-soft">{c.email}</div>}

                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                  {c.createdInShopify !== null && (
                    <span>{c.createdInShopify ? t.createdHere : t.existed}</span>
                  )}
                  {c.seedStatus === "seeded" && (
                    <>
                      <span className="tabular-nums">
                        {t.seedDateLabel} <span className="font-medium text-ink-soft">{c.seedFirstPurchaseAt ?? "—"}</span>
                      </span>
                      <span>
                        {c.seedCampaigns.length
                          ? `${c.seedCampaigns.length} ${t.campaigns}`
                          : t.noCampaign}
                      </span>
                    </>
                  )}
                  <span>
                    {formatDate(c.grantedAt, "short", locale)}
                    {c.grantedByName ? ` · ${t.grantedBy} ${c.grantedByName}` : ""}
                    {` · ${c.source === "import" ? t.viaImport : t.viaManual}`}
                  </span>
                </div>

                {c.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {c.tags.map((tag) => (
                      <span key={tag} className="rounded-md bg-sand px-1.5 py-0.5 text-[11px] text-muted">{tag}</span>
                    ))}
                  </div>
                )}

                {canVerify && <MetafieldLine c={c} t={t} locale={locale} />}

                {why && (
                  <p className="mt-2 rounded-lg bg-clay-soft/60 px-2.5 py-1.5 text-xs text-[#8c3c1f]">
                    {why}
                    {c.seedErrorDetail ? ` ${c.seedErrorDetail}` : ""}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {adminUrl && (
                  <Button asChild variant="ghost" size="sm">
                    <a href={adminUrl} target="_blank" rel="noopener noreferrer" aria-label={t.openShopify} title={t.openShopify}>
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                )}
                {canGrant && canVerify && c.shopifyCustomerId && (
                  <Button variant="ghost" size="sm" disabled={verifying || retrying} onClick={() => onVerify(c)} title={t.verify}>
                    {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">{verifying ? t.verifying : t.verify}</span>
                  </Button>
                )}
                {canGrant && (
                  <Button variant="outline" size="sm" disabled={retrying || verifying} onClick={() => onRetry(c)}>
                    {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    {retrying ? t.retrying : t.retryOne}
                  </Button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
