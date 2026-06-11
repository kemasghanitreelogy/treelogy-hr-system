"use client";

import { useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Check, Clock, Coffee, Loader2, PiggyBank, Plus, Wallet, X } from "lucide-react";
import type { Employee, RequestStatus, Shift, TabunganEntry, TabunganKind, Team } from "@/lib/types";
import { TEAM_META } from "@/lib/constants";
import { cn, formatDate } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge, RequestBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";

type Emp = Pick<Employee, "id" | "name" | "team" | "position">;

const KIND_LABEL: Record<TabunganKind, string> = {
  deposit: "Setor",
  withdrawal: "Cairkan",
};

export function ShiftsView({
  shifts,
  entries,
  employees,
  currentUserName = "HR",
  currentEmployeeId = null,
  canRequestForOthers = true,
  canApproveAll = false,
  approverTeam = null,
  selfBalance = 0,
}: {
  shifts: Shift[];
  entries: TabunganEntry[];
  employees: Emp[];
  currentUserName?: string;
  currentEmployeeId?: string | null;
  canRequestForOthers?: boolean;
  canApproveAll?: boolean;
  approverTeam?: Team | null;
  /** Saved-day balance of the logged-in user, for the withdrawal cap. */
  selfBalance?: number;
}) {
  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const [list, setList] = useState(entries);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const toast = useToast();
  // A plain employee only sees their own entries → the name/avatar is redundant.
  const showEmployee = canApproveAll || approverTeam != null;

  const canDecide = useMemo(
    () => (e: TabunganEntry) => {
      if (canApproveAll) return true;
      if (!approverTeam) return false;
      if (e.employeeId === currentEmployeeId) return false;
      return empMap.get(e.employeeId)?.team === approverTeam;
    },
    [canApproveAll, approverTeam, currentEmployeeId, empMap],
  );

  async function decide(id: string, status: RequestStatus) {
    const prev = list.find((e) => e.id === id);
    if (!prev) return;
    setBusyId(id);
    setList((cur) => cur.map((e) => (e.id === id ? { ...e, status, approver: currentUserName } : e)));
    try {
      const res = await fetch("/api/tabungan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, approver: currentUserName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.request) {
        setList((cur) => cur.map((e) => (e.id === id ? prev : e)));
        toast.error(
          data.error === "insufficient_balance"
            ? "Saldo tabungan karyawan tidak cukup untuk dicairkan."
            : "Gagal memproses. Pastikan Anda berhak menyetujui.",
        );
        return;
      }
      setList((cur) => cur.map((e) => (e.id === id ? (data.request as TabunganEntry) : e)));
      toast.success(status === "approved" ? "Disetujui ✓" : "Ditolak ✓");
    } catch {
      setList((cur) => cur.map((e) => (e.id === id ? prev : e)));
      toast.error("Koneksi bermasalah. Coba lagi.");
    } finally {
      setBusyId(null);
    }
  }

  const pending = list.filter((e) => e.status === "pending" && canDecide(e)).length;

  return (
    <div className="space-y-5 fade-up">
      {/* Shift definitions */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">Definisi Shift</h2>
          <Button size="sm" variant="outline">
            <Plus className="h-4 w-4" /> Tambah shift
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shifts.map((s) => (
            <div key={s.id} className="card overflow-hidden">
              <div className="h-1.5 w-full" style={{ background: s.color }} />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-ink">{s.name}</h3>
                    <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium", TEAM_META[s.team].chip)}>
                      {TEAM_META[s.team].label}
                    </span>
                  </div>
                  <span className="font-display text-lg font-bold tabular-nums text-forest-600">
                    {s.startTime}
                  </span>
                </div>
                <div className="mt-3 space-y-1.5 text-sm text-muted">
                  <p className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-faint" /> {s.startTime} – {s.endTime}
                  </p>
                  <p className="flex items-center gap-2">
                    <Coffee className="h-4 w-4 text-faint" /> Istirahat {s.breakMinutes} menit
                  </p>
                  <p className="flex items-center gap-2">
                    <ArrowUpFromLine className="h-4 w-4 text-faint" /> Lembur setelah {s.overtimeAfter}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabungan libur — ledger of deposits (kerja hari libur) & withdrawals (ambil libur) */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Tabungan Libur</CardTitle>
            <p className="mt-0.5 text-sm text-muted">
              Kerja di hari libur menambah tabungan (dikonfirmasi HR); cairkan untuk ambil libur pengganti.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {pending > 0 && (
              <Badge tone="gold" className="whitespace-nowrap">{pending} menunggu</Badge>
            )}
            <Button size="sm" onClick={() => setAdding(true)}>
              <Wallet className="h-4 w-4" /> Cairkan tabungan
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {currentEmployeeId && (
            <div className="flex items-center gap-3 rounded-2xl bg-bark px-4 py-3 text-cream">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-forest-700">
                <PiggyBank className="h-5 w-5 text-lime" />
              </span>
              <p className="text-sm text-forest-100/70">Tabungan libur Anda</p>
              <p className="ml-auto font-display text-xl font-bold">{selfBalance} hari</p>
            </div>
          )}

          {list.length === 0 && (
            <div className="rounded-2xl border border-line bg-cream/40 px-5 py-10 text-center text-sm text-faint">
              Belum ada catatan tabungan libur.
            </div>
          )}

          {list.map((e) => {
            const emp = empMap.get(e.employeeId);
            const isDeposit = e.kind === "deposit";
            return (
              <div
                key={e.id}
                className="flex flex-col gap-3 rounded-2xl border border-line bg-cream/40 p-4 sm:flex-row sm:items-center"
              >
                {showEmployee && (
                  <div className="flex items-center gap-3 sm:w-52">
                    <Avatar name={emp?.name ?? "?"} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{emp?.name}</p>
                      <p className="truncate text-xs text-faint">{emp?.position}</p>
                    </div>
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={isDeposit ? "matcha" : "clay"}>
                      {isDeposit ? <ArrowDownToLine className="h-3.5 w-3.5" /> : <ArrowUpFromLine className="h-3.5 w-3.5" />}
                      {KIND_LABEL[e.kind]}
                    </Badge>
                    <span className={cn("text-sm font-semibold", isDeposit ? "text-forest-700" : "text-[#8c3c1f]")}>
                      {isDeposit ? "+" : "−"}{e.days} hari
                    </span>
                    <span className="text-sm text-muted">{formatDate(e.eventDate)}</span>
                    {e.source === "attendance" && (
                      <span className="rounded-full bg-sand px-2 py-0.5 text-[10px] font-medium text-muted">otomatis dari absensi</span>
                    )}
                  </div>
                  {e.reason && <p className="mt-1 line-clamp-1 text-sm text-faint">{e.reason}</p>}
                </div>

                <div className="flex items-center gap-2 sm:w-auto">
                  {e.status === "pending" && canDecide(e) ? (
                    <>
                      <Button size="sm" disabled={busyId === e.id} onClick={() => decide(e.id, "approved")} className="flex-1 sm:flex-none">
                        <Check className="h-4 w-4" /> Setujui
                      </Button>
                      <Button size="sm" variant="outline" disabled={busyId === e.id} onClick={() => decide(e.id, "rejected")} className="flex-1 sm:flex-none">
                        <X className="h-4 w-4" /> Tolak
                      </Button>
                    </>
                  ) : (
                    <RequestBadge status={e.status} />
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Cairkan / Setor Tabungan Libur" description="Buat catatan tabungan libur baru">
        <TabunganForm
          employees={employees}
          currentEmployeeId={currentEmployeeId}
          canRequestForOthers={canRequestForOthers}
          selfBalance={selfBalance}
          onSubmit={(entry) => {
            setList((prev) => [entry, ...prev]);
            setAdding(false);
            toast.success("Pengajuan terkirim ✓");
          }}
          onCancel={() => setAdding(false)}
        />
      </Sheet>
    </div>
  );
}

function TabunganForm({
  employees,
  currentEmployeeId = null,
  canRequestForOthers = true,
  selfBalance = 0,
  onSubmit,
  onCancel,
}: {
  employees: Emp[];
  currentEmployeeId?: string | null;
  canRequestForOthers?: boolean;
  selfBalance?: number;
  onSubmit: (e: TabunganEntry) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const selfEmployee = currentEmployeeId ? employees.find((e) => e.id === currentEmployeeId) : undefined;
  const lockToSelf = !canRequestForOthers && !!selfEmployee;
  const [form, setForm] = useState({
    employeeId: lockToSelf ? selfEmployee!.id : employees[0]?.id ?? "",
    // Employees can only withdraw; HR may also file a manual deposit.
    kind: "withdrawal" as TabunganKind,
    eventDate: "",
    days: 1,
    reason: "",
  });

  // Cap a self-withdrawal at the visible balance (server re-checks regardless).
  const selfWithdraw = form.employeeId === currentEmployeeId && form.kind === "withdrawal";
  const overBalance = selfWithdraw && form.days > selfBalance;

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!form.employeeId) return toast.error("Pilih karyawan dulu.");
    if (!form.eventDate) return toast.error("Tanggal wajib diisi.");
    if (form.days < 1) return toast.error("Jumlah hari minimal 1.");
    if (overBalance) return toast.error("Jumlah melebihi saldo tabungan Anda.");
    setSaving(true);
    try {
      const res = await fetch("/api/tabungan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: form.employeeId,
          kind: form.kind,
          eventDate: form.eventDate,
          days: form.days,
          reason: form.reason,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.request) {
        toast.error(
          data.error === "insufficient_balance"
            ? "Saldo tabungan tidak cukup."
            : "Gagal mengajukan. Coba lagi.",
        );
        return;
      }
      onSubmit(data.request as TabunganEntry);
    } catch {
      toast.error("Koneksi bermasalah. Coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {lockToSelf ? (
        <Field label="Karyawan">
          <div className="flex items-center gap-3 rounded-xl border border-line bg-sand px-3 py-2.5">
            <Avatar name={selfEmployee!.name} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{selfEmployee!.name}</p>
              <p className="truncate text-xs text-faint">{TEAM_META[selfEmployee!.team].label}</p>
            </div>
          </div>
        </Field>
      ) : (
        <Field label="Karyawan">
          <Select value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name} — {TEAM_META[e.team].label}</option>
            ))}
          </Select>
        </Field>
      )}

      {canRequestForOthers && (
        <Field label="Jenis">
          <Select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as TabunganKind }))}>
            <option value="withdrawal">Cairkan (ambil libur)</option>
            <option value="deposit">Setor (kerja hari libur)</option>
          </Select>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label={form.kind === "deposit" ? "Tanggal kerja" : "Tanggal libur"}>
          <Input type="date" value={form.eventDate} onChange={(e) => setForm((f) => ({ ...f, eventDate: e.target.value }))} required />
        </Field>
        <Field label="Jumlah hari">
          <Input type="number" min={1} value={form.days} onChange={(e) => setForm((f) => ({ ...f, days: Math.max(1, Number(e.target.value) || 1) }))} required />
        </Field>
      </div>

      {selfWithdraw && (
        <div className={cn("flex items-center justify-between rounded-xl px-3 py-2.5 text-sm", overBalance ? "bg-clay-soft text-[#8c3c1f]" : "bg-sand text-muted")}>
          <span>Saldo tabungan Anda</span>
          <span className="font-semibold">{selfBalance} hari</span>
        </div>
      )}

      <Field label="Alasan">
        <Textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="cth. Ambil libur ganti kerja hari Minggu…" />
      </Field>

      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>Batal</Button>
        <Button type="submit" className="flex-1" disabled={saving || overBalance}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Ajukan
        </Button>
      </div>
    </form>
  );
}
