import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "forest",
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  tone?: "forest" | "olive" | "matcha" | "gold" | "clay" | "sky";
  trend?: { value: string; up: boolean };
}) {
  const tones: Record<string, string> = {
    forest: "bg-forest-100 text-forest-700",
    olive: "bg-[#e8ecdb] text-olive",
    matcha: "bg-[#e9f0d8] text-forest-600",
    gold: "bg-gold-soft text-[#8a6512]",
    clay: "bg-clay-soft text-[#8c3c1f]",
    sky: "bg-sky-soft text-[#2c5775]",
  };
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", tones[tone])}>
          <Icon className="h-5 w-5" />
        </span>
        {trend && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold",
              trend.up ? "bg-[#e9f0d8] text-forest-600" : "bg-clay-soft text-[#8c3c1f]",
            )}
          >
            {trend.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {trend.value}
          </span>
        )}
      </div>
      <p className="mt-3 font-display text-2xl font-bold tracking-tight text-ink sm:text-[28px]">
        {value}
      </p>
      <p className="mt-0.5 text-sm font-medium text-muted">{label}</p>
      {sub && <p className="mt-1 text-xs text-faint">{sub}</p>}
    </div>
  );
}
