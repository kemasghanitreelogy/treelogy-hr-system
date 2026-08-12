"use client";

import { useState } from "react";
import { Check, Clock3, Loader2, Paperclip, ShieldCheck, Send, X } from "lucide-react";
import type { PaymentRequest } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { cn, formatDate, rupiah } from "@/lib/utils";
import {
  APPROVAL_LABEL, APPROVAL_TONE, DEPT_LABEL, KIND_LABEL, composeInvoiceLine, rejectedAtStage,
} from "@/lib/payment-request";
import { useLocale } from "@/components/layout/locale-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RejectDialog } from "@/components/ui/reject-dialog";
import { PaymentFile } from "./payment-file";

const STR: Record<Locale, Record<string, string>> = {
  id: {
    sheetLine: "Ringkasan pengajuan",
    requester: "Pengaju", email: "Email", dept: "Departemen", kind: "Jenis",
    invoiceDate: "Tanggal invoice", desc: "Deskripsi", vendor: "Vendor",
    amount: "Total nominal", due: "Jatuh tempo", more: "Detail tambahan",
    submitted: "Diajukan", none: "—",
    invoices: "Lampiran faktur", approval: "Bukti persetujuan atasan",
    flow: "Alur persetujuan",
    step1: "Diajukan",
    step2: "Persetujuan Operasional",
    step3: "Diproses Finance",
    waitingOpsHint: "Menunggu persetujuan tahap 1 (Ops).",
    waitingFinanceHint: "Lolos tahap Ops — menunggu diproses Finance.",
    afterOpsHint: "Menyusul setelah tahap Ops disetujui.",
    approvedBy: "Disetujui",
    rejectedBy: "Ditolak",
    reason: "Alasan penolakan",
    approve: "Setujui",
    reject: "Tolak",
    deciding: "Menyimpan…",
    opsActionHint: "Setelah disetujui, pengajuan otomatis masuk antrean Finance di sistem.",
    financeActionHint: "Menyetujui berarti pembayaran selesai diproses Finance.",
  },
  en: {
    sheetLine: "Request summary",
    requester: "Requester", email: "Email", dept: "Department", kind: "Type",
    invoiceDate: "Invoice date", desc: "Description", vendor: "Vendor",
    amount: "Total amount", due: "Due date", more: "More details",
    submitted: "Submitted", none: "—",
    invoices: "Invoice attachments", approval: "Dept. head approval",
    flow: "Approval flow",
    step1: "Submitted",
    step2: "Ops Approval",
    step3: "Finance Processing",
    waitingOpsHint: "Awaiting step-1 (Ops) approval.",
    waitingFinanceHint: "Cleared Ops — awaiting Finance processing.",
    afterOpsHint: "Follows once Ops approves.",
    approvedBy: "Approved by",
    rejectedBy: "Rejected by",
    reason: "Rejection reason",
    approve: "Approve",
    reject: "Reject",
    deciding: "Saving…",
    opsActionHint: "Once approved, the request joins the Finance queue in the system.",
    financeActionHint: "Approving marks the payment as processed by Finance.",
  },
};

type StepState = "done" | "current" | "rejected" | "upcoming";

/**
 * Satu langkah pada garis waktu persetujuan. Garis penghubung digambar per
 * langkah (di bawah ikonnya) supaya warnanya mengikuti sejauh mana alur sudah
 * berjalan — hijau untuk yang terlewati, abu untuk yang belum.
 */
