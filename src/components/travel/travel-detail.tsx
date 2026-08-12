"use client";

import { Check, Loader2, Pencil, RotateCcw, Undo2, X } from "lucide-react";
import type { TravelRequest } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { formatDate, rupiah } from "@/lib/utils";
import { TRANSPORT_LABEL } from "@/lib/travel";
import { useLocale } from "@/components/layout/locale-context";
import { PaymentFile } from "@/components/payment-requests/payment-file";
import { ApprovalStatus } from "@/components/ui/approval-status";
import { Step, type StepState } from "@/components/ui/step-timeline";
import { Button } from "@/components/ui/button";
import { RevisionBanner } from "@/components/ui/revision-banner";

const STR: Record<
  Locale,
  {
    employee: string;
    jobTitle: string;
    purpose: string;
    destination: string;
    dates: string;
    duration: (n: number) => string;
    transport: string;
    accommodation: string;
    accYes: string;
    accNo: string;
    costs: string;
    costTransport: string;
    costAccommodation: string;
    costPerDiem: string;
    costOther: string;
    total: string;
    advance: string;
    noAdvance: string;
    remarks: string;
    proof: string;
    noProof: string;
    requestedAt: string;
    flow: string;
    stepSubmitted: string;
    stepOps: string;
    stepFinal: string;
    hintWaitOps: string;
    hintWaitFinal: string;
    hintAfterOps: string;
    byPrefix: string;
    rejPrefix: string;
    legacySingle: string;
    actionHintOps: string;
    actionHintFinal: string;
    approve: string;
    reject: string;
    reset: string;
    revise: string;
    reviseBanner: string;
    fixNow: string;
    working: string;
  }
> = {
  id: {
    employee: "Karyawan",
    jobTitle: "Jabatan",
    purpose: "Keperluan",
    destination: "Tujuan",
    dates: "Tanggal",
    duration: (n) => `${n} hari`,
    transport: "Transportasi",
    accommodation: "Penginapan",
    accYes: "Diperlukan",
    accNo: "Tidak diperlukan",
    costs: "Estimasi biaya",
    costTransport: "Transportasi",
    costAccommodation: "Penginapan",
    costPerDiem: "Uang harian",
    costOther: "Lain-lain",
    total: "Total estimasi",
    advance: "Uang muka diminta",
    noAdvance: "Tidak meminta uang muka",
    remarks: "Catatan",
    proof: "Bukti persetujuan atasan",
    noProof: "Tidak ada — pengajuan dibuat sebelum lampiran diwajibkan.",
    requestedAt: "Diajukan",
    flow: "Alur persetujuan",
    stepSubmitted: "Diajukan",
    stepOps: "Persetujuan Tahap 1 (Ops/GA)",
    stepFinal: "Persetujuan Akhir (Finance)",
    hintWaitOps: "Menunggu persetujuan tahap 1.",
    hintWaitFinal: "Lolos tahap 1 — menunggu persetujuan akhir.",
    hintAfterOps: "Menyusul setelah tahap 1 disetujui.",
    byPrefix: "Disetujui",
    rejPrefix: "Ditolak",
    legacySingle: "Disetujui pada era penyetuju tunggal.",
    actionHintOps: "Persetujuan Anda = tahap 1 dari 2. Setelah ini pengajuan menunggu persetujuan akhir Finance.",
    actionHintFinal: "Persetujuan Anda bersifat FINAL (tahap 2 dari 2) — status berubah menjadi Disetujui.",
    approve: "Setujui",
    reject: "Tolak",
    reset: "Kembalikan ke menunggu",
    revise: "Kembalikan untuk revisi",
    reviseBanner: "Perlu revisi",
    fixNow: "Perbaiki & kirim ulang",
    working: "Memproses…",
  },
  en: {
    employee: "Employee",
    jobTitle: "Job title",
    purpose: "Purpose",
    destination: "Destination",
    dates: "Dates",
    duration: (n) => `${n} day${n === 1 ? "" : "s"}`,
    transport: "Transportation",
    accommodation: "Accommodation",
    accYes: "Required",
    accNo: "Not required",
    costs: "Estimated expenses",
    costTransport: "Transportation",
    costAccommodation: "Accommodation",
    costPerDiem: "Per diem",
    costOther: "Other",
    total: "Estimated total",
    advance: "Advance requested",
    noAdvance: "No advance requested",
    remarks: "Remarks",
    proof: "Supervisor approval proof",
    noProof: "None — submitted before the attachment became mandatory.",
    requestedAt: "Submitted",
    flow: "Approval flow",
    stepSubmitted: "Submitted",
    stepOps: "Step-1 Approval (Ops/GA)",
    stepFinal: "Final Approval (Finance)",
    hintWaitOps: "Awaiting step-1 approval.",
    hintWaitFinal: "Cleared step 1 — awaiting final approval.",
    hintAfterOps: "Follows once step 1 is approved.",
    byPrefix: "Approved by",
    rejPrefix: "Rejected by",
    legacySingle: "Approved in the single-approver era.",
    actionHintOps: "Your approval is step 1 of 2. The request then awaits the final Finance approval.",
    actionHintFinal: "Your approval is FINAL (step 2 of 2) — the status becomes Approved.",
    approve: "Approve",
    reject: "Reject",
    reset: "Reset to pending",
    revise: "Return for revision",
    reviseBanner: "Needs revision",
    fixNow: "Fix & resubmit",
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

function CostRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2">
      <span className={strong ? "text-sm font-medium text-ink" : "text-xs text-muted"}>{label}</span>
      <span
        className={
          strong
            ? "font-display text-base font-bold text-forest-700 tabular-nums"
            : "text-sm text-ink tabular-nums"
        }
      >
        {rupiah(value)}
      </span>
    </div>
  );
}

