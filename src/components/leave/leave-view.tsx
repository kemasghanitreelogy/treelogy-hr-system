"use client";

import { useMemo, useState } from "react";
import { Check, PiggyBank, Plus, X } from "lucide-react";
import type { Employee, LeaveBalance, LeaveRequest, LeaveType, RequestStatus, Team } from "@/lib/types";
import { TEAM_META } from "@/lib/constants";
import { cn, formatDate } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge, RequestBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";

const LEAVE_LABEL: Record<LeaveType, string> = {
  annual: "Cuti tahunan",
  sick: "Sakit",
  unpaid: "Tanpa gaji",
  "in-lieu": "Tukar libur",
};

type Tab = "requests" | "balances";

export function LeaveView({
  requests,
  balances,
  employees,
}: {
  requests: LeaveRequest[];
  balances: LeaveBalance[];
  employees: Pick<Employee, "id" | "name" | "team" | "position">[];
}) {
  const [tab, setTab] = useState<Tab>("requests");
  const [list, setList] = useState(requests);
  const [adding, setAdding] = useState(false);

  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const toast = useToast();

  function decide(id: string, status: RequestStatus) {
    setList((prev) => prev.map((r) => (r.id === id ? { ...r, status, approver: "Dewi Lestari" } : r)));
    toast.success(status === "approved" ? "Pengajuan disetujui ✓" : "Pengajuan ditolak ✓");
  }

  function addRequest(r: LeaveRequest) {
    setList((prev) => [r, ...prev]);
    setAdding(false);
    toast.success("Pengajuan cuti/izin terkirim ✓");
  }

  const pending = list.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-4 fade-up">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-xl bg-sand p-1">
          <TabBtn active={tab === "requests"} onClick={() => setTab("requests")}>
            Permintaan {pending > 0 && <span className="ml-1 rounded-full bg-gold px-1.5 text-[10px] text-white">{pending}</span>}
          </TabBtn>
          <TabBtn active={tab === "balances"} onClick={() => setTab("balances")}>
            Saldo &amp; Tabungan Libur
          </TabBtn>
        </div>
        <Button onClick={() => setAdding(true)} className="shrink-0">
          <Plus className="h-4 w-4" /> Ajukan Cuti/Izin
        </Button>
      </div>

      {tab === "requests" ? (
        <div className="space-y-3">
          {list.map((r) => {
            const emp = empMap.get(r.employeeId);
            return (
              <div key={r.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3 sm:w-52">
                  <Avatar name={emp?.name ?? "?"} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{emp?.name}</p>
                    <p className="truncate text-xs text-faint">
                      {emp && <span className={TEAM_META[emp.team].tone}>{TEAM_META[emp.team].label}</span>}
                    </p>
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={r.type === "sick" ? "olive" : r.type === "in-lieu" ? "matcha" : "sky"}>
                      {LEAVE_LABEL[r.type]}
                    </Badge>
                    <span className="text-sm font-medium text-ink">{r.days} hari</span>
                    <span className="text-sm text-muted">
                      {formatDate(r.startDate)} – {formatDate(r.endDate)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm text-faint">{r.reason}</p>
                </div>
                <div className="flex items-center gap-2 sm:w-auto">
                  {r.status === "pending" ? (
                    <>
                      <Button size="sm" onClick={() => decide(r.id, "approved")} className="flex-1 sm:flex-none">
                        <Check className="h-4 w-4" /> Setujui
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => decide(r.id, "rejected")} className="flex-1 sm:flex-none">
                        <X className="h-4 w-4" /> Tolak
                      </Button>
                    </>
                  ) : (
                    <RequestBadge status={r.status} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <BalancesView balances={balances} employees={employees} />
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Ajukan Cuti / Izin" description="Buat permintaan baru">
        <LeaveForm employees={employees} onSubmit={addRequest} onCancel={() => setAdding(false)} count={list.length} />
      </Sheet>
    </div>
  );
}

function BalancesView({
  balances,
  employees,
}: {
  balances: LeaveBalance[];
  employees: Pick<Employee, "id" | "name" | "team" | "position">[];
}) {
  const empMap = new Map(employees.map((e) => [e.id, e]));
  const totalSaved = balances.reduce((s, b) => s + b.tabunganLibur, 0);

  return (
    <div className="space-y-4">
      <Card className="bg-bark text-cream">
        <CardContent className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-forest-700">
            <PiggyBank className="h-6 w-6 text-lime" />
          </span>
          <div>
            <p className="text-sm text-forest-100/70">Total Tabungan Libur (semua karyawan)</p>
            <p className="font-display text-3xl font-bold">{totalSaved} hari</p>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Saldo Cuti per Karyawan</CardTitle>
        </CardHeader>
        <div className="divide-y divide-line">
          {balances.map((b) => {
            const emp = empMap.get(b.employeeId);
            if (!emp) return null;
            const remaining = b.annualQuota - b.annualUsed;
            return (
              <div key={b.employeeId} className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <Avatar name={emp.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{emp.name}</p>
                    <p className="truncate text-xs text-faint">{emp.position}</p>
                  </div>
                  {b.tabunganLibur > 0 && (
                    <Badge tone="matcha">
                      <PiggyBank className="h-3.5 w-3.5" /> {b.tabunganLibur} hari
                    </Badge>
                  )}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted">Cuti tahunan</span>
                      <span className="font-medium text-ink">{remaining}/{b.annualQuota} sisa</span>
                    </div>
                    <Progress value={b.annualUsed} max={b.annualQuota} className="mt-1.5" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted">Cuti sakit terpakai</span>
                      <span className="font-medium text-ink">{b.sickUsed} hari</span>
                    </div>
                    <Progress value={b.sickUsed} max={12} className="mt-1.5" barClassName="bg-olive" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted">Tabungan libur</span>
                      <span className="font-medium text-ink">{b.tabunganLibur} hari</span>
                    </div>
                    <Progress value={b.tabunganLibur} max={12} className="mt-1.5" barClassName="bg-gold" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-panel text-ink shadow-sm" : "text-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function LeaveForm({
  employees,
  onSubmit,
  onCancel,
  count,
}: {
  employees: Pick<Employee, "id" | "name" | "team" | "position">[];
  onSubmit: (r: LeaveRequest) => void;
  onCancel: () => void;
  count: number;
}) {
  const [form, setForm] = useState({
    employeeId: employees[0]?.id ?? "",
    type: "annual" as LeaveType,
    startDate: "",
    endDate: "",
    reason: "",
  });

  function dayCount(a: string, b: string) {
    if (!a || !b) return 1;
    const d = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) + 1;
    return Math.max(1, d);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      id: "l" + (count + 100),
      employeeId: form.employeeId,
      type: form.type,
      startDate: form.startDate || new Date().toISOString().slice(0, 10),
      endDate: form.endDate || form.startDate || new Date().toISOString().slice(0, 10),
      days: dayCount(form.startDate, form.endDate),
      reason: form.reason || "—",
      status: "pending",
      requestedAt: new Date().toISOString(),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Karyawan">
        <Select value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name} — {TEAM_META[e.team as Team].label}</option>
          ))}
        </Select>
      </Field>
      <Field label="Jenis">
        <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as LeaveType }))}>
          {(["annual", "sick", "unpaid", "in-lieu"] as LeaveType[]).map((t) => (
            <option key={t} value={t}>{LEAVE_LABEL[t]}</option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mulai">
          <Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} required />
        </Field>
        <Field label="Selesai">
          <Input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} required />
        </Field>
      </div>
      <Field label="Alasan">
        <Textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="cth. Acara keluarga…" />
      </Field>
      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>Batal</Button>
        <Button type="submit" className="flex-1">Ajukan</Button>
      </div>
    </form>
  );
}
