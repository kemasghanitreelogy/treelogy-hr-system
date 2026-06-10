"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Active,
  type DragEndEvent,
  type DragOverEvent,
  type Over,
} from "@dnd-kit/core";
import { Crown, GripVertical, Loader2, Pencil, Plus, RotateCcw, Save, Users2 } from "lucide-react";
import type { Employee, Team } from "@/lib/types";
import { TEAM_META, TEAMS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";

/** A working copy of an employee; `_new` marks a not-yet-persisted addition. */
type Draft = Employee & { _new?: boolean };

const byName = (a: Draft, b: Draft) => a.name.localeCompare(b.name);
const clone = (list: Draft[]): Draft[] => list.map((e) => ({ ...e }));
const TEAM_PREFIX = "team:";

export function OrgView({ initial, canManage = false }: { initial: Employee[]; canManage?: boolean }) {
  const [base, setBase] = useState<Draft[]>(initial);
  const [draft, setDraft] = useState<Draft[]>(() => clone(initial));
  const [editing, setEditing] = useState<Draft | null>(null);
  const [adding, setAdding] = useState<Team | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Which node the pointer is over, and whether dropping there makes the dragged
  // person a subordinate ("child") or a peer at the same level ("sibling").
  const [nodeOver, setNodeOver] = useState<{ id: string; mode: "child" | "sibling" } | null>(null);
  const counter = useRef(0);
  const toast = useToast();

  // Touch-first: a short press-and-hold starts a drag so normal scrolling/taps
  // still work on phones. Mouse drags after a tiny move; keyboard is supported too.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const byId = useMemo(() => new Map(draft.map((e) => [e.id, e])), [draft]);

  function parentValid(e: Draft): boolean {
    if (!e.managerId) return false;
    const m = byId.get(e.managerId);
    return !!m && m.status === "active" && m.team === e.team;
  }
  const childrenOf = useCallback(
    (id: string) => draft.filter((e) => e.managerId === id && parentValid(e)).sort(byName),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, byId],
  );
  const rootsOf = (team: Team) => draft.filter((e) => e.team === team && !parentValid(e)).sort(byName);

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

  // ---- Mutations on the draft (no network until "Save all") ----

  function moveNode(id: string, newTeam: Team, newManagerId: string | null) {
    setDraft((cur) => {
      const node = cur.find((e) => e.id === id);
      if (!node) return cur;
      const subtree = node.team !== newTeam ? descendantsWithin(cur, id) : new Set<string>();
      return cur.map((e) => {
        if (e.id === id) return { ...e, team: newTeam, managerId: newManagerId };
        if (subtree.has(e.id)) return { ...e, team: newTeam };
        return e;
      });
    });
  }

  function addPerson(team: Team, name: string, position: string, managerId: string | null) {
    counter.current += 1;
    const node: Draft = {
      id: `new-${counter.current}`,
      _new: true,
      nik: "(baru)",
      name,
      email: "",
      phone: "",
      team,
      position: position || "Staff",
      status: "active",
      joinDate: "",
      baseSalary: 0,
      allowance: 0,
      ptkp: "TK/0",
      npwp: null,
      bpjsKes: true,
      bpjsTk: true,
      bankName: "",
      bankAccount: "",
      location: "Office · Bali",
      managerId,
    };
    setDraft((cur) => [...cur, node]);
    setAdding(null);
  }

  function editNode(id: string, team: Team, managerId: string | null) {
    setDraft((cur) => cur.map((e) => (e.id === id ? { ...e, team, managerId } : e)));
    setEditing(null);
  }

  // ---- Drag & drop (dnd-kit) ----

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return setNodeOver(null);
    const overId = String(over.id);
    if (overId.startsWith(TEAM_PREFIX) || overId === String(active.id)) return setNodeOver(null);
    setNodeOver({ id: overId, mode: dropMode(active, over) });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    setNodeOver(null);
    if (!over) return;
    const id = String(active.id);
    const overId = String(over.id);
    if (overId.startsWith(TEAM_PREFIX)) {
      moveNode(id, overId.slice(TEAM_PREFIX.length) as Team, null);
      return;
    }
    if (overId === id) return;
    const target = byId.get(overId);
    if (!target) return;
    // Centre of the row → subordinate of the target; top/bottom edge → peer
    // (share the target's manager / become a co-head).
    const mode = dropMode(active, over);
    const newManagerId = mode === "child" ? target.id : target.managerId ?? null;
    if (newManagerId && (newManagerId === id || descendantsOf(id).has(newManagerId))) {
      toast.error("Tidak bisa memindahkan ke bawahannya sendiri.");
      return;
    }
    moveNode(id, target.team, newManagerId);
  }

  // ---- Diff vs base ----

  const changes = useMemo(() => {
    const baseById = new Map(base.map((e) => [e.id, e]));
    const created = draft.filter((e) => e._new);
    const moved = draft.filter((e) => {
      if (e._new) return false;
      const b = baseById.get(e.id);
      return !!b && (b.team !== e.team || (b.managerId ?? null) !== (e.managerId ?? null));
    });
    return { created, moved, count: created.length + moved.length };
  }, [draft, base]);

  function discard() {
    setDraft(clone(base));
    toast.success("Perubahan dibatalkan.");
  }

  async function saveAll() {
    setSaving(true);
    let work = clone(draft);
    const idMap = new Map<string, string>();
    const nextBase = new Map(base.map((e) => [e.id, e] as const));
    const resolve = (mid: string | null | undefined) => (mid ? idMap.get(mid) ?? mid : null);
    try {
      for (const node of topoSortNew(work.filter((e) => e._new))) {
        const res = await fetch("/api/employees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: node.name,
            team: node.team,
            position: node.position,
            managerId: resolve(node.managerId),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.employee) throw new Error("create_failed");
        const real = data.employee as Employee;
        idMap.set(node.id, real.id);
        nextBase.set(real.id, real);
        work = work.map((e) =>
          e.id === node.id ? { ...real } : e.managerId === node.id ? { ...e, managerId: real.id } : e,
        );
      }
      const baseById = new Map(base.map((e) => [e.id, e]));
      const movedExisting = work.filter((e) => {
        if (e._new) return false;
        const b = baseById.get(e.id);
        return !!b && (b.team !== e.team || (b.managerId ?? null) !== (resolve(e.managerId) ?? null));
      });
      for (const node of movedExisting) {
        const res = await fetch("/api/employees", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: node.id, team: node.team, managerId: resolve(node.managerId) }),
        });
        if (!res.ok) throw new Error("update_failed");
        nextBase.set(node.id, { ...node, managerId: resolve(node.managerId) });
      }
      const saved = clone(work).map((e) => ({ ...e, _new: false }));
      setDraft(saved);
      setBase(clone(saved));
      toast.success(`${changes.count} perubahan tersimpan ✓`);
    } catch {
      setDraft(work);
      setBase(Array.from(nextBase.values()).map((e) => ({ ...e })));
      toast.error("Sebagian perubahan gagal disimpan. Periksa dan coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  const totalHeads = TEAMS.reduce((s, t) => s + rootsOf(t).length, 0);
  const dragging = !!activeId;
  const activeEmp = activeId ? byId.get(activeId) : null;

  return (
    <div className={cn("space-y-4 fade-up", canManage && changes.count > 0 && "pb-24")}>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Karyawan aktif" value={draft.length} />
        <Stat label="Divisi" value={TEAMS.length} />
        <Stat label="Kepala divisi" value={totalHeads} />
      </div>

      {canManage && (
        <p className="flex items-center gap-1.5 text-xs text-faint">
          <GripVertical className="h-3.5 w-3.5" /> Di HP, tahan sebentar lalu seret. Lepas di{" "}
          <b className="font-semibold">tengah</b> nama untuk menjadikannya bawahan, di{" "}
          <b className="font-semibold">tepi atas/bawah</b> untuk menjadikannya setara, atau di kotak “kepala
          divisi” untuk menjadikannya kepala.
        </p>
      )}

      <DndContext
        sensors={canManage ? sensors : []}
        collisionDetection={closestCenter}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setNodeOver(null);
        }}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {TEAMS.map((team) => {
            const meta = TEAM_META[team];
            const roots = rootsOf(team);
            const count = draft.filter((e) => e.team === team).length;
            return (
              <section key={team} className="card overflow-hidden">
                <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <span className={cn("rounded-lg px-2.5 py-1 text-xs font-semibold", meta.chip)}>{meta.label}</span>
                    <span className="text-xs text-faint">{count} orang</span>
                  </div>
                  {canManage && (
                    <Button size="sm" variant="outline" onClick={() => setAdding(team)}>
                      <Plus className="h-4 w-4" /> Tambah
                    </Button>
                  )}
                </header>
                <div className="space-y-0.5 p-3">
                  {roots.map((e) => (
                    <Node
                      key={e.id}
                      emp={e}
                      childrenOf={childrenOf}
                      nodeOver={nodeOver}
                      canManage={canManage}
                      onEdit={setEditing}
                    />
                  ))}
                  {canManage ? (
                    <HeadDropZone team={team} label={meta.label} active={dragging} empty={roots.length === 0} />
                  ) : (
                    roots.length === 0 && (
                      <p className="px-2 py-6 text-center text-sm text-faint">Belum ada karyawan di divisi ini.</p>
                    )
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <DragOverlay dropAnimation={null}>{activeEmp ? <OverlayCard emp={activeEmp} /> : null}</DragOverlay>
      </DndContext>

      {/* Floating "save all" bar */}
      {canManage && changes.count > 0 && (
        <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 sm:bottom-6">
          <div className="flex w-full max-w-xl items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3 shadow-pop">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-soft text-[#8a6512]">
              <Save className="h-4 w-4" />
            </span>
            <p className="flex-1 text-sm">
              <span className="font-semibold text-ink">{changes.count} perubahan</span>{" "}
              <span className="text-muted">
                belum disimpan
                {changes.created.length > 0 && ` · ${changes.created.length} baru`}
                {changes.moved.length > 0 && ` · ${changes.moved.length} pindah`}
              </span>
            </p>
            <Button variant="outline" size="sm" onClick={discard} disabled={saving}>
              <RotateCcw className="h-4 w-4" /> Batalkan
            </Button>
            <Button size="sm" onClick={saveAll} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Simpan Semua
            </Button>
          </div>
        </div>
      )}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title="Atur Posisi" description={editing?.name ?? ""}>
        {editing && (
          <PositionForm
            emp={editing}
            all={draft}
            banned={descendantsOf(editing.id)}
            onCancel={() => setEditing(null)}
            onSubmit={(next) => editNode(editing.id, next.team, next.managerId)}
          />
        )}
      </Sheet>

      <Sheet
        open={!!adding}
        onClose={() => setAdding(null)}
        title="Tambah Orang"
        description={adding ? `Ke divisi ${TEAM_META[adding].label}` : ""}
      >
        {adding && <AddForm team={adding} all={draft} onCancel={() => setAdding(null)} onAdd={addPerson} />}
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
  nodeOver,
  canManage,
  onEdit,
}: {
  emp: Draft;
  childrenOf: (id: string) => Draft[];
  nodeOver: { id: string; mode: "child" | "sibling" } | null;
  canManage: boolean;
  onEdit: (e: Draft) => void;
}) {
  const kids = childrenOf(emp.id);
  const isHead = !emp.managerId;
  const { attributes, listeners, setNodeRef: dragRef, isDragging } = useDraggable({ id: emp.id });
  const { setNodeRef: dropRef } = useDroppable({ id: emp.id });
  const setRef = useCallback(
    (el: HTMLElement | null) => {
      dragRef(el);
      dropRef(el);
    },
    [dragRef, dropRef],
  );
  const overChild = canManage && !isDragging && nodeOver?.id === emp.id && nodeOver.mode === "child";
  const overSibling = canManage && !isDragging && nodeOver?.id === emp.id && nodeOver.mode === "sibling";

  return (
    <div>
      {/* Peer-drop indicator: a level line above the row. */}
      {overSibling && <div className="mx-2 mb-1 h-0.5 rounded-full bg-forest-400" />}
      <div
        ref={canManage ? setRef : undefined}
        {...(canManage ? attributes : {})}
        {...(canManage ? listeners : {})}
        className={cn(
          // No `touch-none`: the TouchSensor delay distinguishes a scroll swipe
          // from a hold-drag, so the page still scrolls normally on phones.
          "group flex items-center gap-2 rounded-xl px-2 py-2 transition-colors",
          !canManage && "hover:bg-sand/60",
          canManage && (isDragging ? "opacity-40" : "cursor-grab hover:bg-sand/60 active:cursor-grabbing"),
          overChild && "bg-forest-50 ring-2 ring-forest-400",
        )}
      >
        {canManage && (
          <GripVertical className="h-4 w-4 shrink-0 text-line transition-colors group-hover:text-faint" />
        )}
        <Avatar name={emp.name || "?"} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium text-ink">{emp.name || "Tanpa nama"}</p>
            {isHead && (
              <Badge tone="gold" className="gap-1">
                <Crown className="h-3 w-3" /> Kepala
              </Badge>
            )}
            {emp._new && <Badge tone="matcha">Baru</Badge>}
          </div>
          <p className="truncate text-xs text-faint">
            {emp.position}
            {kids.length > 0 && <span className="text-muted"> · {kids.length} bawahan</span>}
          </p>
        </div>
        {canManage && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onEdit(emp)}
            className="shrink-0 rounded-lg p-1.5 text-faint transition-colors hover:bg-cream hover:text-ink"
            aria-label={`Atur posisi ${emp.name}`}
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </div>
      {kids.length > 0 && (
        <div className="ml-4 space-y-0.5 border-l border-line pl-2">
          {kids.map((k) => (
            <Node key={k.id} emp={k} childrenOf={childrenOf} nodeOver={nodeOver} canManage={canManage} onEdit={onEdit} />
          ))}
        </div>
      )}
    </div>
  );
}

function HeadDropZone({
  team,
  label,
  active,
  empty,
}: {
  team: Team;
  label: string;
  active: boolean;
  empty: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${TEAM_PREFIX}${team}` });
  if (!active && !empty) return null;
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-xl border-2 border-dashed px-3 py-4 text-center text-xs transition-colors",
        !empty && "mt-1",
        isOver ? "border-forest-400 bg-forest-50 font-medium text-forest-700" : "border-line text-faint",
      )}
    >
      {isOver
        ? `Lepas untuk jadikan kepala ${label}`
        : empty
          ? active
            ? "Lepas di sini untuk jadi kepala divisi"
            : "Belum ada karyawan — seret seseorang ke sini"
          : "Jadikan kepala divisi"}
    </div>
  );
}

function OverlayCard({ emp }: { emp: Draft }) {
  return (
    <div className="flex cursor-grabbing items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2 shadow-pop">
      <GripVertical className="h-4 w-4 shrink-0 text-faint" />
      <Avatar name={emp.name || "?"} size="sm" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{emp.name || "Tanpa nama"}</p>
        <p className="truncate text-xs text-faint">{emp.position}</p>
      </div>
    </div>
  );
}

function PositionForm({
  emp,
  all,
  banned,
  onCancel,
  onSubmit,
}: {
  emp: Draft;
  all: Draft[];
  banned: Set<string>;
  onCancel: () => void;
  onSubmit: (next: { team: Team; managerId: string | null }) => void;
}) {
  const [team, setTeam] = useState<Team>(emp.team);
  const [managerId, setManagerId] = useState<string>(emp.managerId ?? "");
  const options = useMemo(
    () => all.filter((e) => e.status === "active" && e.team === team && e.id !== emp.id && !banned.has(e.id)).sort(byName),
    [all, team, emp.id, banned],
  );
  const effective = options.some((o) => o.id === managerId) ? managerId : "";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ team, managerId: effective || null });
      }}
      className="space-y-4"
    >
      <div className="flex items-center gap-3 rounded-xl border border-line bg-sand px-3 py-2.5">
        <Avatar name={emp.name || "?"} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{emp.name || "Tanpa nama"}</p>
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
        <Select value={effective} onChange={(e) => setManagerId(e.target.value)}>
          <option value="">— Tidak ada (kepala divisi) —</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} — {o.position}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
          Batal
        </Button>
        <Button type="submit" className="flex-1">
          Terapkan
        </Button>
      </div>
    </form>
  );
}

function AddForm({
  team,
  all,
  onCancel,
  onAdd,
}: {
  team: Team;
  all: Draft[];
  onCancel: () => void;
  onAdd: (team: Team, name: string, position: string, managerId: string | null) => void;
}) {
  const candidates = useMemo(
    () => all.filter((e) => e.status === "active" && e.team === team).sort(byName),
    [all, team],
  );
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [managerId, setManagerId] = useState<string>(candidates.find((c) => !c.managerId)?.id ?? "");
  const toast = useToast();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) {
          toast.error("Nama wajib diisi.");
          return;
        }
        onAdd(team, name.trim(), position.trim(), managerId || null);
      }}
      className="space-y-4"
    >
      <Field label="Nama">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="cth. Nyoman Sari" autoFocus />
      </Field>
      <Field label="Jabatan">
        <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="cth. Production Operator" />
      </Field>
      <Field label="Atasan langsung" hint="Kosongkan untuk menambah sebagai kepala divisi.">
        <Select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
          <option value="">— Tidak ada (kepala divisi) —</option>
          {candidates.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name || "Tanpa nama"} — {o.position}
            </option>
          ))}
        </Select>
      </Field>
      <p className="flex items-start gap-1.5 text-xs text-faint">
        <Users2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Karyawan dibuat dengan data dasar (gaji, NIK, bank) yang
        bisa dilengkapi nanti di halaman Karyawan. Tersimpan saat menekan “Simpan Semua”.
      </p>
      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
          Batal
        </Button>
        <Button type="submit" className="flex-1">
          <Plus className="h-4 w-4" /> Tambahkan
        </Button>
      </div>
    </form>
  );
}

// ---- pure helpers ----

/**
 * Where the dragged row's centre sits over the target decides the relationship:
 * the middle band → subordinate ("child"); the top/bottom edge → peer ("sibling").
 */
function dropMode(active: Active, over: Over): "child" | "sibling" {
  const ar = active.rect.current.translated;
  const or = over.rect;
  if (!ar || !or.height) return "child";
  const rel = (ar.top + ar.height / 2 - or.top) / or.height;
  return rel < 0.34 || rel > 0.66 ? "sibling" : "child";
}

/** Descendants of `id` within a given list (same-division reporting links). */
function descendantsWithin(list: Draft[], id: string): Set<string> {
  const byId = new Map(list.map((e) => [e.id, e]));
  const valid = (e: Draft) => {
    if (!e.managerId) return false;
    const m = byId.get(e.managerId);
    return !!m && m.status === "active" && m.team === e.team;
  };
  const kids = (pid: string) => list.filter((e) => e.managerId === pid && valid(e));
  const out = new Set<string>();
  const stack = kids(id).map((c) => c.id);
  while (stack.length) {
    const x = stack.pop()!;
    if (out.has(x)) continue;
    out.add(x);
    for (const c of kids(x)) stack.push(c.id);
  }
  return out;
}

/** Order new nodes so a node whose manager is also new comes after that manager. */
function topoSortNew(newNodes: Draft[]): Draft[] {
  const newIds = new Set(newNodes.map((n) => n.id));
  const remaining = [...newNodes];
  const out: Draft[] = [];
  const placed = new Set<string>();
  let guard = 0;
  while (remaining.length && guard++ < 10_000) {
    for (let i = 0; i < remaining.length; i++) {
      const n = remaining[i];
      const waitsForNewParent = n.managerId && newIds.has(n.managerId) && !placed.has(n.managerId);
      if (!waitsForNewParent) {
        out.push(n);
        placed.add(n.id);
        remaining.splice(i, 1);
        i--;
      }
    }
  }
  return out.concat(remaining);
}
