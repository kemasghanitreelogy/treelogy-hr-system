"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarRange, ChevronRight, ReceiptText } from "lucide-react";
import type { Employee, Payslip } from "@/lib/types";
import { monthLabel, rupiah } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/field";

type Emp = Pick<Employee, "id" | "name" | "position">;

/**
 * Daftar slip gaji ringkas per baris (bulan-tahun + gaji bersih) dengan
 * filter rentang bulan di atas. Klik baris → halaman detail slip.
 */
export function PayslipList({
  slips,
  employees,
  showEmployee = false,
  title = "Slip Gaji",
  defaultFrom,
}: {
  slips: Payslip[];
  employees: Emp[];
  /** Tampilkan kolom karyawan (mode HR/payroll); sembunyikan di mode mandiri. */
  showEmployee?: boolean;
  title?: string;
  /** Awal rentang default (YYYY-MM); tanpa ini, seluruh riwayat ditampilkan. */
  defaultFrom?: string;
}) {
  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const periods = useMemo(
    () => [...new Set(slips.map((s) => s.period))].sort(),
    [slips],
  );
  const [from, setFrom] = useState(defaultFrom ?? periods[0] ?? "");
  const [to, setTo] = useState(periods[periods.length - 1] ?? "");

  const rows = useMemo(() => {
    const lo = from && to && from > to ? to : from; // rentang terbalik tetap masuk akal
    const hi = from && to && from > to ? from : to;
    return slips
      .filter((s) => (!lo || s.period >= lo) && (!hi || s.period <= hi))
      .sort(
        (a, b) =>
          b.period.localeCompare(a.period) ||
          (empMap.get(a.employeeId)?.name ?? "").localeCompare(empMap.get(b.employeeId)?.name ?? ""),
      );
  }, [slips, from, to, empMap]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-wrap">
        <CardTitle>{title}</CardTitle>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <CalendarRange className="h-4 w-4 text-faint" />
          <Input type="month" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" aria-label="Dari bulan" />
          <span className="text-sm text-faint">–</span>
          <Input type="month" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" aria-label="Sampai bulan" />
        </div>
      </CardHeader>

      <div className="divide-y divide-line">
        {rows.length === 0 && (
          <div className="px-5 py-10 text-center text-sm text-faint">
            Tidak ada slip gaji pada rentang ini.
          </div>
        )}
        {rows.map((s) => {
          const e = empMap.get(s.employeeId);
          return (
            <Link
              key={s.id}
              href={`/payroll/${s.period}/${s.employeeId}`}
              className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-cream/60 active:bg-cream/60 sm:px-5"
            >
              {showEmployee ? (
                <>
                  <Avatar name={e?.name ?? "?"} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{e?.name}</p>
                    <p className="truncate text-xs text-faint">{monthLabel(s.period)}</p>
                  </div>
                </>
              ) : (
                <>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-forest-100 text-forest-700">
                    <ReceiptText className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{monthLabel(s.period)}</p>
                    <p className="truncate text-xs text-faint">{s.presentDays} hari hadir dari {s.workingDays} hari kerja</p>
                  </div>
                </>
              )}
              <div className="text-right">
                <p className="font-semibold tabular-nums text-forest-700">{rupiah(s.netPay, { compact: true })}</p>
                <p className="text-[11px] text-faint">bersih</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
