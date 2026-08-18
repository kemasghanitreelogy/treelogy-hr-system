"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, RefreshCw, Upload } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/layout/locale-context";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

export interface JubelioRow {
  page: number;
  name: string;
  legacyId: string;
  zip: string;
  awb: string;
  courier: string;
}

interface PreviewRow {
  page: number;
  found: boolean;
  salesorderId: number | null;
  salesorderNo: string | null;
  currentTracking: string | null;
  refMatch: boolean;
  writable: boolean;
  status: string;
}

interface PushRow {
  page: number;
  ok: boolean;
  error?: string;
  salesorderNo?: string;
}

const STR: Record<Locale, Record<string, string>> = {
  id: {
    title: "Kirim ke Jubelio",
    lead: "Tulis kurir + No. Resi ke order Jubelio yang bersesuaian.",
    eligible: "label cocok Shopify & siap dicek",
    check: "Cek dulu",
    checking: "Memeriksa…",
    recheck: "Cek ulang",
    push: "Kirim",
    pushing: "Menulis…",
    page: "Hal",
    recipient: "Penerima",
    courier: "Kurir",
    awb: "AWB / Resi",
    so: "Order Jubelio",
    current: "Resi sekarang",
    status: "Status",
    written: "tertulis",
    confirmTitle: "Tulis resi ke Jubelio?",
    confirmMsg:
      "Nomor resi & kurir akan ditulis ke order Jubelio yang sudah dikonfirmasi lewat ref_no. Order yang sudah punya resi tidak akan ditimpa.",
    confirmYes: "Ya, tulis sekarang",
    doneSome: "Resi tertulis ke Jubelio.",
    doneNone: "Tidak ada baris yang berhasil ditulis.",
    connection: "Koneksi bermasalah. Coba lagi.",
    note:
      "Pencocokannya eksak: tiap order Jubelio dikonfirmasi lewat ref_no = ID order Shopify, dan order yang sudah punya resi tidak pernah ditimpa. \"Cek dulu\" tidak menulis apa pun.",
    noneWritable: "Belum ada baris yang siap ditulis.",
    syncDenied: "Anda tidak punya izin menulis ke Jubelio — hanya bisa memeriksa.",
  },
  en: {
    title: "Sync to Jubelio",
    lead: "Write the courier + tracking number into the matching Jubelio order.",
    eligible: "Shopify-matched labels ready to check",
    check: "Check first",
    checking: "Checking…",
    recheck: "Check again",
    push: "Push",
    pushing: "Writing…",
    page: "Pg",
    recipient: "Recipient",
    courier: "Courier",
    awb: "AWB",
    so: "Jubelio order",
    current: "Current AWB",
    status: "Status",
    written: "written",
    confirmTitle: "Write tracking numbers to Jubelio?",
    confirmMsg:
      "The AWB + courier will be written to Jubelio orders confirmed by ref_no. Orders that already have an AWB are never overwritten.",
    confirmYes: "Yes, write now",
    doneSome: "Tracking numbers written to Jubelio.",
    doneNone: "No rows were written.",
    connection: "Connection problem. Try again.",
    note:
      "Matching is exact: each Jubelio order is confirmed by ref_no = the Shopify order id, and orders that already have an AWB are never overwritten. \"Check first\" writes nothing.",
    noneWritable: "No rows are ready to write yet.",
    syncDenied: "You don't have permission to write to Jubelio — checking only.",
  },
};

