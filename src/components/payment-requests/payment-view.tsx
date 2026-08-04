"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Plus, ReceiptText, RefreshCw, Search } from "lucide-react";
import type { PaymentRequest } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { apiErrorMessage } from "@/lib/api-error";
import { cn, formatDate, rupiah } from "@/lib/utils";
import { DEPT_LABEL, KIND_LABEL, composeInvoiceLine } from "@/lib/payment-request";
import { useLocale } from "@/components/layout/locale-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { PaymentForm } from "./payment-form";

const STR: Record<Locale, Record<string, string>> = {
  id: {
    searchPh: "Cari deskripsi, vendor, nama…",
    allDept: "Semua departemen",
    submit: "Ajukan",
    formTitle: "Pengajuan Pembayaran",
    empty: "Belum ada pengajuan pembayaran.",
    emptyHint: "Nama & email terisi otomatis. Anda cukup melengkapi rincian dan melampirkan faktur.",
    emptyCta: "Buat pengajuan pertama",
    emptyFiltered: "Tidak ada pengajuan yang cocok.",
    colRequest: "Pengajuan", colDept: "Departemen", colAmount: "Nominal", colSheet: "Google Sheet",
    synced: "Masuk sheet", pendingSync: "Menunggu", failed: "Gagal masuk sheet",
    retry: "Kirim ulang ke sheet",
    created: "Pengajuan terkirim ✓",
    createdSheetOk: "Pengajuan terkirim & masuk Google Sheet ✓",
    createdSheetFail: "Pengajuan tersimpan, tapi belum masuk Google Sheet.",
    retried: "Berhasil masuk Google Sheet ✓",
    connection: "Koneksi bermasalah. Coba lagi.",
    count: "pengajuan",
    notConfigured:
      "Google Sheet belum tersambung — pengajuan tetap tersimpan aman dan bisa dikirim ke sheet begitu kredensial diisi.",
  },
  en: {
    searchPh: "Search description, vendor, name…",
    allDept: "All departments",
    submit: "Request",
    formTitle: "Payment Request",
    empty: "No payment requests yet.",
    emptyHint: "Name & email fill themselves in. You only add the details and attach the invoice.",
    emptyCta: "Create the first request",
    emptyFiltered: "No matching requests.",
    colRequest: "Request", colDept: "Department", colAmount: "Amount", colSheet: "Google Sheet",
    synced: "In sheet", pendingSync: "Pending", failed: "Not in sheet",
    retry: "Resend to sheet",
    created: "Request submitted ✓",
    createdSheetOk: "Submitted & written to Google Sheet ✓",
    createdSheetFail: "Saved, but not yet written to the Google Sheet.",
    retried: "Written to Google Sheet ✓",
    connection: "Connection problem. Try again.",
    count: "requests",
    notConfigured:
      "Google Sheet isn't connected yet — requests are still stored safely and can be pushed once credentials are set.",
  },
};

const MAX_STAGGER = 8;
const COLS =
  "grid-cols-[minmax(0,1fr)_auto] " +
  "xl:grid-cols-[minmax(0,1fr)_minmax(0,140px)_minmax(0,150px)_minmax(0,140px)]";

