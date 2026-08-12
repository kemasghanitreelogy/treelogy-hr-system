"use client";

import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/components/layout/locale-context";

export interface ApprovalInfo {
  status: "pending" | "approved" | "rejected";
  managerApprover?: string | null;
  hrApprover?: string | null;
  approver?: string | null;
}

const T = {
  id: {
    pending: "Menunggu",
    waitingHr: "Menunggu HR",
    approved: "Disetujui",
    rejected: "Ditolak",
    byManager: (n: string) => `Atasan: ${n} ✓`,
    byHr: (n: string) => `HR: ${n} ✓`,
    rejectedBy: (n: string) => `oleh ${n}`,
    // Mode dua tahap netral (perjalanan dinas): Ops/GA → persetujuan akhir.
    waitingStep1: "Menunggu · 0/2",
    waitingFinal: "Tahap akhir · 1/2",
    byStep1: (n: string) => `Tahap 1: ${n} ✓`,
    byFinal: (n: string) => `Final: ${n} ✓`,
  },
  en: {
    pending: "Pending",
    waitingHr: "Awaiting HR",
    approved: "Approved",
    rejected: "Rejected",
    byManager: (n: string) => `Manager: ${n} ✓`,
    byHr: (n: string) => `HR: ${n} ✓`,
    rejectedBy: (n: string) => `by ${n}`,
    waitingStep1: "Pending · 0/2",
    waitingFinal: "Final stage · 1/2",
    byStep1: (n: string) => `Step 1: ${n} ✓`,
    byFinal: (n: string) => `Final: ${n} ✓`,
  },
};

/**
 * Dual-approval status: a badge plus, once someone has signed off, a line that
 * says who approved each side (atasan / HR) — or who rejected.
 *
 * `twoStep`: modul dua tahap BERBASIS IZIN (perjalanan dinas — Ops/GA lalu
 * persetujuan akhir), bukan atasan/HR. Badge menampilkan progres langkah
 * ("Tahap akhir · 1/2") sesuai praktik indikator multi-langkah, dan barisnya
 * memakai label netral "Tahap 1 / Final" — bukan jabatan yang bisa keliru.
 */
export function ApprovalStatus({
  request,
  align = "end",
  twoStep = false,
}: {
  request: ApprovalInfo;
  align?: "start" | "end";
  twoStep?: boolean;
}) {
  const locale = useLocale();
  const t = T[locale];
  const { status, managerApprover, hrApprover, approver } = request;

  const badge =
    status === "approved" ? (
      <Badge tone="matcha" dot>{t.approved}</Badge>
    ) : status === "rejected" ? (
      <Badge tone="clay" dot>{t.rejected}</Badge>
    ) : managerApprover ? (
      <Badge tone="sky" dot>{twoStep ? t.waitingFinal : t.waitingHr}</Badge>
    ) : (
      <Badge tone="gold" dot>{twoStep ? t.waitingStep1 : t.pending}</Badge>
    );

  const lines: string[] = [];
  if (status === "rejected") {
    if (approver) lines.push(t.rejectedBy(approver));
  } else if (twoStep) {
    if (managerApprover) lines.push(t.byStep1(managerApprover));
    if (hrApprover) lines.push(t.byFinal(hrApprover));
    // Baris lama era penyetuju tunggal: hanya slot final yang terisi.
    if (!managerApprover && !hrApprover && approver) lines.push(t.byFinal(approver));
  } else {
    if (managerApprover) lines.push(t.byManager(managerApprover));
    if (hrApprover) lines.push(t.byHr(hrApprover));
  }

  return (
    <div className={`flex flex-col gap-1 ${align === "end" ? "items-end" : "items-start"}`}>
      {badge}
      {lines.length > 0 && (
        <span className="text-[11px] leading-tight text-faint">{lines.join(" · ")}</span>
      )}
    </div>
  );
}
