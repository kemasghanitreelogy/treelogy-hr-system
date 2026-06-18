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
  },
  en: {
    pending: "Pending",
    waitingHr: "Awaiting HR",
    approved: "Approved",
    rejected: "Rejected",
    byManager: (n: string) => `Manager: ${n} ✓`,
    byHr: (n: string) => `HR: ${n} ✓`,
    rejectedBy: (n: string) => `by ${n}`,
  },
};

/**
 * Dual-approval status: a badge plus, once someone has signed off, a line that
 * says who approved each side (atasan / HR) — or who rejected.
 */
export function ApprovalStatus({ request, align = "end" }: { request: ApprovalInfo; align?: "start" | "end" }) {
  const locale = useLocale();
  const t = T[locale];
  const { status, managerApprover, hrApprover, approver } = request;

  const badge =
    status === "approved" ? (
      <Badge tone="matcha" dot>{t.approved}</Badge>
    ) : status === "rejected" ? (
      <Badge tone="clay" dot>{t.rejected}</Badge>
    ) : managerApprover ? (
      <Badge tone="sky" dot>{t.waitingHr}</Badge>
    ) : (
      <Badge tone="gold" dot>{t.pending}</Badge>
    );

  const lines: string[] = [];
  if (status === "rejected") {
    if (approver) lines.push(t.rejectedBy(approver));
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
