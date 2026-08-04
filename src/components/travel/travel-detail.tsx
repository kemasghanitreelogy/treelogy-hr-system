"use client";

import { Check, Loader2, Pencil, RotateCcw, Undo2, X } from "lucide-react";
import type { TravelRequest } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { formatDate, rupiah } from "@/lib/utils";
import { TRANSPORT_LABEL } from "@/lib/travel";
import { useLocale } from "@/components/layout/locale-context";
import { ApprovalStatus } from "@/components/ui/approval-status";
import { Button } from "@/components/ui/button";
import { RejectionNote } from "@/components/ui/rejection-note";

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
    requestedAt: string;
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
    requestedAt: "Diajukan",
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
    requestedAt: "Submitted",
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
        <ApprovalStatus request={r} />
      </div>

      {r.status === "rejected" && r.rejectionReason && (
        <RejectionNote reason={r.rejectionReason} by={r.approver} />
      )}

      {/* Dikembalikan untuk diperbaiki — beda dari penolakan: masih bisa dilanjutkan. */}
      {r.revisionNote && (
        <div className="rounded-2xl border border-gold/40 bg-gold-soft/60 p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold/20 text-[#8a6512]">
              <Undo2 className="h-4 w-4" />
            </span>
            <p className="text-sm font-semibold text-[#8a6512]">{t.reviseBanner}</p>
          </div>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink">{r.revisionNote}</p>
          {canRevise && (
            <Button size="sm" className="mt-3" onClick={onFix}>
              <Pencil className="h-4 w-4" /> {t.fixNow}
            </Button>
          )}
        </div>
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
