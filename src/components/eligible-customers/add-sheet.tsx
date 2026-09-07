"use client";

import { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { apiErrorMessage } from "@/lib/api-error";
import type { Locale } from "@/lib/i18n";
import type { EligibleCustomer, EligibleState } from "@/lib/eligible-customers/types";
import { isValidEmail, normalizeEmail } from "@/lib/eligible-customers/validate";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { STR } from "./strings";

const EMPTY = { email: "", firstName: "", lastName: "" };

/**
 * Formulir satuan — sengaja hanya email + nama. Tag penanda `admin-created`,
 * tanggal seed (sentinel), dan daftar campaign (semua yang aktif) ditentukan
 * server; operator tidak perlu dan tidak boleh memikirkannya.
 */
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function close() {
    if (busy) return;
    setForm(EMPTY);
    setErr(null);
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const email = normalizeEmail(form.email);
    if (!email) return setErr(apiErrorMessage("email_required", locale));
    if (!isValidEmail(email)) return setErr(apiErrorMessage("invalid_email", locale));
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/eligible-customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, firstName: form.firstName, lastName: form.lastName, source: "manual" }),
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
            placeholder="nama@email.com"
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

        {err && (
          <p role="alert" className="rounded-xl bg-clay-soft px-3 py-2 text-sm text-[#8c3c1f]">
            {err}
          </p>
        )}
      </form>
    </Sheet>
  );
}
