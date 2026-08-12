"use client";

import { CheckCircle2, Paperclip, RefreshCw, ShieldCheck } from "lucide-react";
import type { PaymentRequest } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { cn, formatDate, rupiah } from "@/lib/utils";
import { DEPT_LABEL, KIND_LABEL, composeInvoiceLine } from "@/lib/payment-request";
import { useLocale } from "@/components/layout/locale-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PaymentFile } from "./payment-file";

const STR: Record<Locale, Record<string, string>> = {
  id: {
    sheetLine: "Ringkasan pengajuan",
    requester: "Pengaju", email: "Email", dept: "Departemen", kind: "Jenis",
    invoiceDate: "Tanggal invoice", desc: "Deskripsi", vendor: "Vendor",
    amount: "Total nominal", due: "Jatuh tempo", more: "Detail tambahan",
    submitted: "Diajukan", none: "—",
    invoices: "Lampiran faktur", approval: "Bukti persetujuan atasan",
    sheetStatus: "Status Google Sheet", synced: "Sudah masuk sheet", failed: "Belum masuk sheet",
    resend: "Kirim ulang ke sheet", resending: "Mengirim…", sheetError: "Sebab terakhir",
  },
  en: {
    sheetLine: "Request summary",
    requester: "Requester", email: "Email", dept: "Department", kind: "Type",
    invoiceDate: "Invoice date", desc: "Description", vendor: "Vendor",
    amount: "Total amount", due: "Due date", more: "More details",
    submitted: "Submitted", none: "—",
    invoices: "Invoice attachments", approval: "Dept. head approval",
    sheetStatus: "Google Sheet status", synced: "Written to the sheet", failed: "Not in the sheet",
    resend: "Resend to the sheet", resending: "Sending…", sheetError: "Last reason",
  },
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2.5">
      <span className="shrink-0 text-xs font-medium text-faint">{label}</span>
      <span className="min-w-0 break-words text-right text-sm text-ink">{children}</span>
    </div>
  );
}

export function PaymentDetail({
  request: r,
  canManage,
  busy,
  onResend,
}: {
  request: PaymentRequest;
  canManage: boolean;
  busy: boolean;
  onResend: () => void;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const invoices = r.invoicePaths ?? [];

  return (
    <div className="animate-flip-in space-y-4">
      {/* Judul: baris persis seperti yang tercatat di sheet keuangan */}
      <div>
        <p className="text-xs font-medium text-faint">{t.sheetLine}</p>
        <h3 className="mt-0.5 font-display text-lg font-semibold leading-tight text-ink">
          {composeInvoiceLine(r)}
        </h3>
        <p className="mt-1.5 font-display text-2xl font-bold text-forest-700 tabular-nums">
          {rupiah(r.totalAmount)}
        </p>
      </div>

      {/* Lampiran didahulukan — inilah yang dicari orang saat membuka detail */}
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-faint">
          <Paperclip className="h-3.5 w-3.5" /> {t.invoices} ({invoices.length})
        </p>
        {invoices.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {invoices.map((p, i) => (
              <PaymentFile key={p} path={p} index={i} total={invoices.length} className="aspect-[4/3]" />
            ))}
          </div>
        ) : (
          <p className="text-xs text-faint">{t.none}</p>
        )}
      </div>

      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-faint">
          <ShieldCheck className="h-3.5 w-3.5" /> {t.approval}
        </p>
        {r.approvalPath ? (
          <PaymentFile path={r.approvalPath} className="aspect-[4/3] max-w-[12rem]" />
        ) : (
          <p className="text-xs text-faint">{t.none}</p>
        )}
      </div>

      {/* Rincian */}
      <div className="overflow-hidden rounded-2xl border border-line bg-panel divide-y divide-line">
        <Row label={t.requester}>{r.requesterName}</Row>
        <Row label={t.email}>{r.email}</Row>
        <Row label={t.dept}>{DEPT_LABEL[locale][r.department]}</Row>
        <Row label={t.kind}>
          {KIND_LABEL[locale][r.kind]}
          {r.kind === "other" && r.kindOther ? `: ${r.kindOther}` : ""}
        </Row>
        <Row label={t.invoiceDate}>
          {r.invoiceDate ? formatDate(r.invoiceDate, "long", locale) : t.none}
        </Row>
        <Row label={t.desc}>{r.description}</Row>
        <Row label={t.vendor}>{r.vendorName || t.none}</Row>
        <Row label={t.amount}>
          <span className="font-semibold tabular-nums">{rupiah(r.totalAmount)}</span>
        </Row>
        {r.dueDate && <Row label={t.due}>{formatDate(r.dueDate, "long", locale)}</Row>}
        {r.moreDetails && <Row label={t.more}>{r.moreDetails}</Row>}
        <Row label={t.submitted}>{formatDate(r.submittedAt, "long", locale)}</Row>
      </div>

      {/* Status salinan ke sheet — beserta sebabnya bila gagal, bukan sekadar "gagal" */}
      <div className="rounded-2xl border border-line bg-panel p-3.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-faint">{t.sheetStatus}</span>
          {r.sheetStatus === "synced" ? (
            <Badge tone="matcha" className="!px-2 !py-0.5 !text-[10px]">
              <CheckCircle2 className="h-3 w-3" /> {t.synced}
            </Badge>
          ) : (
            <Badge tone="clay" className="!px-2 !py-0.5 !text-[10px]">{t.failed}</Badge>
          )}
        </div>
        {r.sheetStatus !== "synced" && r.sheetError && (
          <p className="mt-2 break-words border-t border-line pt-2 text-[11px] text-muted">
            <span className="font-medium">{t.sheetError}:</span> {r.sheetError}
          </p>
        )}
        {r.sheetStatus !== "synced" && canManage && (
          <Button variant="outline" size="sm" className="mt-3 w-full" onClick={onResend} disabled={busy}>
            <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} />
            {busy ? t.resending : t.resend}
          </Button>
        )}
      </div>
    </div>
  );
}
