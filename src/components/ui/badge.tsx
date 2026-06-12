"use client";

import { cn } from "@/lib/utils";
import { useLocale } from "@/components/layout/locale-context";
import type { Locale } from "@/lib/i18n";

type Tone = "forest" | "olive" | "matcha" | "gold" | "clay" | "sky" | "neutral";

const tones: Record<Tone, string> = {
  forest: "bg-forest-100 text-forest-700",
  olive: "bg-[#e8ecdb] text-olive",
  matcha: "bg-[#e9f0d8] text-forest-700",
  gold: "bg-gold-soft text-[#8a6512]",
  clay: "bg-clay-soft text-[#8c3c1f]",
  sky: "bg-sky-soft text-[#2c5775]",
  neutral: "bg-sand text-muted",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  dot,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}

import type { AttendanceStatus, RequestStatus, PayrollStatus, EmployeeStatus } from "@/lib/types";

const attendanceTone: Record<AttendanceStatus, { tone: Tone; label: Record<Locale, string> }> = {
  present: { tone: "matcha", label: { id: "Hadir", en: "Present" } },
  late: { tone: "gold", label: { id: "Terlambat", en: "Late" } },
  absent: { tone: "clay", label: { id: "Alpa", en: "Absent" } },
  leave: { tone: "sky", label: { id: "Cuti", en: "On Leave" } },
  sick: { tone: "olive", label: { id: "Sakit", en: "Sick" } },
  off: { tone: "neutral", label: { id: "Libur", en: "Day Off" } },
  holiday: { tone: "neutral", label: { id: "Hari Libur", en: "Holiday" } },
};

export function AttendanceBadge({ status }: { status: AttendanceStatus }) {
  const locale = useLocale();
  const { tone, label } = attendanceTone[status];
  return <Badge tone={tone} dot>{label[locale]}</Badge>;
}

const requestTone: Record<RequestStatus, { tone: Tone; label: Record<Locale, string> }> = {
  pending: { tone: "gold", label: { id: "Menunggu", en: "Pending" } },
  approved: { tone: "matcha", label: { id: "Disetujui", en: "Approved" } },
  rejected: { tone: "clay", label: { id: "Ditolak", en: "Rejected" } },
};

export function RequestBadge({ status }: { status: RequestStatus }) {
  const locale = useLocale();
  const { tone, label } = requestTone[status];
  return <Badge tone={tone} dot>{label[locale]}</Badge>;
}

const payrollTone: Record<PayrollStatus, { tone: Tone; label: Record<Locale, string> }> = {
  draft: { tone: "neutral", label: { id: "Draft", en: "Draft" } },
  processing: { tone: "gold", label: { id: "Diproses", en: "Processing" } },
  approved: { tone: "sky", label: { id: "Disetujui", en: "Approved" } },
  paid: { tone: "matcha", label: { id: "Dibayar", en: "Paid" } },
};

export function PayrollBadge({ status }: { status: PayrollStatus }) {
  const locale = useLocale();
  const { tone, label } = payrollTone[status];
  return <Badge tone={tone} dot>{label[locale]}</Badge>;
}

export function EmployeeStatusBadge({ status }: { status: EmployeeStatus }) {
  const locale = useLocale();
  return status === "active" ? (
    <Badge tone="matcha" dot>{locale === "en" ? "Active" : "Aktif"}</Badge>
  ) : (
    <Badge tone="neutral" dot>{locale === "en" ? "Inactive" : "Nonaktif"}</Badge>
  );
}
