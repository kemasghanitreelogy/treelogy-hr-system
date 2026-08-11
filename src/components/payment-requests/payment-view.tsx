"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronRight, Download, Plus, ReceiptText, RefreshCw, Search } from "lucide-react";
import type { PaymentRequest } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { apiErrorMessage } from "@/lib/api-error";
import { cn, formatDate, rupiah } from "@/lib/utils";
import {
  APPROVAL_LABEL, APPROVAL_STATUSES, APPROVAL_TONE, DEPT_LABEL, KIND_LABEL, composeInvoiceLine,
} from "@/lib/payment-request";
import { useLocale } from "@/components/layout/locale-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { PaymentDetail } from "./payment-detail";
import { PaymentExport } from "./payment-export";
import { PaymentForm } from "./payment-form";

/** Tautan lampiran bertanda tangan, dihitung di server, dikunci per pengajuan. */
export type PaymentFileLinks = Record<string, { invoices: string[]; approval: string }>;

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
    colRequest: "Pengajuan", colDept: "Departemen", colAmount: "Nominal", colStatus: "Status",
    synced: "Masuk sheet", pendingSync: "Menunggu", failed: "Gagal masuk sheet",
    retry: "Kirim ulang ke sheet",
    allStatus: "Semua status",
    created: "Pengajuan terkirim — menunggu persetujuan Ops ✓",
    createdSheetFail: "Pengajuan tersimpan, tapi belum masuk Google Sheet.",
    retried: "Berhasil masuk Google Sheet ✓",
    opsApproved: "Disetujui — diteruskan ke Finance ✓",
    opsApprovedSheetFail: "Disetujui, tapi belum masuk Google Sheet — kirim ulang dari detail.",
    financeApproved: "Pembayaran selesai diproses ✓",
    rejected: "Pengajuan ditolak.",
    waitingOpsShort: "menunggu ops",
    waitingFinanceShort: "menunggu finance",
    connection: "Koneksi bermasalah. Coba lagi.",
    count: "pengajuan",
    detailTitle: "Detail Pengajuan",
    export: "Ekspor", exportTitle: "Ekspor ke Excel",
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
    colRequest: "Request", colDept: "Department", colAmount: "Amount", colStatus: "Status",
    synced: "In sheet", pendingSync: "Pending", failed: "Not in sheet",
    retry: "Resend to sheet",
    allStatus: "All statuses",
    created: "Submitted — awaiting Ops approval ✓",
    createdSheetFail: "Saved, but not yet written to the Google Sheet.",
    retried: "Written to Google Sheet ✓",
    opsApproved: "Approved — forwarded to Finance ✓",
    opsApprovedSheetFail: "Approved, but not yet in the Google Sheet — resend from the detail.",
    financeApproved: "Payment processed ✓",
    rejected: "Request rejected.",
    waitingOpsShort: "awaiting ops",
    waitingFinanceShort: "awaiting finance",
    connection: "Connection problem. Try again.",
    count: "requests",
    detailTitle: "Request Detail",
    export: "Export", exportTitle: "Export to Excel",
    notConfigured:
      "Google Sheet isn't connected yet — requests are still stored safely and can be pushed once credentials are set.",
  },
};

const MAX_STAGGER = 8;
const COLS =
  "grid-cols-[minmax(0,1fr)_auto] " +
  "xl:grid-cols-[minmax(0,1fr)_minmax(0,140px)_minmax(0,150px)_minmax(0,140px)_16px]";