export function JubelioPanel({ rows, canSync }: { rows: JubelioRow[]; canSync: boolean }) {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();

  const [preview, setPreview] = useState<Record<number, PreviewRow> | null>(null);
  const [pushed, setPushed] = useState<Record<number, PushRow>>({});
  const [busy, setBusy] = useState<"" | "preview" | "push">("");
  const [confirm, setConfirm] = useState(false);

  const writable = useMemo(
    () => (preview ? rows.filter((r) => preview[r.page]?.writable) : []),
    [preview, rows],
  );

  async function call(mode: "preview" | "push", body: JubelioRow[]) {
    const res = await fetch("/api/receipt-sales/jubelio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, rows: body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(apiErrorMessage(data?.error, locale, res.status));
    return data;
  }

  async function runPreview(silent = false) {
    setBusy("preview");
    try {
      const data = await call("preview", rows);
      const map: Record<number, PreviewRow> = {};
      for (const r of (data.results ?? []) as PreviewRow[]) map[r.page] = r;
      setPreview(map);
      if (!silent) setPushed({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.connection);
    } finally {
      setBusy("");
    }
  }

  async function runPush() {
    setConfirm(false);
    if (!writable.length) return;
    setBusy("push");
    try {
      const data = await call("push", writable);
      const map: Record<number, PushRow> = {};
      let okCount = 0;
      for (const r of (data.results ?? []) as PushRow[]) {
        map[r.page] = r;
        if (r.ok) okCount++;
      }
      setPushed(map);
      if (okCount > 0) toast.success(`${okCount} ${t.written} — ${t.doneSome}`);
      else toast.error(t.doneNone);
      // Jubelio memproses AWB secara asinkron: membaca ulang seketika masih
      // memperlihatkan keadaan lama, jadi tunggu sebentar sebelum cek ulang.
      setTimeout(() => runPreview(true), 6000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.connection);
    } finally {
      setBusy("");
    }
  }

  if (!rows.length) return null;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">{t.title}</h3>
          <p className="mt-0.5 text-xs text-muted">
            {t.lead} <span className="text-faint">· {rows.length} {t.eligible}</span>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={() => runPreview()} disabled={!!busy}>
            {busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {busy === "preview" ? t.checking : preview ? t.recheck : t.check}
          </Button>
          {canSync && (
            <Button onClick={() => setConfirm(true)} disabled={!!busy || !writable.length}>
              {busy === "push" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {busy === "push" ? t.pushing : `${t.push} ${writable.length}`}
            </Button>
          )}
        </div>
      </div>

      {!canSync && (
        <p className="border-b border-line bg-gold-soft/40 px-4 py-2 text-xs text-[#8a6512]">{t.syncDenied}</p>
      )}

      {preview && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="bg-cream/60 text-faint">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">{t.page}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t.recipient}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t.courier}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t.awb}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t.so}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t.current}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t.status}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const p = preview[r.page];
                const done = pushed[r.page];
                const good = done?.ok || (!done && p?.writable);
                return (
                  <tr key={r.page} className="transition-colors hover:bg-cream/40">
                    <td className="px-3 py-2 tabular-nums text-muted">{r.page}</td>
                    <td className="max-w-[180px] truncate px-3 py-2 text-ink">{r.name}</td>
                    <td className="px-3 py-2 text-muted">{r.courier}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-ink">{r.awb}</td>
                    <td className="px-3 py-2 text-muted">{p?.salesorderNo || (p?.found ? p.salesorderId : "—")}</td>
                    <td className="px-3 py-2 font-mono text-muted">{p?.currentTracking || "—"}</td>
                    <td className={cn("px-3 py-2", good ? "text-forest-700" : p?.found ? "text-[#8a6512]" : "text-muted")}>
                      <span className="inline-flex items-start gap-1">
                        {done ? (
                          done.ok ? <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" /> : <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
                        ) : null}
                        {done ? (done.ok ? `✓ ${t.written}` : done.error) : p?.status || "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {preview && !writable.length && !Object.keys(pushed).length && (
        <p className="border-t border-line px-4 py-2 text-xs text-muted">{t.noneWritable}</p>
      )}

      <p className="border-t border-line px-4 py-2.5 text-[11px] leading-relaxed text-faint">{t.note}</p>

      <ConfirmDialog
        open={confirm}
        title={t.confirmTitle}
        message={t.confirmMsg}
        confirmLabel={t.confirmYes}
        busy={busy === "push"}
        onConfirm={runPush}
        onCancel={() => setConfirm(false)}
      />
    </section>
  );
}
