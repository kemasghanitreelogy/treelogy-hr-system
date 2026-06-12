"use client";

import { cn } from "@/lib/utils";
import { useLocale } from "@/components/layout/locale-context";
import type { Locale } from "@/lib/i18n";

/** Cakupan data yang ditampilkan di sebuah menu. */
export type Scope = "all" | "team" | "mine";

/**
 * Opsi scope sesuai peran:
 * - HR/admin (canApproveAll): Semua + Data Saya
 * - Manajer (punya tim): Data Tim + Data Saya
 * - Karyawan biasa: tidak ada tab (selalu data sendiri)
 * Default selalu "Data Saya" (elemen terakhir difilter di pemanggil).
 */
export function scopeOptionsFor(canApproveAll: boolean, hasTeam: boolean): Scope[] {
  if (canApproveAll) return ["all", "mine"];
  if (hasTeam) return ["team", "mine"];
  return [];
}

/** Apakah satu record masuk scope terpilih. */
export function inScope(
  scope: Scope,
  employeeId: string,
  team: string | undefined,
  currentEmployeeId: string | null,
  approverTeam: string | null,
): boolean {
  if (scope === "mine") return employeeId === currentEmployeeId;
  if (scope === "team") return team != null && team === approverTeam;
  return true; // all
}

const LABELS: Record<Locale, Record<Scope, string>> = {
  id: { all: "Semua", team: "Data Tim", mine: "Data Saya" },
  en: { all: "All", team: "My Team", mine: "My Data" },
};

export function ScopeTabs({
  options,
  value,
  onChange,
}: {
  options: Scope[];
  value: Scope;
  onChange: (s: Scope) => void;
}) {
  const locale = useLocale();
  if (options.length === 0) return null;
  return (
    <div className="inline-flex rounded-xl bg-sand p-1">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={cn(
            "cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            value === opt ? "bg-panel text-ink shadow-sm" : "text-muted hover:text-ink",
          )}
        >
          {LABELS[locale][opt]}
        </button>
      ))}
    </div>
  );
}
