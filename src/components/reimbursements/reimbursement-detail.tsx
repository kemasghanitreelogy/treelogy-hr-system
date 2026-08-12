"use client";

import { Check, Loader2, Paperclip, RotateCcw, Send, X } from "lucide-react";
import type { TravelReimbursement } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { formatDate, rupiah } from "@/lib/utils";
import { REIMB_CATEGORY_LABEL, tripDuration } from "@/lib/reimbursement";
import { useLocale } from "@/components/layout/locale-context";
import { ApprovalStatus } from "@/components/ui/approval-status";
import { Button } from "@/components/ui/button";
import { RevisionBanner } from "@/components/ui/revision-banner";
import { Step, type StepState } from "@/components/ui/step-timeline";
import { PaymentFile } from "@/components/payment-requests/payment-file";

const STR: Record<Locale, Record<string, string>> = {
  id: {
    employee: "Karyawan",
    jobTitle: "Jabatan",
    purpose: "Keperluan",
    trip: "Tanggal perjalanan",
    duration: "Lama",
    expenseDate: "Tanggal biaya",
    category: "Kategori",
    description: "Deskripsi biaya",
    receiptNumber: "Nomor kuitansi",
    amount: "Nominal klaim",
    requestedAt: "Diajukan",
    none: "—",
    receipts: "Bukti / kuitansi",
    flow: "Alur persetujuan",
    stepSubmitted: "Diajukan",
    stepOps: "Persetujuan Tahap 1 (Ops/GA)",
    stepFinal: "Persetujuan Akhir (Finance)",
    hintWaitOps: "Menunggu persetujuan tahap 1.",
    hintWaitFinal: "Lolos tahap 1 — menunggu persetujuan Finance.",
    hintAfterOps: "Menyusul setelah tahap 1 disetujui.",
    byPrefix: "Disetujui",
    rejPrefix: "Ditolak",
    actionHintOps: "Persetujuan Anda = tahap 1 dari 2. Setelah ini klaim menunggu persetujuan akhir Finance.",
    actionHintFinal: "Persetujuan Anda bersifat FINAL (tahap 2 dari 2) — klaim siap dibayarkan.",
    approve: "Setujui",
    reject: "Tolak",
    reset: "Kembalikan ke menunggu",
    working: "Memproses…",
  },
  en: {
    employee: "Employee",
    jobTitle: "Position",
    purpose: "Purpose",
    trip: "Trip dates",
    duration: "Duration",
    expenseDate: "Expense date",
    category: "Category",
    description: "Expense description",
    receiptNumber: "Receipt number",
    amount: "Claim amount",
    requestedAt: "Submitted",
    none: "—",
    receipts: "Receipts",
    flow: "Approval flow",
    stepSubmitted: "Submitted",
    stepOps: "Step-1 Approval (Ops/GA)",
    stepFinal: "Final Approval (Finance)",
    hintWaitOps: "Awaiting step-1 approval.",
    hintWaitFinal: "Cleared step 1 — awaiting Finance approval.",
    hintAfterOps: "Follows once step 1 is approved.",
    byPrefix: "Approved by",
    rejPrefix: "Rejected by",
    actionHintOps: "Your approval is step 1 of 2. The claim then awaits the final Finance approval.",
    actionHintFinal: "Your approval is FINAL (step 2 of 2) — the claim is ready for payment.",
    approve: "Approve",
    reject: "Reject",
    reset: "Reset to pending",
    working: "Processing…",
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

export function ReimbursementDetail({
  request: r,
  employeeName,
  canDecide,
  canReset,
  canRevise,
  busy,
  onApprove,
  onReject,
  onReset,
  onRevise,
}: {
  request: TravelReimbursement;
  employeeName: string;
  /** Boleh memutus TAHAP YANG SEDANG berjalan (bukan klaim sendiri). */
  canDecide: boolean;
  canReset: boolean;
  /** Pengaju sendiri & klaim masih bisa diperbaiki (menunggu / ditolak). */
  canRevise: boolean;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onReset: () => void;
  onRevise: () => void;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const receipts = r.receiptPaths ?? [];

  const rejectedAtFinal = r.status === "rejected" && !!r.managerApprover;
  const opsState: StepState = r.status === "rejected" && !r.managerApprover
    ? "rejected"
    : r.managerApprover || r.status === "approved"
      ? "done"
      : "current";
  const finalState: StepState = rejectedAtFinal
    ? "rejected"
    : r.status === "approved"
      ? "done"
      : r.managerApprover
        ? "current"
        : "upcoming";

  const who = (name?: string | null, at?: string | null, prefix?: string) => (
    <>
      {prefix} <span className="font-medium text-ink">{name || t.none}</span>
      {at && <> · {formatDate(at, "long", locale)}</>}
    </>
  );

  return (
    <div className="animate-flip-in space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold leading-tight text-ink">{r.description}</h3>
          <p className="mt-0.5 text-sm text-muted">
            {employeeName} · {r.jobTitle}
          </p>
          <p className="mt-1.5 font-display text-2xl font-bold text-forest-700 tabular-nums">
            {rupiah(r.amount)}
          </p>
        </div>
        <ApprovalStatus request={r} twoStep />
      </div>

      <RevisionBanner
        rejectionReason={r.status === "rejected" ? r.rejectionReason : null}
        rejectedBy={r.approver}
        revisionNote={r.status !== "rejected" ? r.revisionNote : null}
        canRevise={canRevise}
        onRevise={onRevise}
      />

      {/* Garis waktu dua tahap — sama seperti perjalanan dinas. */}
      <div className="rounded-2xl border border-line bg-panel p-3.5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-faint">{t.flow}</p>
        <Step state="done" title={t.stepSubmitted} detail={who(employeeName, r.requestedAt)} />
        <Step
          state={opsState}
          title={t.stepOps}
          detail={
            opsState === "rejected" ? who(r.approver, null, t.rejPrefix)
              : r.managerApprover ? who(r.managerApprover, r.managerApprovedAt, t.byPrefix)
              : t.hintWaitOps
          }
        />
        <Step
          state={finalState}
          title={t.stepFinal}
          last
          detail={
            finalState === "rejected" ? who(r.approver, null, t.rejPrefix)
              : finalState === "done" ? who(r.hrApprover ?? r.approver, r.hrApprovedAt, t.byPrefix)
              : finalState === "current" ? t.hintWaitFinal
              : t.hintAfterOps
          }
        />
      </div>

      {/* Bukti didahulukan — inilah yang diperiksa penyetuju. */}
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-faint">
          <Paperclip className="h-3.5 w-3.5" /> {t.receipts} ({receipts.length})
        </p>
        {receipts.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {receipts.map((p, i) => (
              <PaymentFile
                key={p}
                path={p}
                index={i}
                total={receipts.length}
                api="/api/reimbursements/file"
                className="aspect-[4/3]"
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-faint">{t.none}</p>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-panel divide-y divide-line">
        <Row label={t.employee}>{employeeName}</Row>
        <Row label={t.jobTitle}>{r.jobTitle}</Row>
        <Row label={t.purpose}>{r.purpose}</Row>
        <Row label={t.trip}>
          <span className="tabular-nums">
            {formatDate(r.startDate, "long", locale)} — {formatDate(r.endDate, "long", locale)}
          </span>
          <span className="mt-0.5 block text-xs text-faint">
            {t.duration}: {tripDuration(r.startDate, r.endDate)} hari
          </span>
        </Row>
        <Row label={t.expenseDate}>{formatDate(r.expenseDate, "long", locale)}</Row>
        <Row label={t.category}>{REIMB_CATEGORY_LABEL[locale][r.category]}</Row>
        <Row label={t.description}>{r.description}</Row>
        <Row label={t.receiptNumber}>
          {r.receiptNumber ? <span className="font-mono text-xs">{r.receiptNumber}</span> : t.none}
        </Row>
        <Row label={t.amount}>
          <span className="font-semibold tabular-nums">{rupiah(r.amount)}</span>
        </Row>
        <Row label={t.requestedAt}>{formatDate(r.requestedAt, "long", locale)}</Row>
      </div>

      {(canDecide || canReset) && (
        <div className="space-y-2">
          {/* Penyetuju tahu persis bobot klik-nya: tahap 1 meneruskan, tahap 2 final. */}
          {canDecide && (
            <p className="text-[11px] leading-snug text-faint">
              {r.managerApprover ? t.actionHintFinal : t.actionHintOps}
            </p>
          )}
          <div className="flex gap-2">
            {canDecide && (
              <>
                <Button variant="outline" className="flex-1" onClick={onReject} disabled={busy}>
                  <X className="h-4 w-4" /> {t.reject}
                </Button>
                <Button className="flex-1" onClick={onApprove} disabled={busy}>
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : r.managerApprover ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {busy ? t.working : t.approve}
                </Button>
              </>
            )}
            {canReset && !canDecide && (
              <Button variant="outline" className="flex-1" onClick={onReset} disabled={busy}>
                <RotateCcw className="h-4 w-4" /> {t.reset}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
