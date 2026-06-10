"use client";

import { useMemo, useState } from "react";
import { Crown, Pencil, Users2 } from "lucide-react";
import type { Employee, Team } from "@/lib/types";
import { TEAM_META, TEAMS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";

type Emp = Employee;

/** A single field update sent to /api/employees. */
interface Patch {
  id: string;
  team?: Team;
  managerId?: string | null;
}

const byName = (a: Emp, b: Emp) => a.name.localeCompare(b.name);

export function OrgView({ initial }: { initial: Emp[] }) {
  const [list, setList] = useState<Emp[]>(initial);
  const [editing, setEditing] = useState<Emp | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const byId = useMemo(() => new Map(list.map((e) => [e.id, e])), [list]);

  // A manager link is only "real" when it points to an active colleague in the
  // SAME division. Anything else (null, moved-away, inactive) makes the node a root.
  function parentValid(e: Emp): boolean {
    if (!e.managerId) return false;
    const m = byId.get(e.managerId);
    return !!m && m.status === "active" && m.team === e.team;
  }
  const childrenOf = (id: string) => list.filter((e) => e.managerId === id && parentValid(e)).sort(byName);
  const rootsOf = (team: Team) => list.filter((e) => e.team === team && !parentValid(e)).sort(byName);

  function descendantsOf(id: string): Set<string> {
    const out = new Set<string>();
    const stack = childrenOf(id).map((c) => c.id);
    while (stack.length) {
      const x = stack.pop()!;
      if (out.has(x)) continue;
      out.add(x);
      for (const c of childrenOf(x)) stack.push(c.id);
    }
    return out;
  }

  async function commit(patches: Patch[]): Promise<boolean> {
    const prev = list;
    setList((cur) =>
      cur.map((e) => {
        const p = patches.find((x) => x.id === e.id);
        if (!p) return e;
        return {
          ...e,
          ...(p.team !== undefined ? { team: p.team } : {}),
          ...("managerId" in p ? { managerId: p.managerId ?? null } : {}),
        };
      }),
    );
    try {
      const oks = await Promise.all(
        patches.map((p) =>
          fetch("/api/employees", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(p),
          })
            .then((r) => r.ok)
            .catch(() => false),
        ),
      );
      if (oks.some((ok) => !ok)) {
        setList(prev);
        toast.error("Gagal memperbarui struktur. Pastikan Anda HR/admin.");
        return false;
      }
      toast.success("Struktur organisasi diperbarui ✓");
      return true;
    } catch {
      setList(prev);
      toast.error("Koneksi bermasalah. Coba lagi.");
      return false;
    }
  }

  async function handleSave(emp: Emp, next: { team: Team; managerId: string | null }) {
    const teamChanged = next.team !== emp.team;
    const mgrChanged = (next.managerId ?? null) !== (emp.managerId ?? null);
    if (!teamChanged && !mgrChanged) {
      setEditing(null);
      return;
    }
    const patches: Patch[] = [{ id: emp.id, team: next.team, managerId: next.managerId }];
    // Moving someone out of a division would orphan their reports — re-point those
    // reports to the moved person's former manager so the old tree stays intact.
    if (teamChanged) {
      for (const r of list) {
        if (r.managerId === emp.id && r.team === emp.team) {
          patches.push({ id: r.id, managerId: emp.managerId ?? null });
        }
      }
    }
    setSaving(true);
    const ok = await commit(patches);
    setSaving(false);
    if (ok) setEditing(null);
  }

  const totalHeads = TEAMS.reduce((s, t) => s + rootsOf(t).length, 0);

  return (
    <div className="space-y-4 fade-up">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Karyawan aktif" value={list.length} />
        <Stat label="Divisi" value={TEAMS.length} />
        <Stat label="Kepala divisi" value={totalHeads} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {TEAMS.map((team) => {
          const meta = TEAM_META[team];
          const roots = rootsOf(team);
          const count = list.filter((e) => e.team === team).length;
          return (
            <section key={team} className="card overflow-hidden">
              <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <span className={cn("rounded-lg px-2.5 py-1 text-xs font-semibold", meta.chip)}>{meta.label}</span>
                  <span className="text-xs text-faint">{count} orang</span>
                </div>
              </header>
              <div className="space-y-0.5 p-3">
                {roots.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-faint">Belum ada karyawan di divisi ini.</p>
                ) : (
                  roots.map((e) => <Node key={e.id} emp={e} childrenOf={childrenOf} onEdit={setEditing} />)
                )}
              </div>
            </section>
          );
        })}
      </div>

      <Sheet
        open={!!editing}
        onClose={() => !saving && setEditing(null)}
        title="Atur Posisi"
        description={editing ? editing.name : ""}
      >
        {editing && (
          <PositionForm
            emp={editing}
            all={list}
            banned={descendantsOf(editing.id)}
            saving={saving}
            onCancel={() => setEditing(null)}
            onSubmit={(next) => handleSave(editing, next)}
          />
        )}
      </Sheet>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-0.5 px-3 py-3 text-center">
      <span className="font-display text-2xl font-bold text-ink">{value}</span>
      <span className="text-xs text-faint">{label}</span>
    </div>
  );
}

