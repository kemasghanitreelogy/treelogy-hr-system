"use client";

import { Fragment, useCallback, useMemo, useRef, useState } from "react";
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
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
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
/** One row in a division's flattened tree. */
interface Flat {
  id: string;
  emp: Draft;
  depth: number;
  parentId: string | null;
}

const INDENT = 22; // px per hierarchy level — also the horizontal drag step
const byName = (a: Draft, b: Draft) => a.name.localeCompare(b.name);
const clone = (list: Draft[]): Draft[] => list.map((e) => ({ ...e }));

export function OrgView({ initial, canManage = false }: { initial: Employee[]; canManage?: boolean }) {
  const [base, setBase] = useState<Draft[]>(initial);
  const [draft, setDraft] = useState<Draft[]>(() => clone(initial));
  const [editing, setEditing] = useState<Draft | null>(null);
  const [adding, setAdding] = useState<Team | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [offsetLeft, setOffsetLeft] = useState(0);
  const counter = useRef(0);
  const toast = useToast();

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

  const flatten = useCallback(
    (team: Team): Flat[] => {
      const out: Flat[] = [];
      const walk = (emp: Draft, depth: number, parentId: string | null) => {
        out.push({ id: emp.id, emp, depth, parentId });
        for (const c of childrenOf(emp.id)) walk(c, depth + 1, emp.id);
      };
      for (const r of rootsOf(team)) walk(r, 0, null);
      return out;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, childrenOf],
  );

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

  // ---- Drag & drop (depth projection, Notion-style) ----

  const activeEmp = activeId ? byId.get(activeId) : null;
  const activeSubtree = useMemo(() => (activeId ? descendantsOf(activeId) : new Set<string>()), [activeId, draft]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flattened rows of the dragged person's division, minus its own subtree
  // (the subtree travels with it). Drives both the live projection and rendering.
  const activeItems = useMemo(
    () => (activeEmp ? flatten(activeEmp.team).filter((i) => !activeSubtree.has(i.id)) : []),
    [activeEmp, flatten, activeSubtree],
  );
  const projection =
    activeId && overId ? getProjection(activeItems, activeId, overId, offsetLeft, INDENT) : null;

  function resetDrag() {
    setActiveId(null);
    setOverId(null);
    setOffsetLeft(0);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const id = String(active.id);
    const node = byId.get(id);
    resetDrag();
    if (!over || !node) return;
    const overEmp = byId.get(String(over.id));
    // Dropped onto another division → move there as a head.
    if (overEmp && overEmp.team !== node.team) {
      moveNode(id, overEmp.team, null);
      return;
    }
    // Within the division → use the projected parent/depth.
    const proj = getProjection(
      flatten(node.team).filter((i) => !descendantsOf(id).has(i.id)),
      id,
      String(over.id),
      offsetLeft,
      INDENT,
    );
    if (!proj) return;
    let parentId = proj.parentId;
    if (parentId === id || descendantsOf(id).has(parentId ?? "")) parentId = node.managerId ?? null;
    moveNode(id, node.team, parentId);
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
  const overTeam = overId ? byId.get(overId)?.team : undefined;

  // NOTE: no `fade-up` on this root — its retained transform (animation-fill-mode:
  // both) would establish a containing block and make the fixed-positioned
  // DragOverlay drift away from the cursor.
  return (
    <div className={cn("space-y-4", canManage && changes.count > 0 && "pb-24")}>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Karyawan aktif" value={draft.length} />
        <Stat label="Divisi" value={TEAMS.length} />
        <Stat label="Kepala divisi" value={totalHeads} />
      </div>

      {canManage && (
        <p className="text-xs leading-relaxed text-faint">
          <GripVertical className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
          Tahan lalu seret. Geser <b className="font-semibold text-muted">ke kanan</b> untuk jadi bawahan,{" "}
          <b className="font-semibold text-muted">ke kiri</b> untuk naik level. Lepas di kartu divisi lain untuk
          pindah divisi.
        </p>
      )}

      <DndContext
        sensors={canManage ? sensors : []}
        collisionDetection={closestCenter}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={(e) => {
          setActiveId(String(e.active.id));
          setOffsetLeft(0);
        }}
        onDragMove={({ delta }: DragMoveEvent) => setOffsetLeft(delta.x)}
        onDragOver={({ over }: DragOverEvent) => setOverId(over ? String(over.id) : null)}
        onDragEnd={onDragEnd}
        onDragCancel={resetDrag}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {TEAMS.map((team) => {
            const meta = TEAM_META[team];
            const full = flatten(team);
            const isActiveDivision = activeEmp?.team === team;
            const items = isActiveDivision ? activeItems : full;
            const count = draft.filter((e) => e.team === team).length;
            const crossTarget = !!activeEmp && overTeam === team && activeEmp.team !== team;
            return (
              <section
                key={team}
                className={cn("card overflow-hidden transition-shadow", crossTarget && "ring-2 ring-forest-400")}
              >
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
                <div className="p-3">
                  {items.length === 0 ? (
                    <p className="px-2 py-6 text-center text-sm text-faint">
                      {crossTarget ? "Lepas untuk pindah ke sini" : "Belum ada karyawan di divisi ini."}
                    </p>
                  ) : (
                    items.map((it) => (
                      <Fragment key={it.id}>
                        <Row item={it} canManage={canManage} dragging={it.id === activeId} onEdit={setEditing} />
                        {projection && isActiveDivision && overId === it.id && (
                          <Indicator depth={projection.depth} />
                        )}
                      </Fragment>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeEmp ? <OverlayCard emp={activeEmp} reports={activeSubtree.size} /> : null}
        </DragOverlay>
      </DndContext>

      {canManage && changes.count > 0 && (
        <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-3 sm:bottom-6">
          <div className="flex w-full max-w-xl items-center gap-2 rounded-2xl border border-line bg-panel px-3 py-2.5 shadow-pop sm:gap-3 sm:px-4 sm:py-3">
            <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-soft text-[#8a6512] sm:flex">
              <Save className="h-4 w-4" />
            </span>
            <p className="min-w-0 flex-1 text-sm leading-tight">
              <span className="font-semibold text-ink">{changes.count} perubahan</span>
              <span className="hidden text-muted sm:inline">
                {" belum disimpan"}
                {changes.created.length > 0 && ` · ${changes.created.length} baru`}
                {changes.moved.length > 0 && ` · ${changes.moved.length} pindah`}
              </span>
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={discard}
              disabled={saving}
              aria-label="Batalkan perubahan"
              className="shrink-0 whitespace-nowrap"
            >
              <RotateCcw className="h-4 w-4" /> <span className="hidden sm:inline">Batalkan</span>
            </Button>
            <Button size="sm" onClick={saveAll} disabled={saving} className="shrink-0 whitespace-nowrap">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Simpan<span className="hidden sm:inline"> Semua</span>
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

function Row({
  item,
  canManage,
  dragging,
  onEdit,
}: {
  item: Flat;
  canManage: boolean;
  dragging: boolean;
  onEdit: (e: Draft) => void;
}) {
  const { emp, depth } = item;
  const isHead = depth === 0;
  const { attributes, listeners, setNodeRef: dragRef } = useDraggable({ id: emp.id });
  const { setNodeRef: dropRef } = useDroppable({ id: emp.id });
  const setRef = useCallback(
    (el: HTMLElement | null) => {
      dragRef(el);
      dropRef(el);
    },
    [dragRef, dropRef],
  );

  return (
    <div style={{ paddingLeft: depth * INDENT }} className="py-0.5">
      <div
        ref={canManage ? setRef : undefined}
        {...(canManage ? attributes : {})}
        {...(canManage ? listeners : {})}
        className={cn(
          "group flex items-center gap-2 rounded-xl border border-transparent px-2 py-2 transition-colors",
          !canManage && "hover:bg-sand/60",
          canManage && (dragging ? "opacity-40" : "cursor-grab hover:border-line hover:bg-sand/60 active:cursor-grabbing"),
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
          <p className="truncate text-xs text-faint">{emp.position}</p>
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
    </div>
  );
}

function Indicator({ depth }: { depth: number }) {
  return (
    <div className="flex items-center gap-1.5 py-1" style={{ paddingLeft: depth * INDENT + 8 }}>
      <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-forest-500" />
      <span className="h-0.5 flex-1 rounded-full bg-forest-500" />
    </div>
  );
}

function OverlayCard({ emp, reports }: { emp: Draft; reports: number }) {
  return (
    <div className="flex cursor-grabbing items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2 shadow-pop">
      <GripVertical className="h-4 w-4 shrink-0 text-faint" />
      <Avatar name={emp.name || "?"} size="sm" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{emp.name || "Tanpa nama"}</p>
        <p className="truncate text-xs text-faint">
          {emp.position}
          {reports > 0 && ` · +${reports} bawahan`}
        </p>
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

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const a = arr.slice();
  const [moved] = a.splice(from, 1);
  a.splice(to, 0, moved);
  return a;
}

/**
 * Notion-style depth projection: given the flattened list, the dragged id, the
 * row being hovered, and the horizontal drag offset, compute the target depth
 * and parent. Horizontal offset (÷ indent) nudges the depth, clamped by the
 * neighbours so the result is always a valid tree position.
 */
function getProjection(
  items: Flat[],
  activeId: string,
  overId: string,
  offsetLeft: number,
  indent: number,
): { depth: number; parentId: string | null } | null {
  const overIndex = items.findIndex((i) => i.id === overId);
  const activeIndex = items.findIndex((i) => i.id === activeId);
  if (overIndex < 0 || activeIndex < 0) return null;
  const active = items[activeIndex];
  const moved = arrayMove(items, activeIndex, overIndex);
  const prev = moved[overIndex - 1];
  const next = moved[overIndex + 1];
  const dragDepth = Math.round(offsetLeft / indent);
  const projected = active.depth + dragDepth;
  const maxDepth = prev ? prev.depth + 1 : 0;
  const minDepth = next ? next.depth : 0;
  const depth = Math.max(minDepth, Math.min(projected, maxDepth));

  let parentId: string | null = null;
  if (depth > 0 && prev) {
    if (depth === prev.depth) parentId = prev.parentId;
    else if (depth > prev.depth) parentId = prev.id;
    else
      parentId =
        moved
          .slice(0, overIndex)
          .reverse()
          .find((i) => i.depth === depth)?.parentId ?? null;
  }
  return { depth, parentId };
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
