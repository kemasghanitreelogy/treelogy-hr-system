"use client";

import { useMemo, useState } from "react";
import { Banknote, Download, FileText, Landmark, Receipt, Wallet } from "lucide-react";
import type { Employee, Payslip, PayrollRun } from "@/lib/types";
import { monthLabel, rupiah } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PayrollBadge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { Sheet } from "@/components/ui/sheet";
import { PayslipDetail } from "./payslip-detail";

export function PayrollView({
  slips,
  employees,
  runs,
  period,
}: {
  slips: Payslip[];
  employees: Employee[];
  runs: PayrollRun[];
  period: string;
}) {
  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const [openSlip, setOpenSlip] = useState<Payslip | null>(null);
  const [processed, setProcessed] = useState(false);

  const totals = useMemo(() => {
    return slips.reduce(
      (acc, s) => {
        acc.gross += s.grossPay;
        acc.net += s.netPay;
        acc.bpjs += s.bpjsEmployeeTotal;
        acc.pph += s.pph21;
        acc.ot += s.overtimePay;
        return acc;
      },
      { gross: 0, net: 0, bpjs: 0, pph: 0, ot: 0 },
    );
  }, [slips]);

  function exportCsv() {
    const header = ["NIK", "Nama", "Bank", "No Rekening", "Jumlah Transfer", "Keterangan"];
    const lines = slips.map((s) => {
      const e = empMap.get(s.employeeId)!;
      return [e.nik, e.name, e.bankName, e.bankAccount, String(s.netPay), `Gaji ${monthLabel(period)}`].join(",");
    });
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transfer-gaji-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5 fade-up">
      {/* Active run header */}
      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-lg font-semibold text-ink">Payroll {monthLabel(period)}</h2>
              <PayrollBadge status={processed ? "approved" : "draft"} />
            </div>
            <p className="mt-0.5 text-sm text-muted">
              {slips.length} karyawan · sinkron otomatis dengan rekap absensi
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4" /> Ekspor transfer (CSV)
            </Button>
            <Button onClick={() => setProcessed(true)} disabled={processed}>
              <Banknote className="h-4 w-4" /> {processed ? "Payroll disetujui" : "Proses payroll"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total bruto" value={rupiah(totals.gross, { compact: true })} icon={Wallet} tone="forest" />
        <StatCard label="Total BPJS (karyawan)" value={rupiah(totals.bpjs, { compact: true })} icon={Landmark} tone="sky" />
        <StatCard label="Total PPh 21" value={rupiah(totals.pph, { compact: true })} icon={Receipt} tone="gold" />
        <StatCard label="Total transfer bersih" value={rupiah(totals.net, { compact: true })} icon={Banknote} tone="matcha" />
      </div>

      {/* Payslip table */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Rincian Gaji per Karyawan</CardTitle>
          <span className="text-sm text-muted">{monthLabel(period)}</span>
        </CardHeader>

        {/* Desktop */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-cream/50 text-left text-xs font-semibold uppercase tracking-wide text-faint">
                <th className="px-5 py-3">Karyawan</th>
                <th className="px-5 py-3 text-right">Bruto</th>
                <th className="px-5 py-3 text-right">Lembur</th>
                <th className="px-5 py-3 text-right">BPJS</th>
                <th className="px-5 py-3 text-right">PPh 21</th>
                <th className="px-5 py-3 text-right">Bersih</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {slips.map((s) => {
                const e = empMap.get(s.employeeId)!;
                return (
                  <tr
                    key={s.id}
                    onClick={() => setOpenSlip(s)}
                    className="cursor-pointer transition-colors hover:bg-cream/60"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={e.name} size="sm" />
                        <div>
                          <p className="font-medium text-ink">{e.name}</p>
                          <p className="text-xs text-faint">{e.position}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted">{rupiah(s.grossPay)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-olive">{s.overtimePay ? rupiah(s.overtimePay) : "—"}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted">- {rupiah(s.bpjsEmployeeTotal)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted">- {rupiah(s.pph21)}</td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums text-forest-700">{rupiah(s.netPay)}</td>
                    <td className="px-5 py-3 text-right">
                      <FileText className="ml-auto h-4 w-4 text-faint" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile */}
        <div className="divide-y divide-line md:hidden">
          {slips.map((s) => {
            const e = empMap.get(s.employeeId)!;
            return (
              <button key={s.id} onClick={() => setOpenSlip(s)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-cream/60">
                <Avatar name={e.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{e.name}</p>
                  <p className="text-xs text-faint">Bruto {rupiah(s.grossPay, { compact: true })}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums text-forest-700">{rupiah(s.netPay, { compact: true })}</p>
                  <p className="text-[11px] text-faint">bersih</p>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Run history */}
      <Card>
        <CardHeader>
          <CardTitle>Riwayat Payroll</CardTitle>
        </CardHeader>
        <div className="divide-y divide-line">
          {runs.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest-100 text-forest-700">
                  <Receipt className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-medium text-ink">{monthLabel(r.period)}</p>
                  <p className="text-xs text-faint">{r.employeeCount} karyawan</p>
                </div>
              </div>
              <PayrollBadge status={r.status} />
            </div>
          ))}
        </div>
      </Card>

      <Sheet
        open={!!openSlip}
        onClose={() => setOpenSlip(null)}
        title="Slip Gaji"
        description={openSlip ? monthLabel(openSlip.period) : ""}
        width="lg"
      >
        {openSlip && <PayslipDetail slip={openSlip} emp={empMap.get(openSlip.employeeId)!} />}
      </Sheet>
    </div>
  );
}