function Node({
  emp,
  childrenOf,
  onEdit,
}: {
  emp: Emp;
  childrenOf: (id: string) => Emp[];
  onEdit: (e: Emp) => void;
}) {
  const kids = childrenOf(emp.id);
  const isHead = !emp.managerId; // roots passed here have no valid parent
  return (
    <div>
      <div className="group flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-sand/60">
        <Avatar name={emp.name} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium text-ink">{emp.name}</p>
            {isHead && (
              <Badge tone="gold" className="gap-1">
                <Crown className="h-3 w-3" /> Kepala
              </Badge>
            )}
          </div>
          <p className="truncate text-xs text-faint">
            {emp.position}
            {kids.length > 0 && (
              <span className="text-muted"> · {kids.length} bawahan</span>
            )}
          </p>
        </div>
        <button
          onClick={() => onEdit(emp)}
          className="shrink-0 rounded-lg p-1.5 text-faint transition-colors hover:bg-cream hover:text-ink"
          aria-label={`Atur posisi ${emp.name}`}
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>
      {kids.length > 0 && (
        <div className="ml-4 space-y-0.5 border-l border-line pl-2">
          {kids.map((k) => (
            <Node key={k.id} emp={k} childrenOf={childrenOf} onEdit={onEdit} />
          ))}
        </div>
      )}
    </div>
  );
}

function PositionForm({
  emp,
  all,
  banned,
  saving,
  onCancel,
  onSubmit,
}: {
  emp: Emp;
  all: Emp[];
  banned: Set<string>; // descendants — cannot become this person's manager (no cycles)
  saving: boolean;
  onCancel: () => void;
  onSubmit: (next: { team: Team; managerId: string | null }) => void;
}) {
  const [team, setTeam] = useState<Team>(emp.team);
  const [managerId, setManagerId] = useState<string>(emp.managerId ?? "");

  // Valid superiors: active colleagues in the chosen division, not self, not a
  // descendant (which would create a loop).
  const options = useMemo(
    () => all.filter((e) => e.status === "active" && e.team === team && e.id !== emp.id && !banned.has(e.id)).sort(byName),
    [all, team, emp.id, banned],
  );
  // If the selected manager isn't valid for the chosen division, fall back to head.
  const effectiveManager = options.some((o) => o.id === managerId) ? managerId : "";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ team, managerId: effectiveManager || null });
      }}
      className="space-y-4"
    >
      <div className="flex items-center gap-3 rounded-xl border border-line bg-sand px-3 py-2.5">
        <Avatar name={emp.name} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{emp.name}</p>
          <p className="truncate text-xs text-faint">{emp.position}</p>
        </div>
      </div>

      <Field label="Divisi" hint="Memindahkan ke divisi lain mengubah jalur persetujuan cutinya.">
        <Select value={team} onChange={(e) => setTeam(e.target.value as Team)}>
          {TEAMS.map((t) => (
            <option key={t} value={t}>
              {TEAM_META[t].label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Atasan langsung" hint="Kosongkan untuk menjadikannya kepala divisi.">
        <Select value={effectiveManager} onChange={(e) => setManagerId(e.target.value)}>
          <option value="">— Tidak ada (kepala divisi) —</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} — {o.position}
            </option>
          ))}
        </Select>
        {options.length === 0 && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-faint">
            <Users2 className="h-3.5 w-3.5" /> Belum ada kandidat atasan di divisi ini — akan menjadi kepala divisi.
          </p>
        )}
      </Field>

      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>
          Batal
        </Button>
        <Button type="submit" className="flex-1" disabled={saving}>
          Simpan
        </Button>
      </div>
    </form>
  );
}
