"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, RotateCcw, X } from "lucide-react";
import type { AttendanceRecord, Team } from "@/lib/types";
import { TEAMS, TEAM_META } from "@/lib/constants";
import { cn, witaToday } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useLocale } from "@/components/layout/locale-context";

type Brush = "present" | "late" | "sick" | "leave" | "absent" | "off";

interface Emp {
  id: string;
  name: string;
  team: Team;
  workDays: number[];
}

// Palet warna sengaja dibuat identik dengan ekspor XLSX (src/lib/attendance-xlsx.ts).
const UI: Record<Brush, { id: string; en: string; letter: string; cell: string; chip: string; ring: string }> = {
  present: { id: "Hadir", en: "Present", letter: "", cell: "bg-[#cdead2] text-[#166534]", chip: "bg-[#cdead2] text-[#166534]", ring: "ring-[#166534]" },
  late: { id: "Telat", en: "Late", letter: "T", cell: "bg-[#fbe8b0] text-[#92600a]", chip: "bg-[#fbe8b0] text-[#92600a]", ring: "ring-[#92600a]" },
  sick: { id: "Sakit", en: "Sick", letter: "S", cell: "bg-[#fad9a6] text-[#9a3412]", chip: "bg-[#fad9a6] text-[#9a3412]", ring: "ring-[#9a3412]" },
  leave: { id: "Cuti", en: "Leave", letter: "C", cell: "bg-[#cbdff7] text-[#1e40af]", chip: "bg-[#cbdff7] text-[#1e40af]", ring: "ring-[#1e40af]" },
  absent: { id: "Alpa", en: "Absent", letter: "A", cell: "bg-[#f6c7c3] text-[#b91c1c]", chip: "bg-[#f6c7c3] text-[#b91c1c]", ring: "ring-[#b91c1c]" },
  off: { id: "Libur", en: "Off", letter: "", cell: "bg-[#eef1f4] text-faint", chip: "bg-[#eef1f4] text-faint", ring: "ring-[#94a3b8]" },
};
const BRUSHES: Brush[] = ["present", "late", "sick", "leave", "absent", "off"];

const STR = {
  id: {
    title: "Edit Massal Absensi",
    help: "Pilih status sebagai kuas, lalu klik atau seret sel. Klik nama untuk satu baris, klik tanggal untuk satu kolom.",
    from: "Dari",
    to: "Sampai",
    allTeams: "Semua tim",
    changes: (n: number) => `${n} perubahan`,
    save: "Simpan",
    saving: "Menyimpan…",
    reset: "Reset",
    cancel: "Tutup",
    empName: "Karyawan",
    saved: (u: number, d: number) => `Tersimpan ✓ (${u} diisi, ${d} dikosongkan)`,
    failed: "Gagal menyimpan. Coba lagi.",
    discard: "Buang perubahan yang belum disimpan?",
    brush: "Kuas",
  },
  en: {
    title: "Bulk Edit Attendance",
    help: "Pick a status brush, then click or drag cells. Click a name for the whole row, a date for the whole column.",
    from: "From",
    to: "To",
    allTeams: "All teams",
    changes: (n: number) => `${n} changes`,
    save: "Save",
    saving: "Saving…",
    reset: "Reset",
    cancel: "Close",
    empName: "Employee",
    saved: (u: number, d: number) => `Saved ✓ (${u} set, ${d} cleared)`,
    failed: "Failed to save. Try again.",
    discard: "Discard unsaved changes?",
    brush: "Brush",
  },
};

