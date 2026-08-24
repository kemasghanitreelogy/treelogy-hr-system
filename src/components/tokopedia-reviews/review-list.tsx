"use client";

import { useMemo, useState } from "react";
import { CornerDownRight, Image as ImageIcon, MessageSquareOff, Search, Star } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import { hasBody, picturesExpired } from "@/lib/tokopedia/judgeme";
import type { TokopediaProduct, TokopediaReview } from "@/lib/tokopedia/types";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/field";
import { STR } from "./strings";

/** Bintang dibaca sekilas — angka saja menuntut orang menerjemahkannya. */
function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${n}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn("h-3.5 w-3.5", i <= n ? "fill-[#e0a82e] text-[#e0a82e]" : "text-line")}
          aria-hidden
        />
      ))}
    </span>
  );
}

/** Berapa banyak kartu ditampilkan sekaligus — ledger bisa ratusan baris. */
const PAGE = 40;

export function ReviewList({
  locale,
  reviews,
  products,
}: {
  locale: Locale;
  reviews: TokopediaReview[];
  products: TokopediaProduct[];
}) {
  const t = STR[locale];
  const [query, setQuery] = useState("");
  const [product, setProduct] = useState("all");
  const [status, setStatus] = useState<"all" | "pending" | "exported">("all");
  const [body, setBody] = useState<"all" | "with" | "none">("all");
  const [shown, setShown] = useState(PAGE);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reviews.filter((r) => {
      if (product !== "all" && r.productId !== product) return false;
      if (status === "pending" && r.exportedAt) return false;
      if (status === "exported" && !r.exportedAt) return false;
      if (body === "with" && !hasBody(r)) return false;
      if (body === "none" && hasBody(r)) return false;
      if (!q) return true;
      return (
        r.body.toLowerCase().includes(q) ||
        r.reviewerName.toLowerCase().includes(q) ||
        (r.variantName ?? "").toLowerCase().includes(q)
      );
    });
  }, [reviews, query, product, status, body]);

  const visible = filtered.slice(0, shown);

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-semibold text-ink sm:text-lg">{t.listTitle}</h2>
        <p className="text-xs tabular-nums text-faint">
          {filtered.length} {t.of} {reviews.length} {t.rows}
        </p>
      </div>

      {/* Saringan menumpuk di ponsel, sebaris di layar lebar. */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(PAGE);
            }}
            placeholder={t.search}
            className="pl-9"
            aria-label={t.search}
          />
        </div>
        <Select value={product} onChange={(e) => setProduct(e.target.value)} aria-label={t.allProducts}>
          <option value="all">{t.allProducts}</option>
          {products.map((p) => (
            <option key={p.productId} value={p.productId}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          aria-label={t.fStatusAll}
        >
          <option value="all">{t.fStatusAll}</option>
          <option value="pending">{t.fStatusPending}</option>
          <option value="exported">{t.fStatusExported}</option>
        </Select>
        <Select value={body} onChange={(e) => setBody(e.target.value as typeof body)} aria-label={t.fBodyAll}>
          <option value="all">{t.fBodyAll}</option>
          <option value="with">{t.fBodyWith}</option>
          <option value="none">{t.fBodyNone}</option>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-line bg-cream/40 px-4 py-8 text-center text-sm text-muted">
          {t.noMatch}
        </p>
      ) : (
        <>
          <ul className="mt-3 space-y-2">
            {visible.map((r) => {
              const empty = !hasBody(r);
              const dead = picturesExpired(r);
              return (
                <li
                  key={r.feedbackId}
                  className={cn(
                    "rounded-xl border border-line bg-panel p-3 transition-colors",
                    empty && "border-dashed bg-sand/30",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Stars n={r.rating} />
                    <span className="text-xs font-semibold text-ink">{r.reviewerName || "—"}</span>
                    <span className="text-xs text-faint">·</span>
                    <span className="text-xs tabular-nums text-faint">{formatDate(r.reviewAt, "short", locale)}</span>
                    {r.variantName && (
                      <Badge tone="neutral" className="text-[10px]">
                        {r.variantName}
                      </Badge>
                    )}
                  </div>

                  {empty ? (
                    <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs italic text-faint">
                      <MessageSquareOff className="h-3.5 w-3.5" />
                      {t.starOnlySub}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-sm leading-relaxed text-ink">{r.body}</p>
                  )}

                  {r.reply && (
                    <p className="mt-1.5 flex gap-1.5 rounded-lg bg-forest-50 px-2 py-1.5 text-xs leading-relaxed text-forest-700">
                      <CornerDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        <span className="font-semibold">{t.reply}: </span>
                        {r.reply}
                      </span>
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-faint">{r.productName || r.shopifyHandle}</span>
                    {r.pictureUrls.length > 0 && (
                      <Badge tone={dead ? "clay" : "matcha"} className="text-[10px]">
                        <ImageIcon className="h-3 w-3" />
                        {r.pictureUrls.length} {t.photos}
                        {dead ? ` · ${t.photoDead}` : ""}
                      </Badge>
                    )}
                    {r.exportedAt && (
                      <Badge tone="sky" className="text-[10px]">
                        {t.exportedOn} {formatDate(r.exportedAt, "short", locale)}
                      </Badge>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {shown < filtered.length && (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE)}
              className="mt-3 w-full cursor-pointer rounded-xl border border-line bg-panel py-2.5 text-xs font-medium text-forest-700 transition-colors hover:bg-forest-50"
            >
              {locale === "en" ? "Show more" : "Tampilkan lagi"} ({filtered.length - shown})
            </button>
          )}
        </>
      )}
    </section>
  );
}
