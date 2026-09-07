"use client";

import { CheckCircle2, TriangleAlert } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import type { EligibleCustomer } from "@/lib/eligible-customers/types";
import { cn, formatDate } from "@/lib/utils";

/**
 * Isi metafield `$app:combined-discount-state` yang DIBACA SENDIRI lewat token
 * app Combined Discount — bukti eligibility yang sebenarnya, terlepas dari
 * apa kata backend saat seeding.
 */
export function MetafieldLine({ c, t, locale }: { c: EligibleCustomer; t: Record<string, string>; locale: Locale }) {
  const m = c.metafield;
  if (!m || !c.verifiedAt) {
    return (
      <p className="mt-2 text-xs text-faint">
        {t.mfLabel}: {t.mfUnchecked}
      </p>
    );
  }
  const ok = m.exists && !!m.firstPurchaseAt;
  const Icon = ok ? CheckCircle2 : TriangleAlert;
  const totalUses = m.campaigns.reduce((n, x) => n + x.uses, 0);
  return (
    <p className={cn("mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs", ok ? "text-forest-700" : "text-[#8a6512]")}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="font-medium">{t.mfLabel}:</span>
      {!m.exists ? (
        <span>{t.mfEmpty}</span>
      ) : (
        <>
          <span className="tabular-nums">firstPurchaseAt {m.firstPurchaseAt ?? "(" + t.mfNoFirst + ")"}</span>
          {m.campaigns.length > 0 && (
            <span className="tabular-nums">
              · {m.campaigns.length} {t.campaigns}
              {totalUses > 0 && ` (${t.mfUses} ${totalUses}×)`}
            </span>
          )}
        </>
      )}
      <span className="text-faint">· {t.mfChecked} {formatDate(c.verifiedAt, "short", locale)}</span>
    </p>
  );
}