const WD = { id: ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"], en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] };

const pad = (n: number) => String(n).padStart(2, "0");
const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
function monthEnd(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${period}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}
function eachDay(from: string, to: string): string[] {
  if (from > to) return [];
  const out: string[] = [];
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  let cur = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  while (cur <= end) {
    const dt = new Date(cur);
    out.push(`${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`);
    cur += 86_400_000;
  }
  return out;
}

export function BulkEditAttendance({
  open,
  onClose,
  employees,
  records,
  period,
}: {
  open: boolean;
  onClose: () => void;
  employees: Emp[];
  records: AttendanceRecord[];
  period: string; // "YYYY-MM"
}) {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();
  const router = useRouter();

  const today = witaToday();
  const monthLast = monthEnd(period);
  const defaultTo = today.slice(0, 7) === period ? today : monthLast;
  const [from, setFrom] = useState(`${period}-01`);
  const [to, setTo] = useState(defaultTo);
  const [team, setTeam] = useState<"all" | Team>("all");
  const [brush, setBrush] = useState<Brush>("present");
  const [edits, setEdits] = useState<Map<string, Brush>>(new Map());
  const [saving, setSaving] = useState(false);
  const painting = useRef(false);

  const key = (empId: string, date: string) => `${empId}|${date}`;

  // Status asli (baseline) sebuah sel: record yang ada, atau "off" bila kosong.
  const recMap = useMemo(() => {
    const m = new Map<string, Brush>();
    for (const r of records) m.set(key(r.employeeId, r.date), r.status === "holiday" ? "off" : (r.status as Brush));
    return m;
  }, [records]);
  const baseOf = useCallback((empId: string, date: string): Brush => recMap.get(key(empId, date)) ?? "off", [recMap]);

  const days = useMemo(() => eachDay(from, to), [from, to]);
  const emps = useMemo(
    () => employees.filter((e) => team === "all" || e.team === team).sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name)),
    [employees, team],
  );

  // Reset draft saat ditutup.
  useEffect(() => {
    if (!open) setEdits(new Map());
  }, [open]);

  // Lepas "painting" saat pointer dilepas di mana pun; ESC menutup; kunci scroll body.
  useEffect(() => {
    if (!open) return;
    const up = () => (painting.current = false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && attemptClose();
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, edits.size]);

  const apply = useCallback(
    (empId: string, date: string) => {
      setEdits((prev) => {
        const next = new Map(prev);
        const k = key(empId, date);
        if (brush === baseOf(empId, date)) next.delete(k); // kembali ke asli → bukan perubahan
        else next.set(k, brush);
        return next;
      });
    },
    [brush, baseOf],
  );

  const applyMany = useCallback(
    (cells: { empId: string; date: string }[]) => {
      setEdits((prev) => {
        const next = new Map(prev);
        for (const { empId, date } of cells) {
          const k = key(empId, date);
          if (brush === baseOf(empId, date)) next.delete(k);
          else next.set(k, brush);
        }
        return next;
      });
    },
    [brush, baseOf],
  );

  const statusOf = (empId: string, date: string): Brush => edits.get(key(empId, date)) ?? baseOf(empId, date);
  const isDirty = (empId: string, date: string) => edits.has(key(empId, date));

  function attemptClose() {
    if (edits.size > 0 && !window.confirm(t.discard)) return;
    onClose();
  }

  async function save() {
    if (edits.size === 0 || saving) return;
    setSaving(true);
    try {
      const changes = [...edits].map(([k, status]) => {
        const [employeeId, date] = k.split("|");
        return { employeeId, date, status };
      });
      const res = await fetch("/api/attendance/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "failed");
      toast.success(t.saved(data.upserted ?? 0, data.deleted ?? 0));
      setEdits(new Map());
      router.refresh();
      onClose();
    } catch {
      toast.error(t.failed);
    } finally {
      setSaving(false);
    }
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex flex-col bg-cream">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">{t.title}</h2>
          <p className="mt-0.5 max-w-2xl text-xs text-muted">{t.help}</p>
        </div>
        <button
          type="button"
          onClick={attemptClose}
          aria-label={t.cancel}
          className="rounded-xl p-2 text-muted transition-colors hover:bg-sand"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Toolbar: rentang, tim, kuas */}
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t.from}
            <input
              type="date"
              value={from}
              min={`${period}-01`}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t.to}
            <input
              type="date"
              value={to}
              min={from}
              max={monthLast}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink"
            />
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip active={team === "all"} onClick={() => setTeam("all")}>{t.allTeams}</Chip>
            {TEAMS.map((tm) => (
              <Chip key={tm} active={team === tm} onClick={() => setTeam(tm)}>{TEAM_META[tm].label}</Chip>
            ))}
          </div>
        </div>
        {/* Palet kuas */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-faint">{t.brush}</span>
          {BRUSHES.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBrush(b)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                UI[b].chip,
                brush === b ? cn("ring-2 ring-offset-1", UI[b].ring) : "opacity-80 hover:opacity-100",
              )}
            >
              <span className="grid h-4 w-4 place-items-center rounded text-[10px] font-bold">{UI[b].letter || "•"}</span>
              {UI[b][locale]}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-auto px-4 py-3 sm:px-6">
        <table className="border-separate border-spacing-0 select-none text-center text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 min-w-[190px] border-b border-r border-line bg-forest-700 px-3 py-2 text-left text-xs font-semibold text-white">
                {t.empName}
              </th>
              {days.map((d) => {
                const wknd = dow(d) === 0 || dow(d) === 6;
                return (
                  <th
                    key={d}
                    onClick={() => applyMany(emps.map((e) => ({ empId: e.id, date: d })))}
                    title={d}
                    className={cn(
                      "sticky top-0 z-20 min-w-[38px] cursor-pointer border-b border-r border-line px-1 py-1 text-[11px] font-semibold leading-tight transition-colors",
                      wknd ? "bg-[#7d2b2b] text-[#fde8e8]" : "bg-forest-700 text-white",
                      "hover:brightness-110",
                    )}
                  >
                    <div className="opacity-80">{WD[locale][dow(d)]}</div>
                    <div>{Number(d.slice(8, 10))}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {emps.map((e, ri) => (
              <tr key={e.id}>
                <th
                  onClick={() => applyMany(days.map((d) => ({ empId: e.id, date: d })))}
                  className={cn(
                    "sticky left-0 z-10 min-w-[190px] cursor-pointer border-b border-r border-line px-3 py-1.5 text-left transition-colors hover:bg-sand",
                    ri % 2 ? "bg-[#f8faf7]" : "bg-white",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-4 shrink-0 text-[11px] font-medium text-faint">{ri + 1}</span>
                    <span className="truncate text-[13px] font-medium text-ink">{e.name}</span>
                  </div>
                  <span className="ml-6 text-[10px] text-muted">{TEAM_META[e.team].label}</span>
                </th>
                {days.map((d) => {
                  const st = statusOf(e.id, d);
                  const dirty = isDirty(e.id, d);
                  const scheduled = e.workDays.includes(dow(d));
                  const isOff = st === "off";
                  return (
                    <td key={d} className="border-b border-r border-line p-0">
                      <div
                        role="button"
                        tabIndex={-1}
                        onPointerDown={(ev) => {
                          ev.preventDefault();
                          painting.current = true;
                          apply(e.id, d);
                        }}
                        onPointerEnter={() => {
                          if (painting.current) apply(e.id, d);
                        }}
                        className={cn(
                          "flex h-8 w-full cursor-pointer items-center justify-center text-[11px] font-bold transition-colors",
                          isOff ? (scheduled ? "bg-white hover:bg-sand" : "bg-[#eef1f4] hover:bg-[#e3e7ec]") : cn(UI[st].cell, "hover:brightness-95"),
                          dirty && "ring-2 ring-inset ring-forest-600",
                        )}
                      >
                        {!isOff && UI[st].letter}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {emps.length === 0 && <p className="py-10 text-center text-sm text-faint">—</p>}
      </div>

      {/* Footer aksi */}
      <div className="flex items-center justify-between gap-3 border-t border-line bg-cream px-4 py-3 sm:px-6">
        <span className={cn("text-sm font-medium", edits.size ? "text-forest-700" : "text-faint")}>{t.changes(edits.size)}</span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setEdits(new Map())} disabled={edits.size === 0 || saving}>
            <RotateCcw className="h-4 w-4" /> {t.reset}
          </Button>
          <Button variant="outline" onClick={attemptClose} disabled={saving}>
            {t.cancel}
          </Button>
          <Button onClick={save} disabled={edits.size === 0 || saving}>
            <Check className="h-4 w-4" /> {saving ? t.saving : `${t.save} (${edits.size})`}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-forest-700 text-white" : "border border-line text-muted hover:bg-sand",
      )}
    >
      {children}
    </button>
  );
}
