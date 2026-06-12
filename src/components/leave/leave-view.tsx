"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, Check, Loader2, Paperclip, PiggyBank, Plus, X } from "lucide-react";
import type { Employee, LeaveBalance, LeaveRequest, LeaveType, RequestStatus, TabunganEntry, Team } from "@/lib/types";
import { TEAM_META } from "@/lib/constants";
import { compressImageDataUrl } from "@/lib/image";
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
  "tukar-libur": "Tukar libur",
};

type Tab = "requests" | "balances";

export function LeaveView({
  requests,
  balances,
  tabungan = [],
  employees,
  currentUserName = "HR",
  currentEmployeeId = null,
  canRequestForOthers = true,
  canApproveAll = false,
  approverTeam = null,
}: {
  requests: LeaveRequest[];
  balances: LeaveBalance[];
  tabungan?: TabunganEntry[];
  employees: Pick<Employee, "id" | "name" | "team" | "position">[];
  currentUserName?: string;
  currentEmployeeId?: string | null;
  canRequestForOthers?: boolean;
  /** HR/admin: may approve any request, any division. */
  canApproveAll?: boolean;
  /** Division a manager heads; may approve only this team's requests (not their own). */
  approverTeam?: Team | null;
}) {
  const [tab, setTab] = useState<Tab>("requests");
  const [list, setList] = useState(requests);
  const [adding, setAdding] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const toast = useToast();
  const router = useRouter();
  // A plain employee only ever sees their own rows, so the name/avatar per row
  // is redundant. Show it only for approvers (HR/admin or a division manager).
  const showEmployee = canApproveAll || approverTeam != null;

  // Who may act on a given request: HR/admin on anyone; a division manager only on
  // their own team's members, and never on their own request.
  const canDecide = useMemo(
    () => (r: LeaveRequest) => {
      if (canApproveAll) return true;
      if (!approverTeam) return false;
      if (r.employeeId === currentEmployeeId) return false;
      return empMap.get(r.employeeId)?.team === approverTeam;
    },
    [canApproveAll, approverTeam, currentEmployeeId, empMap],
  );

  async function decide(id: string, status: RequestStatus) {
    const prev = list.find((r) => r.id === id);
    if (!prev) return;
    setDecidingId(id);
    // Optimistic — revert on failure.
    setList((cur) => cur.map((r) => (r.id === id ? { ...r, status, approver: currentUserName } : r)));
    try {
      const res = await fetch("/api/leave", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, approver: currentUserName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.request) {
        setList((cur) => cur.map((r) => (r.id === id ? prev : r)));
        toast.error("Gagal memproses. Anda hanya bisa menyetujui karyawan di divisi Anda.");
        return;
      }
      setList((cur) => cur.map((r) => (r.id === id ? data.request : r)));
      toast.success(status === "approved" ? "Pengajuan disetujui ✓" : "Pengajuan ditolak ✓");
      router.refresh(); // sinkronkan saldo & halaman lain di latar belakang
    } catch {
      setList((cur) => cur.map((r) => (r.id === id ? prev : r)));
      toast.error("Koneksi bermasalah. Coba lagi.");
    } finally {
      setDecidingId(null);
    }
  }

  function addRequest(r: LeaveRequest) {
    setList((prev) => [r, ...prev]);
    setAdding(false);
    toast.success("Pengajuan cuti/izin terkirim ✓");
    router.refresh();
  }

  // Only count requests the current user can actually act on.
  const pending = list.filter((r) => r.status === "pending" && canDecide(r)).length;

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
          {list.length === 0 && (
            <div className="card px-5 py-10 text-center text-sm text-faint">Belum ada pengajuan cuti/izin.</div>
          )}
          {list.map((r) => {
            const emp = empMap.get(r.employeeId);
            return (
              <div key={r.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                {showEmployee && (
                  <div className="flex items-center gap-3 sm:w-52">
                    <Avatar name={emp?.name ?? "?"} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{emp?.name}</p>
                      <p className="truncate text-xs text-faint">
                        {emp && <span className={TEAM_META[emp.team].tone}>{TEAM_META[emp.team].label}</span>}
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={r.type === "sick" ? "olive" : r.type === "tukar-libur" ? "matcha" : "sky"}>
                      {LEAVE_LABEL[r.type]}
                    </Badge>
                    <span className="text-sm font-medium text-ink">{r.days} hari</span>
                    <span className="text-sm text-muted">
                      {formatDate(r.startDate)} – {formatDate(r.endDate)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm text-faint">{r.reason}</p>
                  {r.proofPath && (
                    <a
                      href={`/api/leave/proof?path=${encodeURIComponent(r.proofPath)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-sky hover:underline"
                    >
                      <Paperclip className="h-3.5 w-3.5" /> Lihat bukti
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2 sm:w-auto">
                  {r.status === "pending" && canDecide(r) ? (
                    <>
                      <Button size="sm" disabled={decidingId === r.id} onClick={() => decide(r.id, "approved")} className="flex-1 sm:flex-none">
                        <Check className="h-4 w-4" /> Setujui
                      </Button>
                      <Button size="sm" variant="outline" disabled={decidingId === r.id} onClick={() => decide(r.id, "rejected")} className="flex-1 sm:flex-none">
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
        <BalancesView balances={balances} tabungan={tabungan} employees={employees} showEmployee={showEmployee} />
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Ajukan Cuti / Izin" description="Buat permintaan baru">
        <LeaveForm
          employees={employees}
          currentEmployeeId={currentEmployeeId}
          canRequestForOthers={canRequestForOthers}
          onSubmit={addRequest}
          onCancel={() => setAdding(false)}
        />
      </Sheet>
    </div>
  );
}

function BalancesView({
  balances,
  tabungan,
  employees,
  showEmployee = true,
}: {
  balances: LeaveBalance[];
  tabungan: TabunganEntry[];
  employees: Pick<Employee, "id" | "name" | "team" | "position">[];
  /** false = tampilan mandiri karyawan: tanpa framing org-wide & tanpa identitas per baris. */
  showEmployee?: boolean;
}) {
  const empMap = new Map(employees.map((e) => [e.id, e]));
  const totalSaved = balances.reduce((s, b) => s + b.tabunganLibur, 0);
  // Group ledger entries by employee, newest first, for the per-row history.
  const ledgerByEmp = new Map<string, TabunganEntry[]>();
  for (const e of tabungan) {
    const arr = ledgerByEmp.get(e.employeeId) ?? [];
    arr.push(e);
    ledgerByEmp.set(e.employeeId, arr);
  }
  for (const arr of ledgerByEmp.values()) {
    arr.sort((a, b) => b.eventDate.localeCompare(a.eventDate));
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <CardContent className="flex items-center gap-4 bg-bark text-cream">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-forest-700">
            <PiggyBank className="h-6 w-6 text-lime" />
          </span>
          <div>
            <p className="text-sm text-forest-100/70">
              {showEmployee ? "Total Tabungan Libur (semua karyawan)" : "Tabungan Libur Anda"}
            </p>
            <p className="font-display text-3xl font-bold">{totalSaved} hari</p>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>{showEmployee ? "Saldo Cuti per Karyawan" : "Saldo Cuti Saya"}</CardTitle>
        </CardHeader>
        <div className="divide-y divide-line">
          {balances.map((b) => {
            const emp = empMap.get(b.employeeId);
            if (!emp) return null;
            const remaining = b.annualQuota - b.annualUsed;
            return (
              <div key={b.employeeId} className="px-5 py-4">
                {showEmployee && (
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
                )}
                <div className={cn("grid gap-3 sm:grid-cols-3", showEmployee && "mt-3")}>
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
                <TabunganLedger entries={ledgerByEmp.get(b.employeeId) ?? []} />
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

const LEDGER_STATUS: Record<RequestStatus, string> = {
  pending: "menunggu",
  approved: "disetujui",
  rejected: "ditolak",
};

/** Per-employee tabungan libur history (deposits in / withdrawals out). */
function TabunganLedger({ entries }: { entries: TabunganEntry[] }) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;
  const shown = open ? entries : entries.slice(0, 3);
  return (
    <div className="mt-3 rounded-xl bg-sand/60 px-3 py-2.5">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">Riwayat tabungan libur</p>
      <ul className="space-y-1">
        {shown.map((e) => {
          const isDeposit = e.kind === "deposit";
          return (
            <li key={e.id} className="flex items-center gap-2 text-xs">
              <span className={cn("flex h-5 w-5 items-center justify-center rounded-full", isDeposit ? "bg-[#e9f0d8] text-forest-600" : "bg-clay-soft text-[#8c3c1f]")}>
                {isDeposit ? <ArrowDownToLine className="h-3 w-3" /> : <ArrowUpFromLine className="h-3 w-3" />}
              </span>
              <span className={cn("font-semibold tabular-nums", isDeposit ? "text-forest-700" : "text-[#8c3c1f]")}>
                {isDeposit ? "+" : "−"}{e.days}
              </span>
              <span className="text-muted">{formatDate(e.eventDate)}</span>
              <span className="min-w-0 flex-1 truncate text-faint">{e.reason || (isDeposit ? "Setor" : "Cairkan")}</span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                  e.status === "approved" ? "bg-[#e9f0d8] text-forest-600" : e.status === "rejected" ? "bg-clay-soft text-[#8c3c1f]" : "bg-gold/15 text-[#8a6d1f]",
                )}
              >
                {LEDGER_STATUS[e.status]}
              </span>
            </li>
          );
        })}
      </ul>
      {entries.length > 3 && (
        <button onClick={() => setOpen((v) => !v)} className="mt-1.5 cursor-pointer text-[11px] font-medium text-sky hover:underline">
          {open ? "Tutup" : `Lihat semua (${entries.length})`}
        </button>
      )}
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
  currentEmployeeId = null,
  canRequestForOthers = true,
  onSubmit,
  onCancel,
}: {
  employees: Pick<Employee, "id" | "name" | "team" | "position">[];
  currentEmployeeId?: string | null;
  canRequestForOthers?: boolean;
  onSubmit: (r: LeaveRequest) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  // Non-managers can only file for themselves — lock the employee to their own record.
  const selfEmployee = currentEmployeeId ? employees.find((e) => e.id === currentEmployeeId) : undefined;
  const lockToSelf = !canRequestForOthers && !!selfEmployee;
  const [form, setForm] = useState({
    employeeId: lockToSelf ? selfEmployee!.id : employees[0]?.id ?? "",
    type: "annual" as LeaveType,
    startDate: "",
    endDate: "",
    reason: "",
  });
  // Optional proof attachment (image or PDF), read client-side into a data URL.
  const [proof, setProof] = useState<{ dataUrl: string; name: string } | null>(null);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file after removal
    if (!file) return;
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast.error("Hanya file gambar atau PDF yang didukung.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Ukuran file maksimal 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      // Kompres gambar sebelum upload agar storage tidak cepat penuh (PDF dilewatkan).
      const dataUrl = await compressImageDataUrl(String(reader.result));
      setProof({ dataUrl, name: file.name });
    };
    reader.onerror = () => toast.error("Gagal membaca file.");
    reader.readAsDataURL(file);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Validation — surfaces a real "tidak berhasil" path via toast.
    if (!form.employeeId) {
      toast.error("Pilih karyawan dulu.");
      return;
    }
    if (!form.startDate || !form.endDate) {
      toast.error("Tanggal mulai & selesai wajib diisi.");
      return;
    }
    if (form.endDate < form.startDate) {
      toast.error("Tanggal selesai tidak boleh sebelum tanggal mulai.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: form.employeeId,
          type: form.type,
          startDate: form.startDate,
          endDate: form.endDate,
          reason: form.reason,
          proofFile: proof?.dataUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.request) {
        const msg: Record<string, string> = {
          end_before_start: "Tanggal selesai tidak boleh sebelum tanggal mulai.",
          invalid_proof_type: "Bukti harus berupa gambar atau PDF.",
          proof_too_large: "Ukuran file bukti maksimal 5 MB.",
          proof_upload_failed: "Gagal mengunggah file bukti. Coba lagi.",
        };
        toast.error(msg[data.error as string] ?? "Gagal mengajukan. Pastikan Anda HR/admin.");
        return;
      }
      onSubmit(data.request as LeaveRequest);
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
              <p className="truncate text-xs text-faint">{TEAM_META[selfEmployee!.team as Team].label}</p>
            </div>
          </div>
        </Field>
      ) : (
        <Field label="Karyawan">
          <Select value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name} — {TEAM_META[e.team as Team].label}</option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Jenis">
        <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as LeaveType }))}>
          {(["annual", "sick", "unpaid", "tukar-libur"] as LeaveType[]).map((t) => (
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
      <Field label="Bukti (opsional)">
        {proof ? (
          <div className="flex items-center gap-3 rounded-xl border border-line bg-sand px-3 py-2.5">
            <Paperclip className="h-4 w-4 shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate text-sm text-ink">{proof.name}</span>
            <button type="button" onClick={() => setProof(null)} className="shrink-0 text-faint transition-colors hover:text-ink" aria-label="Hapus lampiran">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line bg-sand/40 px-3 py-2.5 text-sm text-muted transition-colors hover:bg-sand">
            <Paperclip className="h-4 w-4" />
            Lampirkan gambar atau PDF
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={pickFile} />
          </label>
        )}
        <p className="mt-1 text-xs text-faint">Maks. 5 MB. Tidak wajib.</p>
      </Field>
      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>Batal</Button>
        <Button type="submit" className="flex-1" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Ajukan
        </Button>
      </div>
    </form>
  );
}
