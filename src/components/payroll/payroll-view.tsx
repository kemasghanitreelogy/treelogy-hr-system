"use client";

import { useMemo, useState } from "react";
import { Banknote, Check, Download, Landmark, Loader2, Receipt, Wallet } from "lucide-react";
import type { Employee, Payslip, PayrollRun, PayrollStatus } from "@/lib/types";
import { monthLabel, rupiah } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PayrollBadge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { useToast } from "@/components/ui/toast";
import { PayslipList } from "./payslip-list";

export function PayrollView({
  slips,
  employees,
  runs,
  period,
}: {
  /** Slip multi-periode (riwayat); baris difilter di PayslipList. */
  slips: Payslip[];
  employees: Employee[];
  runs: PayrollRun[];
  /** Periode berjalan — target tombol proses/setujui/bayar & ekspor CSV. */
  period: string;
}) {
  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const [runList, setRunList] = useState(runs);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  // The run for the active period, persisted in the DB (no local pretend-state).
  const run = runList.find((r) => r.period === period) ?? null;
  const currentSlips = useMemo(() => slips.filter((s) => s.period === period), [slips, period]);

  async function createRun() {
    setBusy(true);
    try {
      const res = await fetch("/api/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.run) {
        toast.error("Gagal memproses payroll. Pastikan Anda berhak.");
        return;
      }
      setRunList((prev) => [data.run as PayrollRun, ...prev.filter((r) => r.period !== period)]);
      toast.success("Draft payroll dibuat ✓");
    } catch {
      toast.error("Koneksi bermasalah. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function advance(status: PayrollStatus) {
    if (!run) return;
    setBusy(true);
    try {
      const res = await fetch("/api/payroll", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: run.id, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.run) {
        toast.error("Gagal memperbarui status payroll.");
        return;
      }
      setRunList((prev) => prev.map((r) => (r.id === run.id ? (data.run as PayrollRun) : r)));
      toast.success(status === "paid" ? "Payroll ditandai dibayar ✓" : "Payroll disetujui ✓");
    } catch {
      toast.error("Koneksi bermasalah. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  const totals = useMemo(() => {
    return currentSlips.reduce(
      (acc, s) => {
        acc.gross += s.grossPay;
        acc.net += s.netPay;
        acc.bpjs += s.bpjsEmployeeTotal;
        acc.pph += s.pph21;
        return acc;
      },
      { gross: 0, net: 0, bpjs: 0, pph: 0 },
    );
  }, [currentSlips]);

  function exportCsv() {
    const header = ["NIK", "Nama", "Bank", "No Rekening", "Jumlah Transfer", "Keterangan"];
    const lines = currentSlips.map((s) => {
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
              {run && <PayrollBadge status={run.status} />}
            </div>
            <p className="mt-0.5 text-sm text-muted">
              {currentSlips.length} karyawan · sinkron otomatis dengan rekap absensi · lembur dibayar terpisah
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4" /> Ekspor transfer (CSV)
            </Button>
            {!run ? (
              <Button onClick={createRun} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                Proses payroll
              </Button>
            ) : run.status === "draft" || run.status === "processing" ? (
              <Button onClick={() => advance("approved")} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Setujui payroll
              </Button>
            ) : run.status === "approved" ? (
              <Button onClick={() => advance("paid")} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                Tandai dibayar
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Totals (periode berjalan) */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total bruto" value={rupiah(totals.gross, { compact: true })} icon={Wallet} tone="forest" />
        <StatCard label="Total BPJS (karyawan)" value={rupiah(totals.bpjs, { compact: true })} icon={Landmark} tone="sky" />
        <StatCard label="Total PPh 21" value={rupiah(totals.pph, { compact: true })} icon={Receipt} tone="gold" />
        <StatCard label="Total transfer bersih" value={rupiah(totals.net, { compact: true })} icon={Banknote} tone="matcha" />
      </div>

      {/* Riwayat slip per baris — klik untuk masuk halaman detail */}
      <PayslipList
        slips={slips}
        employees={employees.map((e) => ({ id: e.id, name: e.name, position: e.position }))}
        showEmployee
        title="Slip Gaji per Karyawan"
        defaultFrom={period}
      />

      {/* Run history */}
      <Card>
        <CardHeader>
          <CardTitle>Riwayat Payroll</CardTitle>
        </CardHeader>
        <div className="divide-y divide-line">
          {runList.map((r) => (
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
    </div>
  );
}
