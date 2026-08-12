"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Download, Plus, ReceiptText, Search } from "lucide-react";
import type { PaymentRequest } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { apiErrorMessage } from "@/lib/api-error";
import { cn, formatDate, rupiah } from "@/lib/utils";
import { DEPT_LABEL, KIND_LABEL, composeInvoiceLine } from "@/lib/payment-request";
import { useLocale } from "@/components/layout/locale-context";
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
    colRequest: "Pengajuan", colDept: "Departemen", colAmount: "Nominal",
    created: "Pengajuan tercatat ✓",
    connection: "Koneksi bermasalah. Coba lagi.",
    count: "pengajuan",
    detailTitle: "Detail Pengajuan",
    export: "Ekspor", exportTitle: "Ekspor ke Excel",
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
    colRequest: "Request", colDept: "Department", colAmount: "Amount",
    created: "Request recorded ✓",
    connection: "Connection problem. Try again.",
    count: "requests",
    detailTitle: "Request Detail",
    export: "Export", exportTitle: "Export to Excel",
  },
};

const MAX_STAGGER = 8;
const COLS =
  "grid-cols-[minmax(0,1fr)] " +
  "xl:grid-cols-[minmax(0,1fr)_minmax(0,150px)_minmax(0,160px)_16px]";

export function PaymentView({
  requests,
  fileLinks,
  today,
  employeeId,
  name,
  email,
  canManage,
}: {
  requests: PaymentRequest[];
  fileLinks: PaymentFileLinks;
  today: string;
  employeeId: string | null;
  name: string;
  email: string;
  /** Finance/HR — melihat semua pengajuan. */
  canManage: boolean;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const router = useRouter();
  const toast = useToast();

  const [list, setList] = useState(requests);
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState("all");
  const [open, setOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((r) => {
      if (dept !== "all" && r.department !== dept) return false;
      if (!q) return true;
      return [r.description, r.vendorName ?? "", r.requesterName, r.email].some((f) => f.toLowerCase().includes(q));
    });
  }, [list, query, dept]);

  const total = useMemo(() => filtered.reduce((s, r) => s + r.totalAmount, 0), [filtered]);
  const selected = list.find((x) => x.id === selectedId) ?? null;
  return (
    <div className="space-y-3">
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
          <PaymentDetail request={selected} />
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
