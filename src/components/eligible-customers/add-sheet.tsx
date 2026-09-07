"use client";

import { useState } from "react";
import { ChevronDown, Loader2, UserPlus } from "lucide-react";
import { apiErrorMessage } from "@/lib/api-error";
import type { Locale } from "@/lib/i18n";
import type { EligibleCustomer, EligibleState } from "@/lib/eligible-customers/types";
import { isValidEmail, isValidSeedDate, normalizeEmail, splitTags } from "@/lib/eligible-customers/validate";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { STR } from "./strings";

const EMPTY = { email: "", firstName: "", lastName: "", tags: "", seedDate: "", campaignKeys: "" };

export function AddSheet({
  locale,
  open,
  onClose,
  onState,
}: {
  locale: Locale;
  open: boolean;
  onClose: () => void;
  onState: (s: EligibleState) => void;
}) {
  const t = STR[locale];
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function close() {
    if (busy) return;
    setForm(EMPTY);
    setErr(null);
    setAdvanced(false);
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const email = normalizeEmail(form.email);
    if (!email) return setErr(apiErrorMessage("email_required", locale));
    if (!isValidEmail(email)) return setErr(apiErrorMessage("invalid_email", locale));
    const seedDate = form.seedDate.trim();
    if (seedDate && !isValidSeedDate(seedDate)) return setErr(apiErrorMessage("invalid_date", locale));
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/eligible-customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          firstName: form.firstName,
          lastName: form.lastName,
          tags: splitTags(form.tags),
          seedDate: seedDate || null,
          campaignKeys: splitTags(form.campaignKeys),
          source: "manual",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        customer?: EligibleCustomer; state?: EligibleState; error?: string; detail?: string;
      };
      if (!res.ok || !data.customer) {
        const msg = apiErrorMessage(data.error, locale, res.status);
        setErr(data.detail ? `${msg} ${data.detail}` : msg);
        return;
      }
      if (data.state) onState(data.state);
      const c = data.customer;
      if (c.seedStatus === "seeded") {
        toast.success(c.createdInShopify === false ? t.savedExistingSeeded : t.savedSeeded);
      } else {
        // Customer-nya jadi, seeding-nya tidak — dua fakta itu disampaikan
        // apa adanya; "sukses" saja akan menyembunyikan pelanggan yang
        // ternyata tidak dapat diskon di checkout.
        const why = apiErrorMessage(c.seedError, locale);
        toast.error(`${c.seedStatus === "failed" ? t.savedFailed : t.savedPending} ${why}`);
      }
      setForm(EMPTY);
      setAdvanced(false);
      onClose();
    } catch {
      setErr(apiErrorMessage(undefined, locale));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title={t.addTitle}
      description={t.addLead}
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={close} disabled={busy}>
            {t.close}
          </Button>
          <Button type="submit" form="eligible-add-form" className="flex-1" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {busy ? t.submitting : t.submit}
          </Button>
        </div>
      }
    >
      <form id="eligible-add-form" onSubmit={submit} className="space-y-4">
        <Field label={t.email} htmlFor="ec-email" required>
          <Input
            id="ec-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={form.email}
            onChange={set("email")}
            placeholder="vip@example.com"
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.firstName} htmlFor="ec-first">
            <Input id="ec-first" value={form.firstName} onChange={set("firstName")} placeholder="Budi" />
          </Field>
          <Field label={t.lastName} htmlFor="ec-last">
            <Input id="ec-last" value={form.lastName} onChange={set("lastName")} placeholder="Santoso" />
          </Field>
        </div>
        <Field label={t.tags} htmlFor="ec-tags" hint={t.tagsHint}>
          <Input id="ec-tags" value={form.tags} onChange={set("tags")} placeholder="vip, reseller" />
        </Field>

        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-line bg-panel px-3 py-2 text-sm font-medium text-ink-soft hover:bg-cream"
          aria-expanded={advanced}
        >
          {t.advanced}
          <ChevronDown className={cn("h-4 w-4 transition-transform", advanced && "rotate-180")} />
        </button>
        {advanced && (
          <div className="space-y-4 rounded-xl border border-dashed border-line bg-cream/40 p-3">
            <Field label={t.seedDate} htmlFor="ec-seed" hint={t.seedDateHint}>
              <Input id="ec-seed" type="date" max="2099-12-31" value={form.seedDate} onChange={set("seedDate")} />
            </Field>
            <Field label={t.campaignKeys} htmlFor="ec-keys" hint={t.campaignKeysHint}>
              <Input id="ec-keys" value={form.campaignKeys} onChange={set("campaignKeys")} placeholder="cd_abc123" />
            </Field>
          </div>
        )}

        {err && (
          <p role="alert" className="rounded-xl bg-clay-soft px-3 py-2 text-sm text-[#8c3c1f]">
            {err}
          </p>
        )}
      </form>
    </Sheet>
  );
}
