"use client";

import { useMemo, useState } from "react";
import { Building2, Mail, Phone, Plus, Search, Wallet } from "lucide-react";
import type { Employee, Team } from "@/lib/types";
import { TEAMS, TEAM_META } from "@/lib/constants";
import { cn, formatDate, rupiah } from "@/lib/utils";
import { PTKP_OPTIONS } from "@/lib/payroll";
import { Avatar } from "@/components/ui/avatar";
import { Badge, EmployeeStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";

type StatusFilter = "all" | "active" | "inactive";

export function EmployeesView({ initial }: { initial: Employee[] }) {
  const [list, setList] = useState<Employee[]>(initial);
  const [q, setQ] = useState("");
  const [team, setTeam] = useState<"all" | Team>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<Employee | null>(null);
  const [adding, setAdding] = useState(false);

  const filtered = useMemo(() => {
    return list.filter((e) => {
      if (team !== "all" && e.team !== team) return false;
      if (status !== "all" && e.status !== status) return false;
      if (q && !`${e.name} ${e.nik} ${e.position} ${e.email}`.toLowerCase().includes(q.toLowerCase()))
        return false;
      return true;
    });
  }, [list, q, team, status]);

  const counts = {
    all: list.length,
    active: list.filter((e) => e.status === "active").length,
    inactive: list.filter((e) => e.status === "inactive").length,
  };

  function toggleStatus(emp: Employee) {
    setList((prev) =>
      prev.map((e) =>
        e.id === emp.id ? { ...e, status: e.status === "active" ? "inactive" : "active" } : e,
      ),
    );
    setSelected((s) => (s && s.id === emp.id ? { ...s, status: s.status === "active" ? "inactive" : "active" } : s));
  }

  function addEmployee(emp: Employee) {
    setList((prev) => [emp, ...prev]);
    setAdding(false);
  }

  return (
    <div className="space-y-4 fade-up">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama, NIK, posisi…"
            className="pl-9"
            aria-label="Cari karyawan"
          />
        </div>
        <Button onClick={() => setAdding(true)} className="shrink-0">
          <Plus className="h-4 w-4" /> Tambah Karyawan
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip active={status === "all"} onClick={() => setStatus("all")}>
          Semua ({counts.all})
        </FilterChip>
        <FilterChip active={status === "active"} onClick={() => setStatus("active")}>
          Aktif ({counts.active})
        </FilterChip>
        <FilterChip active={status === "inactive"} onClick={() => setStatus("inactive")}>
          Nonaktif ({counts.inactive})
        </FilterChip>
        <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
        <FilterChip active={team === "all"} onClick={() => setTeam("all")}>
          Semua tim
        </FilterChip>
        {TEAMS.map((t) => (
          <FilterChip key={t} active={team === t} onClick={() => setTeam(t)}>
            {TEAM_META[t].label}
          </FilterChip>
        ))}
      </div>

      {/* Desktop table */}
      <Card className="hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-cream/50 text-left text-xs font-semibold uppercase tracking-wide text-faint">
                <th className="px-5 py-3">Karyawan</th>
                <th className="px-5 py-3">Tim</th>
                <th className="px-5 py-3">Posisi</th>
                <th className="px-5 py-3">Bergabung</th>
                <th className="px-5 py-3 text-right">Gaji pokok</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => setSelected(e)}
                  className="cursor-pointer transition-colors hover:bg-cream/60"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={e.name} size="sm" />
                      <div>
                        <p className="font-medium text-ink">{e.name}</p>
                        <p className="text-xs text-faint">{e.nik}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", TEAM_META[e.team].chip)}>
                      {TEAM_META[e.team].label}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted">{e.position}</td>
                  <td className="px-5 py-3 text-muted">{formatDate(e.joinDate)}</td>
                  <td className="px-5 py-3 text-right font-medium text-ink">{rupiah(e.baseSalary)}</td>
                  <td className="px-5 py-3">
                    <EmployeeStatusBadge status={e.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <EmptyRow />}
      </Card>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {filtered.map((e) => (
          <button
            key={e.id}
            onClick={() => setSelected(e)}
            className="card flex w-full items-center gap-3 p-4 text-left transition-colors active:bg-cream/60"
          >
            <Avatar name={e.name} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-medium text-ink">{e.name}</p>
                <EmployeeStatusBadge status={e.status} />
              </div>
              <p className="truncate text-xs text-faint">{e.position}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", TEAM_META[e.team].chip)}>
                  {TEAM_META[e.team].label}
                </span>
                <span className="text-xs text-muted">{rupiah(e.baseSalary, { compact: true })}</span>
              </div>
            </div>
          </button>
        ))}
        {filtered.length === 0 && <EmptyRow />}
      </div>

      {/* Detail drawer */}
      <Sheet
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ""}
        description={selected ? `${selected.nik} · ${selected.position}` : ""}
        footer={
          selected && (
            <div className="flex gap-2">
              <Button
                variant={selected.status === "active" ? "outline" : "primary"}
                className="flex-1"
                onClick={() => toggleStatus(selected)}
              >
                {selected.status === "active" ? "Nonaktifkan" : "Aktifkan"}
              </Button>
              <Button variant="secondary" className="flex-1">
                Edit data
              </Button>
            </div>
          )
        }
      >
        {selected && <EmployeeDetail emp={selected} />}
      </Sheet>

      {/* Add form */}
      <Sheet open={adding} onClose={() => setAdding(false)} title="Tambah Karyawan" description="Daftarkan karyawan baru ke database">
        <EmployeeForm onSubmit={addEmployee} onCancel={() => setAdding(false)} count={list.length} />
      </Sheet>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-forest-600 text-cream" : "bg-panel text-muted ring-1 ring-line hover:bg-sand",
      )}
    >
      {children}
    </button>
  );
}

