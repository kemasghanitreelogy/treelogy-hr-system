"use client";

import { Check, CheckCircle2, Loader2, Paperclip, RefreshCw, Send, ShieldCheck, X } from "lucide-react";
import type { PaymentRequest } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { cn, formatDate, rupiah } from "@/lib/utils";
import {
  APPROVAL_LABEL, APPROVAL_TONE, DEPT_LABEL, FLOW_LABEL, KIND_LABEL, composeInvoiceLine,
  eligibleForSheet,
} from "@/lib/payment-request";
import { useLocale } from "@/components/layout/locale-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RevisionBanner } from "@/components/ui/revision-banner";
import { Step, type StepState } from "@/components/ui/step-timeline";
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
    flow: "Alur persetujuan",
    stepSubmitted: "Diajukan",
    stepOps: "Persetujuan Tahap 1 (Ops/GA)",
    stepFinal: "Persetujuan Akhir (Finance)",
    hintWaitOps: "Menunggu persetujuan tahap 1.",
    hintWaitFinal: "Lolos tahap 1 — menunggu persetujuan Finance.",
    hintAfterOps: "Menyusul setelah tahap 1 disetujui.",
    byPrefix: "Disetujui", rejPrefix: "Ditolak",
    actionHintOps: "Persetujuan Anda = tahap 1 dari 2. Setelah ini pengajuan menunggu Finance.",
    actionHintFinal: "Persetujuan Anda bersifat FINAL — barisnya langsung dikirim ke Google Sheet keuangan.",
    approve: "Setujui", reject: "Tolak", deciding: "Menyimpan…",
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
    flow: "Approval flow",
    stepSubmitted: "Submitted",
    stepOps: "Step-1 Approval (Ops/GA)",
    stepFinal: "Final Approval (Finance)",
    hintWaitOps: "Awaiting step-1 approval.",
    hintWaitFinal: "Cleared step 1 — awaiting Finance approval.",
    hintAfterOps: "Follows once step 1 is approved.",
    byPrefix: "Approved by", rejPrefix: "Rejected by",
    actionHintOps: "Your approval is step 1 of 2. The request then awaits Finance.",
    actionHintFinal: "Your approval is FINAL — the row is written to the finance Google Sheet right away.",
    approve: "Approve", reject: "Reject", deciding: "Saving…",
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
  canDecide,
  canRevise,
  busy,
  decideBusy,
  onResend,
  onApprove,
  onReject,
  onRevise,
}: {
  request: PaymentRequest;
  canManage: boolean;
  /** Boleh memutus tahap yang sedang berjalan (jalur dinas). */
  canDecide: boolean;
  /** Pengaju sendiri & pengajuan dinas ditolak. */
  canRevise: boolean;
  busy: boolean;
  decideBusy: boolean;
  onResend: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRevise: () => void;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const invoices = r.invoicePaths ?? [];
  const dinas = r.flow === "dinas";
  const rejectedAtFinal = r.approvalStatus === "rejected" && !!r.opsApprovedAt;
  const opsState: StepState = r.approvalStatus === "rejected" && !r.opsApprovedAt
    ? "rejected"
    : r.opsApprovedAt ? "done"
    : r.approvalStatus === "waiting_ops" ? "current" : "upcoming";
  const finalState: StepState = rejectedAtFinal
    ? "rejected"
    : r.approvalStatus === "approved" ? "done"
    : r.approvalStatus === "waiting_finance" ? "current" : "upcoming";
  const who = (name?: string | null, at?: string | null, prefix?: string) => (
    <>
      {prefix} <span className="font-medium text-ink">{name || t.none}</span>
      {at && <> · {formatDate(at, "long", locale)}</>}
    </>
  );

  return (
    <div className="animate-flip-in space-y-4">
      {/* Judul: baris persis seperti yang tercatat di sheet keuangan */}
      <div>
        <p className="text-xs font-medium text-faint">{t.sheetLine}</p>
        <h3 className="mt-0.5 font-display text-lg font-semibold leading-tight text-ink">
          {composeInvoiceLine(r)}
        </h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <p className="font-display text-2xl font-bold text-forest-700 tabular-nums">{rupiah(r.totalAmount)}</p>
          <Badge tone={dinas ? "sky" : "neutral"}>{FLOW_LABEL[locale][r.flow]}</Badge>
          {dinas && (
            <Badge tone={APPROVAL_TONE[r.approvalStatus]} dot>
              {APPROVAL_LABEL[locale][r.approvalStatus]}
            </Badge>
          )}
        </div>
      </div>

      {dinas && (
        <RevisionBanner
          rejectionReason={r.approvalStatus === "rejected" ? r.rejectionReason : null}
          rejectedBy={r.rejectedBy}
          revisionNote={r.approvalStatus !== "rejected" ? r.revisionNote : null}
          canRevise={canRevise}
          onRevise={onRevise}
        />
      )}

      {/* Garis waktu dua tahap — hanya relevan untuk jalur dinas. */}
      {dinas && (
        <div className="rounded-2xl border border-line bg-panel p-3.5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-faint">{t.flow}</p>
          <Step state="done" title={t.stepSubmitted} detail={who(r.requesterName, r.submittedAt)} />
          <Step
            state={opsState}
            title={t.stepOps}
            detail={
              opsState === "rejected" ? who(r.rejectedBy, r.rejectedAt, t.rejPrefix)
                : r.opsApprovedAt ? who(r.opsApprover, r.opsApprovedAt, t.byPrefix)
                : t.hintWaitOps
            }
          />
          <Step
            state={finalState}
            title={t.stepFinal}
            last
            detail={
              finalState === "rejected" ? who(r.rejectedBy, r.rejectedAt, t.rejPrefix)
                : finalState === "done" ? who(r.financeApprover, r.financeApprovedAt, t.byPrefix)
                : finalState === "current" ? t.hintWaitFinal
                : t.hintAfterOps
            }
          />
          {canDecide && (
            <div className="mt-3 border-t border-line pt-3">
              <p className="mb-2 text-[11px] text-faint">
                {r.approvalStatus === "waiting_ops" ? t.actionHintOps : t.actionHintFinal}
              </p>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={onApprove} disabled={decideBusy}>
                  {decideBusy ? <Loader2 className="h-4 w-4 animate-spin" />
                    : r.approvalStatus === "waiting_ops" ? <Send className="h-4 w-4" />
                    : <Check className="h-4 w-4" />}
                  {decideBusy ? t.deciding : t.approve}
                </Button>
                <Button variant="danger" className="flex-1" onClick={onReject} disabled={decideBusy}>
                  <X className="h-4 w-4" /> {t.reject}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

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

      {/* Status salinan ke sheet — hanya setelah barisnya memang boleh masuk. */}
      {eligibleForSheet(r) && (
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
      )}
    </div>
  );
}