export function PaymentView({
  requests,
  employeeId,
  name,
  email,
  canManage,
  sheetsConnected,
}: {
  requests: PaymentRequest[];
  employeeId: string | null;
  name: string;
  email: string;
  /** Finance/HR — melihat semua & bisa mengirim ulang ke sheet. */
  canManage: boolean;
  sheetsConnected: boolean;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const router = useRouter();
  const toast = useToast();

  const [list, setList] = useState(requests);
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState("all");
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((r) => {
      if (dept !== "all" && r.department !== dept) return false;
      if (!q) return true;
      return [r.description, r.vendorName ?? "", r.requesterName, r.email].some((f) => f.toLowerCase().includes(q));
    });
  }, [list, query, dept]);

  const total = useMemo(() => filtered.reduce((s, r) => s + r.totalAmount, 0), [filtered]);
  const gagal = useMemo(() => filtered.filter((r) => r.sheetStatus !== "synced").length, [filtered]);

  async function retry(r: PaymentRequest) {
    setBusyId(r.id);
    try {
      const res = await fetch("/api/payment-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.request) {
        toast.error(apiErrorMessage(data?.error, locale, res.status));
        return;
      }
      setList((cur) => cur.map((x) => (x.id === r.id ? (data.request as PaymentRequest) : x)));
      if (data.ok) toast.success(t.retried);
      else toast.error(`${t.createdSheetFail} ${data.reason ?? ""}`.trim());
      router.refresh();
    } catch {
      toast.error(t.connection);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      {!sheetsConnected && (
        <p className="flex items-start gap-2 rounded-2xl border border-gold/40 bg-gold-soft/50 px-3.5 py-2.5 text-xs text-[#8a6512]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {t.notConfigured}
        </p>
      )}

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.searchPh} aria-label={t.searchPh} className="pl-9" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <Select value={dept} onChange={(e) => setDept(e.target.value)} aria-label={t.allDept} className="min-w-0 sm:w-44">
            <option value="all">{t.allDept}</option>
            {Object.entries(DEPT_LABEL[locale]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
          <Button onClick={() => setOpen(true)} className="shrink-0" disabled={!employeeId}>
            <Plus className="h-4 w-4" /> {t.submit}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span key={filtered.length} className="animate-count-up font-semibold text-ink tabular-nums">
          {filtered.length} {t.count}
        </span>
        <span className="text-line">·</span>
        <span key={total} className="animate-count-up text-muted tabular-nums">{rupiah(total, { compact: true })}</span>
        {gagal > 0 && (
          <>
            <span className="text-line">·</span>
            <span className="font-medium text-clay tabular-nums">{gagal} {t.failed.toLowerCase()}</span>
          </>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-cream/40 px-5 py-12 text-center">
          <ReceiptText className="mx-auto h-8 w-8 text-faint" />
          <p className="mt-2 text-sm text-faint">{list.length === 0 ? t.empty : t.emptyFiltered}</p>
          {list.length === 0 && employeeId && (
            <>
              <p className="mx-auto mt-1 max-w-md text-xs text-faint">{t.emptyHint}</p>
              <Button className="mt-4" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" /> {t.emptyCta}
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-panel">
          <div className={cn("hidden items-center gap-3 border-b border-line bg-cream/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-faint xl:grid", COLS)}>
            <span>{t.colRequest}</span>
            <span>{t.colDept}</span>
            <span className="text-right">{t.colAmount}</span>
            <span>{t.colSheet}</span>
          </div>
          <div className="divide-y divide-line">
            {filtered.map((r, i) => (
              <div
                key={r.id}
                style={{ ["--i" as string]: Math.min(i, MAX_STAGGER) }}
                className={cn("stagger-item grid items-center gap-3 px-3 py-2.5", COLS)}
              >
                <span className="block min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{composeInvoiceLine(r)}</span>
                  <span className="mt-0.5 block truncate text-xs text-faint">
                    {r.requesterName} · {KIND_LABEL[locale][r.kind]}
                    {r.kind === "other" && r.kindOther ? `: ${r.kindOther}` : ""} ·{" "}
                    {formatDate(r.submittedAt, "short", locale)}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted tabular-nums xl:hidden">
                    {DEPT_LABEL[locale][r.department]} · {rupiah(r.totalAmount)}
                  </span>
                </span>

                <span className="hidden min-w-0 truncate text-sm text-muted xl:block">{DEPT_LABEL[locale][r.department]}</span>
                <span className="hidden min-w-0 truncate text-right text-sm text-ink tabular-nums xl:block">
                  {rupiah(r.totalAmount)}
                </span>

                <span className="flex shrink-0 items-center justify-end gap-1.5 xl:justify-start">
                  {r.sheetStatus === "synced" ? (
                    <Badge tone="matcha" className="!px-2 !py-0.5 !text-[10px]">
                      <CheckCircle2 className="h-3 w-3" /> {t.synced}
                    </Badge>
                  ) : (
                    <>
                      <Badge tone="clay" className="!px-2 !py-0.5 !text-[10px]">{t.failed}</Badge>
                      {canManage && (
                        <button
                          onClick={() => retry(r)}
                          disabled={busyId === r.id}
                          title={r.sheetError ?? undefined}
                          aria-label={t.retry}
                          className="cursor-pointer rounded-lg p-1 text-muted transition-colors hover:bg-sand hover:text-ink disabled:opacity-50"
                        >
                          <RefreshCw className={cn("h-3.5 w-3.5", busyId === r.id && "animate-spin")} />
                        </button>
                      )}
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title={t.formTitle} width="lg">
        {open && employeeId && (
          <PaymentForm
            employeeId={employeeId}
            name={name}
            email={email}
            onSaved={(saved, sheet) => {
              setOpen(false);
              setList((cur) => [saved, ...cur]);
              if (sheet.ok) toast.success(t.createdSheetOk);
              else toast.error(`${t.createdSheetFail}`);
              router.refresh();
            }}
            onCancel={() => setOpen(false)}
          />
        )}
      </Sheet>
    </div>
  );
}
