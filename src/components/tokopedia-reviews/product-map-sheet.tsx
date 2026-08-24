"use client";

import { useState } from "react";
import { Link2, Loader2, Plus, Power, Trash2 } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import type { TokopediaProduct, TokopediaState } from "@/lib/tokopedia/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { STR } from "./strings";

export function ProductMapSheet({
  locale,
  open,
  onClose,
  products,
  onState,
}: {
  locale: Locale;
  open: boolean;
  onClose: () => void;
  products: TokopediaProduct[];
  onState: (s: TokopediaState) => void;
}) {
  const t = STR[locale];
  const toast = useToast();

  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ productId: "", shopifyHandle: "", name: "" });
  const [removing, setRemoving] = useState<TokopediaProduct | null>(null);

  async function send(init: RequestInit, url = "/api/tokopedia-reviews/products") {
    setBusy(true);
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      const data = (await res.json().catch(() => ({}))) as { state?: TokopediaState; error?: string };
      if (!res.ok) {
        toast.error(apiErrorMessage(data.error, locale, res.status));
        return false;
      }
      if (data.state) onState(data.state);
      toast.success(t.mapSaved);
      return true;
    } catch {
      toast.error(apiErrorMessage(undefined, locale));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t.mapTitle} description={t.mapLead} width="lg">
      <div className="space-y-3">
        {products.length === 0 && !adding && (
          <p className="rounded-xl border border-dashed border-line bg-cream/40 px-4 py-6 text-center text-sm text-muted">
            {t.mapEmpty}
          </p>
        )}

        <ul className="space-y-2">
          {products.map((p) => (
            <li
              key={p.productId}
              className={cn(
                "rounded-xl border border-line bg-panel p-3",
                !p.active && "border-dashed bg-sand/30",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{p.name}</span>
                <Badge tone={p.active ? "matcha" : "neutral"} dot>
                  {p.active ? t.mapActive : t.mapInactive}
                </Badge>
              </div>

              <p className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-faint">
                <span className="tabular-nums">{p.productId}</span>
                <Link2 className="h-3 w-3" />
                <span className="text-forest-700">{p.shopifyHandle}</span>
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] tabular-nums text-faint">
                  {p.reviewCount ?? 0} {t.mapReviews}
                </span>
                <span className="flex-1" />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    send({
                      method: "PATCH",
                      body: JSON.stringify({ productId: p.productId, active: !p.active }),
                    })
                  }
                  title={p.active ? t.mapDeactivateHint : undefined}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-muted transition-colors hover:bg-sand hover:text-ink disabled:opacity-50"
                >
                  <Power className="h-3 w-3" />
                  {p.active ? t.mapDeactivate : t.mapActivate}
                </button>
                {/* Hapus hanya masuk akal untuk produk yang belum punya review;
                    di luar itu server menolaknya, jadi tombolnya pun tidak ada. */}
                {(p.reviewCount ?? 0) === 0 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setRemoving(p)}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-muted transition-colors hover:bg-clay-soft hover:text-clay disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" />
                    {t.mapRemove}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {adding ? (
          <div className="space-y-3 rounded-xl border border-line bg-panel p-3">
            <Field label={t.mapId} htmlFor="tp-id" hint={t.mapIdHint} required>
              <Input
                id="tp-id"
                inputMode="numeric"
                value={form.productId}
                onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value.trim() }))}
                placeholder="1731010208236603355"
                className="font-mono"
              />
            </Field>
            <Field label={t.mapHandle} htmlFor="tp-handle" hint={t.mapHandleHint} required>
              <Input
                id="tp-handle"
                value={form.shopifyHandle}
                onChange={(e) => setForm((f) => ({ ...f, shopifyHandle: e.target.value.trim() }))}
                placeholder="organic-moringa-capsules"
                className="font-mono"
              />
            </Field>
            <Field label={t.mapName} htmlFor="tp-name" required>
              <Input
                id="tp-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Organic Moringa Capsules"
              />
            </Field>
            <div className="flex gap-2">
              <Button
                disabled={busy}
                onClick={async () => {
                  const ok = await send({ method: "POST", body: JSON.stringify(form) });
                  if (ok) {
                    setForm({ productId: "", shopifyHandle: "", name: "" });
                    setAdding(false);
                  }
                }}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t.mapSave}
              </Button>
              <Button variant="ghost" onClick={() => setAdding(false)} disabled={busy}>
                {locale === "en" ? "Cancel" : "Batal"}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setAdding(true)} className="w-full">
            <Plus className="h-4 w-4" />
            {t.mapAdd}
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(removing)}
        title={t.mapRemoveConfirm}
        message={`${removing?.name ?? ""} — ${t.mapRemoveBody}`}
        confirmLabel={t.mapRemove}
        tone="danger"
        busy={busy}
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          const p = removing;
          setRemoving(null);
          if (p) {
            await send(
              { method: "DELETE" },
              `/api/tokopedia-reviews/products?productId=${encodeURIComponent(p.productId)}`,
            );
          }
        }}
      />
    </Sheet>
  );
}