function Step({
  state,
  title,
  detail,
  last = false,
}: {
  state: StepState;
  title: string;
  detail: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1",
            state === "done" && "bg-forest-600 text-cream ring-forest-600",
            state === "current" && "bg-gold-soft text-[#8a6512] ring-gold",
            state === "rejected" && "bg-clay text-cream ring-clay",
            state === "upcoming" && "bg-cream text-faint ring-line",
          )}
        >
          {state === "done" && <Check className="h-4 w-4" />}
          {state === "current" && <Clock3 className="h-4 w-4" />}
          {state === "rejected" && <X className="h-4 w-4" />}
          {state === "upcoming" && <span className="h-1.5 w-1.5 rounded-full bg-line" />}
        </span>
        {!last && (
          <span className={cn("w-px flex-1 min-h-4", state === "done" ? "bg-forest-300" : "bg-line")} />
        )}
      </div>
      <div className={cn("min-w-0 pb-4", last && "pb-0")}>
        <p
          className={cn(
            "text-sm font-semibold leading-7",
            state === "upcoming" ? "text-faint" : state === "rejected" ? "text-clay" : "text-ink",
          )}
        >
          {title}
        </p>
        <div className="text-xs text-muted">{detail}</div>
      </div>
    </div>
  );
}

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
  canApproveOps,
  decideBusy,
  onDecide,
}: {
  request: PaymentRequest;
  canManage: boolean;
  /** Boleh memutus tahap 1 (Admin Operasional; Finance/HR sebagai cadangan). */
  canApproveOps: boolean;
  decideBusy: boolean;
  onDecide: (action: "approve" | "reject", reason?: string) => void;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const invoices = r.invoicePaths ?? [];
  const [rejecting, setRejecting] = useState(false);

  const rejectedStage = rejectedAtStage(r);
  const opsState: StepState =
    rejectedStage === "ops" ? "rejected" : r.opsApprovedAt ? "done" : r.approvalStatus === "waiting_ops" ? "current" : "upcoming";
  const financeState: StepState =
    rejectedStage === "finance" ? "rejected"
      : r.approvalStatus === "approved" ? "done"
      : r.approvalStatus === "waiting_finance" ? "current"
      : "upcoming";

  // Giliran siapa sekarang → tombol keputusan hanya untuk yang berhak di tahap itu.
  const myTurn =
    (r.approvalStatus === "waiting_ops" && canApproveOps) ||
    (r.approvalStatus === "waiting_finance" && canManage);

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
          <p className="font-display text-2xl font-bold text-forest-700 tabular-nums">
            {rupiah(r.totalAmount)}
          </p>
          <Badge tone={APPROVAL_TONE[r.approvalStatus]} dot>
            {APPROVAL_LABEL[locale][r.approvalStatus]}
          </Badge>
        </div>
      </div>

      {/* Garis waktu dua tahap — siapa pun yang membuka langsung tahu pengajuan
          ini sedang di meja siapa, sudah lewat mana, dan kenapa bila ditolak. */}
      <div className="rounded-2xl border border-line bg-panel p-3.5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-faint">{t.flow}</p>
        <Step state="done" title={t.step1} detail={who(r.requesterName, r.submittedAt)} />
        <Step
          state={opsState}
          title={t.step2}
          detail={
            opsState === "done" ? who(r.opsApprover, r.opsApprovedAt, t.approvedBy)
              : opsState === "rejected" ? who(r.rejectedBy, r.rejectedAt, t.rejectedBy)
              : t.waitingOpsHint
          }
        />
        <Step
          state={financeState}
          title={t.step3}
          last
          detail={
            financeState === "done" ? who(r.financeApprover, r.financeApprovedAt, t.approvedBy)
              : financeState === "rejected" ? who(r.rejectedBy, r.rejectedAt, t.rejectedBy)
              : financeState === "current" ? t.waitingFinanceHint
              : t.afterOpsHint
          }
        />

        {r.approvalStatus === "rejected" && r.rejectionReason && (
          <p className="mt-3 rounded-xl border border-clay/30 bg-clay-soft/50 px-3 py-2 text-xs text-[#8c3c1f]">
            <span className="font-semibold">{t.reason}:</span> {r.rejectionReason}
          </p>
        )}

        {myTurn && (
          <div className="mt-3 border-t border-line pt-3">
            <p className="mb-2 text-[11px] text-faint">
              {r.approvalStatus === "waiting_ops" ? t.opsActionHint : t.financeActionHint}
            </p>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => onDecide("approve")} disabled={decideBusy}>
                {decideBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : r.approvalStatus === "waiting_ops" ? <Send className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                {decideBusy ? t.deciding : t.approve}
              </Button>
              <Button variant="danger" className="flex-1" onClick={() => setRejecting(true)} disabled={decideBusy}>
                <X className="h-4 w-4" /> {t.reject}
              </Button>
            </div>
          </div>
        )}
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

      <RejectDialog
        open={rejecting}
        busy={decideBusy}
        onCancel={() => setRejecting(false)}
        onConfirm={(reason) => {
          setRejecting(false);
          onDecide("reject", reason);
        }}
      />
    </div>
  );
}
