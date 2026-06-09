"use client";

import { Printer } from "lucide-react";
import type { Employee, Payslip } from "@/lib/types";
import { jkkRate } from "@/lib/payroll";
import { monthLabel, rupiah } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export function PayslipDetail({ slip, emp }: { slip: Payslip; emp: Employee }) {
  const b = slip.bpjs;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={emp.name} />
          <div>
            <p className="font-semibold text-ink">{emp.name}</p>
            <p className="text-xs text-faint">{emp.nik} · {emp.position}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Cetak
        </Button>
      </div>

      <div className="rounded-2xl bg-bark p-4 text-cream">
        <p className="text-sm text-forest-100/70">Gaji bersih · {monthLabel(slip.period)}</p>
        <p className="font-display text-3xl font-bold">{rupiah(slip.netPay)}</p>
        <p className="mt-1 text-xs text-forest-100/60">
          {slip.presentDays} hari hadir dari {slip.workingDays} hari kerja
        </p>
      </div>

      <Section title="Pendapatan">
        <Line label="Gaji pokok" value={rupiah(slip.baseSalary)} />
        <Line label="Tunjangan tetap" value={rupiah(slip.allowance)} />
        <Line label={`Lembur (${slip.overtimeHours} jam)`} value={rupiah(slip.overtimePay)} />
        <Line label="Bruto" value={rupiah(slip.grossPay)} strong />
      </Section>

      <Section title="Potongan — BPJS (karyawan)">
        <Line label="BPJS Kesehatan (1%)" value={`- ${rupiah(b.kesEmployee)}`} />
        <Line label="JHT (2%)" value={`- ${rupiah(b.jhtEmployee)}`} />
        <Line label="Jaminan Pensiun (1%)" value={`- ${rupiah(b.jpEmployee)}`} />
        <Line label="Total BPJS karyawan" value={`- ${rupiah(slip.bpjsEmployeeTotal)}`} strong />
      </Section>

      <Section title="Potongan — Pajak">
        <Line label={`PPh 21 (TER ${emp.ptkp})`} value={`- ${rupiah(slip.pph21)}`} />
      </Section>

      <Section title="Ditanggung perusahaan (info)">
        <Line label="BPJS Kesehatan (4%)" value={rupiah(b.kesEmployer)} muted />
        <Line label="JHT (3.7%)" value={rupiah(b.jhtEmployer)} muted />
        <Line label="Jaminan Pensiun (2%)" value={rupiah(b.jpEmployer)} muted />
        <Line label={`JKK (${(jkkRate(emp.team) * 100).toFixed(2)}%)`} value={rupiah(b.jkk)} muted />
        <Line label="JKM (0.3%)" value={rupiah(b.jkm)} muted />
      </Section>

      <div className="flex items-center justify-between rounded-2xl border-2 border-forest-200 bg-[#e9f0d8] px-4 py-3">
        <span className="font-semibold text-forest-700">Take-home pay</span>
        <span className="font-display text-xl font-bold text-forest-700">{rupiah(slip.netPay)}</span>
      </div>

      <p className="text-center text-xs text-faint">
        Transfer ke {emp.bankName} · {emp.bankAccount}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Line({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={muted ? "text-faint" : "text-muted"}>{label}</span>
      <span className={strong ? "font-semibold text-ink" : muted ? "text-faint" : "font-medium text-ink"}>{value}</span>
    </div>
  );
}