export function TravelDetail({
  request,
  employeeName,
  canDecide,
  canReset,
  canRevise,
  busy,
  onApprove,
  onReject,
  onReset,
  onReturnForRevision,
  onFix,
}: {
  request: TravelRequest;
  employeeName: string;
  /** Pemegang travel.approve, dan pengajuan masih menunggu. */
  canDecide: boolean;
  /** Penyetuju — mengembalikan keputusan yang sudah final ke status menunggu. */
  canReset: boolean;
  /** Pengaju sendiri, saat pengajuannya dikembalikan untuk diperbaiki. */
  canRevise: boolean;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onReset: () => void;
  onReturnForRevision: () => void;
  onFix: () => void;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const r = request;

  return (
    <div className="animate-flip-in space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold leading-tight text-ink">{r.destination}</h3>
          <p className="mt-0.5 text-sm text-muted">
            {employeeName} · {r.jobTitle}
          </p>
        </div>
        <ApprovalStatus request={r} twoStep />
      </div>

      <RevisionBanner
        rejectionReason={r.status === "rejected" ? r.rejectionReason : null}
        rejectedBy={r.approver}
        canRevise={canRevise}
        onRevise={onFix}
      />

      {/* Garis waktu dua tahap — siapa pun langsung tahu pengajuan ini sedang
          di meja siapa, sudah lewat mana, dan kenapa bila ditolak. */}
      {(() => {
        const rejectedAtFinal = r.status === "rejected" && !!r.managerApprover;
        const rejectedAtOps = r.status === "rejected" && !r.managerApprover;
        const opsState: StepState = rejectedAtOps
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
            {prefix} <span className="font-medium text-ink">{name || "—"}</span>
            {at && <> · {formatDate(at, "long", locale)}</>}
          </>
        );
        return (
          <div className="rounded-2xl border border-line bg-panel p-3.5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-faint">{t.flow}</p>
            <Step state="done" title={t.stepSubmitted} detail={who(employeeName, r.requestedAt)} />
            <Step
              state={opsState}
              title={t.stepOps}
              detail={
                opsState === "rejected" ? who(r.approver, null, t.rejPrefix)
                  : r.managerApprover ? who(r.managerApprover, r.managerApprovedAt, t.byPrefix)
                  : opsState === "done" ? t.legacySingle
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
        );
      })()}

      {/* Dikembalikan/dikirim ulang — konteks bagi penyetuju & pengaju. */}
      {r.status !== "rejected" && (
        <RevisionBanner revisionNote={r.revisionNote} canRevise={canRevise} onRevise={onFix} />
      )}

      <div className="overflow-hidden rounded-2xl border border-line bg-panel divide-y divide-line">
        <Row label={t.employee}>{employeeName}</Row>
        <Row label={t.jobTitle}>{r.jobTitle}</Row>
        <Row label={t.purpose}>{r.purpose}</Row>
        <Row label={t.dates}>
          <span className="tabular-nums">
            {formatDate(r.departureDate, "long", locale)} — {formatDate(r.returnDate, "long", locale)}
          </span>
          <span className="mt-0.5 block text-xs text-faint">{t.duration(r.durationDays)}</span>
        </Row>
        <Row label={t.transport}>
          {TRANSPORT_LABEL[locale][r.transport]}
          {r.transport === "other" && r.transportOther ? ` · ${r.transportOther}` : ""}
        </Row>
        <Row label={t.accommodation}>
          {r.accommodationRequired ? t.accYes : t.accNo}
          {r.accommodationRequired && r.accommodationDetails && (
            <span className="mt-0.5 block text-xs text-faint">{r.accommodationDetails}</span>
          )}
        </Row>
        {r.remarks && <Row label={t.remarks}>{r.remarks}</Row>}
        <Row label={t.requestedAt}>{formatDate(r.requestedAt, "long", locale)}</Row>
      </div>

      {/* Bukti persetujuan atasan — dasar penyetuju menekan "Setujui". */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-faint">{t.proof}</p>
        {r.approvalPath ? (
          <PaymentFile path={r.approvalPath} api="/api/travel/file" className="aspect-[4/3] max-w-[12rem]" />
        ) : (
          <p className="text-xs text-faint">{t.noProof}</p>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-panel">
        <p className="border-b border-line bg-cream/50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-faint">
          {t.costs}
        </p>
        <div className="divide-y divide-line">
          <CostRow label={t.costTransport} value={r.costTransport} />
          <CostRow label={t.costAccommodation} value={r.costAccommodation} />
          <CostRow label={t.costPerDiem} value={r.costPerDiem} />
          <CostRow label={t.costOther} value={r.costOther} />
          <CostRow label={t.total} value={r.costTotal} strong />
        </div>
        <div className="border-t border-line bg-cream/40 px-3 py-2.5">
          {r.advanceRequired ? (
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-medium text-muted">{t.advance}</span>
              <span className="text-sm font-semibold text-ink tabular-nums">{rupiah(r.advanceAmount)}</span>
            </div>
          ) : (
            <p className="text-xs text-faint">{t.noAdvance}</p>
          )}
        </div>
      </div>

      {(canDecide || canReset) && (
        <div className="space-y-2">
          {/* Penyetuju tahu persis bobot klik-nya: tahap 1 meneruskan, tahap 2 final. */}
          {canDecide && (
            <p className="text-[11px] leading-snug text-faint">
              {r.managerApprover ? t.actionHintFinal : t.actionHintOps}
            </p>
          )}
          {canDecide && (
            <Button variant="outline" className="w-full" onClick={onReturnForRevision} disabled={busy}>
              <Undo2 className="h-4 w-4" /> {t.revise}
            </Button>
          )}
          <div className="flex gap-2">
          {canDecide && (
            <>
              <Button variant="outline" className="flex-1" onClick={onReject} disabled={busy}>
                <X className="h-4 w-4" /> {t.reject}
              </Button>
              <Button className="flex-1" onClick={onApprove} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
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