function EmployeeDetail({ emp }: { emp: Employee }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Avatar name={emp.name} size="lg" />
        <div>
          <div className="flex items-center gap-2">
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", TEAM_META[emp.team].chip)}>
              {TEAM_META[emp.team].label}
            </span>
            <EmployeeStatusBadge status={emp.status} />
          </div>
          <p className="mt-1.5 text-sm text-muted">{emp.location}</p>
        </div>
      </div>

      <div className="space-y-2.5">
        <DetailRow icon={<Mail className="h-4 w-4" />} label="Email" value={emp.email} />
        <DetailRow icon={<Phone className="h-4 w-4" />} label="Telepon" value={emp.phone} />
        <DetailRow icon={<Building2 className="h-4 w-4" />} label="Bergabung" value={formatDate(emp.joinDate, "long")} />
        {emp.endDate && <DetailRow icon={<Building2 className="h-4 w-4" />} label="Berakhir" value={formatDate(emp.endDate, "long")} />}
      </div>

      <div className="rounded-2xl border border-line bg-panel p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Wallet className="h-4 w-4 text-forest-600" /> Kompensasi & Pajak
        </h3>
        <dl className="mt-3 grid grid-cols-2 gap-y-3 text-sm">
          <Stat label="Gaji pokok" value={rupiah(emp.baseSalary)} />
          <Stat label="Tunjangan" value={rupiah(emp.allowance)} />
          <Stat label="Status PTKP" value={emp.ptkp} />
          <Stat label="NPWP" value={emp.npwp ?? "—"} />
          <Stat label="BPJS Kesehatan" value={emp.bpjsKes ? "Aktif" : "—"} />
          <Stat label="BPJS Ketenagakerjaan" value={emp.bpjsTk ? "Aktif" : "—"} />
        </dl>
      </div>

      <div className="rounded-2xl border border-line bg-panel p-4">
        <h3 className="text-sm font-semibold text-ink">Rekening Gaji</h3>
        <p className="mt-2 text-sm text-muted">
          {emp.bankName} · <span className="font-medium text-ink">{emp.bankAccount}</span>
        </p>
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2.5">
      <span className="text-faint">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-faint">{label}</p>
        <p className="truncate text-sm font-medium text-ink">{value}</p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}

function EmptyRow() {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-12 text-center">
      <p className="text-sm font-medium text-ink">Tidak ada karyawan</p>
      <p className="text-sm text-faint">Coba ubah filter atau kata kunci pencarian.</p>
    </div>
  );
}

function EmployeeForm({
  onSubmit,
  onCancel,
  count,
}: {
  onSubmit: (e: Employee) => void;
  onCancel: () => void;
  count: number;
}) {
  const [form, setForm] = useState({
    name: "",
    position: "",
    team: "factory" as Team,
    email: "",
    phone: "",
    baseSalary: "3500000",
    allowance: "500000",
    ptkp: "TK/0",
    bankName: "BCA",
    bankAccount: "",
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const id = "e" + String(100 + count);
    onSubmit({
      id,
      nik: `TRL-${String(900 + count)}`,
      name: form.name || "Karyawan Baru",
      email: form.email,
      phone: form.phone,
      team: form.team,
      position: form.position || "Staff",
      status: "active",
      joinDate: new Date().toISOString().slice(0, 10),
      baseSalary: Number(form.baseSalary) || 0,
      allowance: Number(form.allowance) || 0,
      ptkp: form.ptkp as Employee["ptkp"],
      npwp: null,
      bpjsKes: true,
      bpjsTk: true,
      bankName: form.bankName,
      bankAccount: form.bankAccount || "—",
      location: form.team === "farm" ? "Farm · Bali" : form.team === "factory" ? "Factory · Bali" : "Office · Bali",
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nama lengkap" htmlFor="f-name">
        <Input id="f-name" required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="cth. Wayan Putra" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tim">
          <Select value={form.team} onChange={(e) => set("team", e.target.value as Team)}>
            {TEAMS.map((t) => (
              <option key={t} value={t}>{TEAM_META[t].label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Posisi">
          <Input value={form.position} onChange={(e) => set("position", e.target.value)} placeholder="cth. Operator" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email">
          <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="nama@treelogy.com" />
        </Field>
        <Field label="Telepon">
          <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="0812-…" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Gaji pokok (Rp)">
          <Input type="number" value={form.baseSalary} onChange={(e) => set("baseSalary", e.target.value)} />
        </Field>
        <Field label="Tunjangan (Rp)">
          <Input type="number" value={form.allowance} onChange={(e) => set("allowance", e.target.value)} />
        </Field>
      </div>
      <Field label="Status PTKP" hint="Menentukan kategori tarif PPh 21 (TER)">
        <Select value={form.ptkp} onChange={(e) => set("ptkp", e.target.value)}>
          {PTKP_OPTIONS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bank">
          <Select value={form.bankName} onChange={(e) => set("bankName", e.target.value)}>
            {["BCA", "Mandiri", "BRI", "BNI"].map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </Select>
        </Field>
        <Field label="No. rekening">
          <Input value={form.bankAccount} onChange={(e) => set("bankAccount", e.target.value)} />
        </Field>
      </div>
      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
          Batal
        </Button>
        <Button type="submit" className="flex-1">
          Simpan
        </Button>
      </div>
    </form>
  );
}