export function PaymentView({
  requests,
  fileLinks,
  today,
  employeeId,
  name,
  email,
  canManage,
  canApproveOps,
  sheetsConnected,
}: {
  requests: PaymentRequest[];
  fileLinks: PaymentFileLinks;
  today: string;
  employeeId: string | null;
  name: string;
  email: string;
  /** Finance/HR — melihat semua, memutus tahap 2, dan bisa mengirim ulang ke sheet. */
  canManage: boolean;
  /** Approver tahap 1 (Admin Operasional; Finance/HR sebagai cadangan). */
  canApproveOps: boolean;
  sheetsConnected: boolean;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const router = useRouter();
  const toast = useToast();

  const [list, setList] = useState(requests);
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState("all");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [decideBusyId, setDecideBusyId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((r) => {
      if (dept !== "all" && r.department !== dept) return false;
      if (status !== "all" && r.approvalStatus !== status) return false;
      if (!q) return true;
      return [r.description, r.vendorName ?? "", r.requesterName, r.email].some((f) => f.toLowerCase().includes(q));
    });
  }, [list, query, dept, status]);

  const total = useMemo(() => filtered.reduce((s, r) => s + r.totalAmount, 0), [filtered]);
  const selected = list.find((x) => x.id === selectedId) ?? null;
  // Gagal masuk sheet hanya relevan untuk baris yang memang sudah waktunya di sheet.
  const gagal = useMemo(
    () =>
      filtered.filter(
        (r) => (r.approvalStatus === "waiting_finance" || r.approvalStatus === "approved") && r.sheetStatus !== "synced",
      ).length,
    [filtered],
  );
  const antre = useMemo(
    () => ({
      ops: filtered.filter((r) => r.approvalStatus === "waiting_ops").length,
      finance: filtered.filter((r) => r.approvalStatus === "waiting_finance").length,
    }),
    [filtered],
  );

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

  async function decide(r: PaymentRequest, action: "approve" | "reject", reason?: string) {
    setDecideBusyId(r.id);
    try {
      const res = await fetch("/api/payment-requests/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, action, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.request) {
        toast.error(apiErrorMessage(data?.error, locale, res.status));
        return;
      }
      const saved = data.request as PaymentRequest;
      setList((cur) => cur.map((x) => (x.id === r.id ? saved : x)));
      if (action === "reject") toast.success(t.rejected);
      else if (saved.approvalStatus === "waiting_finance") {
        if (data.sheet?.ok === false) toast.error(t.opsApprovedSheetFail);
        else toast.success(t.opsApproved);
      } else toast.success(t.financeApproved);
      router.refresh();
    } catch {
      toast.error(t.connection);
    } finally {
      setDecideBusyId(null);
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
          <Select value={dept} onChange={(e) => setDept(e.target.value)} aria-label={t.allDept} className="min-w-0 sm:w-40">
            <option value="all">{t.allDept}</option>
            {Object.entries(DEPT_LABEL[locale]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t.allStatus} className="min-w-0 sm:w-44">
            <option value="all">{t.allStatus}</option>
            {APPROVAL_STATUSES.map((s) => (
              <option key={s} value={s}>{APPROVAL_LABEL[locale][s]}</option>
            ))}
          </Select>
          <Button
            variant="outline"
            onClick={() => setExportOpen(true)}
            className="shrink-0"
            disabled={list.length === 0}
          >
            <Download className="h-4 w-4" /> {t.export}
          </Button>
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
        {antre.ops > 0 && (
          <>
            <span className="text-line">·</span>
            <span className="font-medium text-[#8a6512] tabular-nums">{antre.ops} {t.waitingOpsShort}</span>
          </>
        )}
        {antre.finance > 0 && (
          <>
            <span className="text-line">·</span>
            <span className="font-medium text-sky tabular-nums">{antre.finance} {t.waitingFinanceShort}</span>
          </>
        )}
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
            <span>{t.colStatus}</span>
            <span />
          </div>
          <div className="divide-y divide-line">
            {filtered.map((r, i) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                style={{ ["--i" as string]: Math.min(i, MAX_STAGGER) }}
                className={cn(
                  "stagger-item grid w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-cream/60 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-forest-400",
                  COLS,
                )}
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
                  <Badge tone={APPROVAL_TONE[r.approvalStatus]} dot className="!px-2 !py-0.5 !text-[10px]">
                    {APPROVAL_LABEL[locale][r.approvalStatus]}
                  </Badge>
                  {/* Gagal masuk sheet hanya ditandai bila memang sudah waktunya di sheet */}
                  {(r.approvalStatus === "waiting_finance" || r.approvalStatus === "approved") &&
                    r.sheetStatus !== "synced" && (
                      <>
                        <Badge tone="clay" className="!px-2 !py-0.5 !text-[10px]">{t.failed}</Badge>
                        {canManage && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              retry(r);
                            }}
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
                <ChevronRight className="hidden h-4 w-4 shrink-0 text-faint xl:block" />
              </button>
            ))}
          </div>
        </div>
      )}

      <Sheet
        open={selected !== null}
        onClose={() => setSelectedId(null)}
        title={t.detailTitle}
        width="lg"
      >
        {selected && (
          <PaymentDetail
            request={selected}
            canManage={canManage}
            canApproveOps={canApproveOps}
            busy={busyId === selected.id}
            decideBusy={decideBusyId === selected.id}
            onResend={() => retry(selected)}
            onDecide={(action, reason) => decide(selected, action, reason)}
          />
        )}
      </Sheet>

      <Sheet open={exportOpen} onClose={() => setExportOpen(false)} title={t.exportTitle}>
        {exportOpen && (
          <PaymentExport
            requests={list}
            fileLinks={fileLinks}
            today={today}
            onClose={() => setExportOpen(false)}
          />
        )}
      </Sheet>

      <Sheet open={open} onClose={() => setOpen(false)} title={t.formTitle} width="lg">
        {open && employeeId && (
          <PaymentForm
            employeeId={employeeId}
            name={name}
            email={email}
            onSaved={(saved) => {
              setOpen(false);
              setList((cur) => [saved, ...cur]);
              toast.success(t.created);
              router.refresh();
            }}
            onCancel={() => setOpen(false)}
          />
        )}
      </Sheet>
    </div>
  );
}
