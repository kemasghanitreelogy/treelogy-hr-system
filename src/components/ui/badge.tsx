import { cn } from "@/lib/utils";

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

const attendanceTone: Record<AttendanceStatus, { tone: Tone; label: string }> = {
  present: { tone: "matcha", label: "Hadir" },
  late: { tone: "gold", label: "Terlambat" },
  absent: { tone: "clay", label: "Alpa" },
  leave: { tone: "sky", label: "Cuti" },
  sick: { tone: "olive", label: "Sakit" },
  off: { tone: "neutral", label: "Libur" },
  holiday: { tone: "neutral", label: "Hari Libur" },
};

export function AttendanceBadge({ status }: { status: AttendanceStatus }) {
  const { tone, label } = attendanceTone[status];
  return <Badge tone={tone} dot>{label}</Badge>;
}

const requestTone: Record<RequestStatus, { tone: Tone; label: string }> = {
  pending: { tone: "gold", label: "Menunggu" },
  approved: { tone: "matcha", label: "Disetujui" },
  rejected: { tone: "clay", label: "Ditolak" },
};

export function RequestBadge({ status }: { status: RequestStatus }) {
  const { tone, label } = requestTone[status];
  return <Badge tone={tone} dot>{label}</Badge>;
}

const payrollTone: Record<PayrollStatus, { tone: Tone; label: string }> = {
  draft: { tone: "neutral", label: "Draft" },
  processing: { tone: "gold", label: "Diproses" },
  approved: { tone: "sky", label: "Disetujui" },
  paid: { tone: "matcha", label: "Dibayar" },
};

export function PayrollBadge({ status }: { status: PayrollStatus }) {
  const { tone, label } = payrollTone[status];
  return <Badge tone={tone} dot>{label}</Badge>;
}

export function EmployeeStatusBadge({ status }: { status: EmployeeStatus }) {
  return status === "active" ? (
    <Badge tone="matcha" dot>Aktif</Badge>
  ) : (
    <Badge tone="neutral" dot>Nonaktif</Badge>
  );
}
