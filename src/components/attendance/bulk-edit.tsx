"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, PaintBucket, RotateCcw, Undo2, X } from "lucide-react";
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

// Bentuk minimal record yang dipakai grid (dari prop awal & fetch per-rentang).
type Rec = { employeeId: string; date: string; status: string; clockIn?: string | null };

const MAX_DAYS = 62; // batasi lebar grid (≈2 bulan) agar tetap nyaman & ringan

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
    help: "Klik/seret sel untuk mengecat dengan kuas aktif. Klik nama atau tanggal hanya MENGISI sel kosong di hari kerja (tidak menimpa data yang sudah ada).",
    from: "Dari",
    to: "Sampai",
    allTeams: "Semua tim",
    changes: (n: number) => `${n} perubahan`,
    save: "Simpan",
    saving: "Menyimpan…",
    reset: "Reset",
    undo: "Urungkan",
    fillEmpty: "Isi kosong",
    fillEmptyHint: "Isi semua hari kerja yang kosong dengan kuas aktif",
    cancel: "Tutup",
    empName: "Karyawan",
    saved: (u: number, d: number) => `Tersimpan ✓ (${u} diisi, ${d} dikosongkan)`,
    failed: "Gagal menyimpan. Coba lagi.",
    discardTitle: "Buang perubahan?",
    discardMsg: "Ada perubahan yang belum disimpan. Buang dan tutup?",
    discardYes: "Buang",
    keep: "Batal",
    delTitle: "Hapus catatan absensi asli?",
    delMsg: (n: number) => `${n} sel yang akan dikosongkan punya clock-in asli (foto/GPS). Menyimpan akan MENGHAPUS catatan itu permanen.`,
    delYes: "Ya, hapus & simpan",
    brush: "Kuas",
    touchTip: "Di HP: ketuk sel (seret hanya di desktop).",
    loading: "Memuat…",
    tooWide: `Rentang terlalu lebar (maks ${MAX_DAYS} hari). Persempit tanggal.`,
  },
  en: {
    title: "Bulk Edit Attendance",
    help: "Click/drag cells to paint with the active brush. Clicking a name or date only FILLS empty working-day cells (never overwrites existing data).",
    from: "From",
    to: "To",
    allTeams: "All teams",
    changes: (n: number) => `${n} changes`,
    save: "Save",
    saving: "Saving…",
    reset: "Reset",
    undo: "Undo",
    fillEmpty: "Fill empty",
    fillEmptyHint: "Fill every empty working day with the active brush",
    cancel: "Close",
    empName: "Employee",
    saved: (u: number, d: number) => `Saved ✓ (${u} set, ${d} cleared)`,
    failed: "Failed to save. Try again.",
    discardTitle: "Discard changes?",
    discardMsg: "You have unsaved changes. Discard and close?",
    discardYes: "Discard",
    keep: "Cancel",
    delTitle: "Delete real attendance records?",
    delMsg: (n: number) => `${n} cell(s) being cleared have a real clock-in (photo/GPS). Saving will PERMANENTLY delete those records.`,
    delYes: "Yes, delete & save",
    brush: "Brush",
    touchTip: "On phone: tap cells (drag is desktop-only).",
    loading: "Loading…",
    tooWide: `Range too wide (max ${MAX_DAYS} days). Narrow the dates.`,
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

const keyOf = (empId: string, date: string) => `${empId}|${date}`;

export function BulkEditAttendance({
  open,
  onClose,
  employees,
  records,
  period,
  holidays = [],
}: {
  open: boolean;
  onClose: () => void;
  employees: Emp[];
  records: AttendanceRecord[];
  period: string; // "YYYY-MM"
  holidays?: string[]; // tanggal libur nasional (publik)
}) {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();
  const router = useRouter();

  const monthLast = monthEnd(period);
  const today = witaToday();
  const defaultTo = today.slice(0, 7) === period ? today : monthLast;
  const [from, setFrom] = useState(`${period}-01`);
  const [to, setTo] = useState(defaultTo);
  const [team, setTeam] = useState<"all" | Team>("all");
  const [brush, setBrush] = useState<Brush>("present");
  const [edits, setEdits] = useState<Map<string, Brush>>(new Map());
  const [loaded, setLoaded] = useState<Rec[]>(() =>
    records.map((r) => ({ employeeId: r.employeeId, date: r.date, status: r.status, clockIn: r.clockIn })),
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; message: string; yes: string; danger?: boolean; onYes: () => void } | null>(null);
  const painting = useRef(false);
  const history = useRef<Map<string, Brush>[]>([]);

  // Baseline status sel & jejak clock-in asli (untuk peringatan hapus).
  const { recMap, clockInKeys } = useMemo(() => {
    const m = new Map<string, Brush>();
    const ev = new Set<string>();
    for (const r of loaded) {
      m.set(keyOf(r.employeeId, r.date), r.status === "holiday" ? "off" : (r.status as Brush));
      if (r.clockIn) ev.add(keyOf(r.employeeId, r.date));
    }
    return { recMap: m, clockInKeys: ev };
  }, [loaded]);
  const baseOf = useCallback((empId: string, date: string): Brush => recMap.get(keyOf(empId, date)) ?? "off", [recMap]);
  const holidaySet = useMemo(() => new Set(holidays), [holidays]);

  const days = useMemo(() => eachDay(from, to), [from, to]);
  const tooWide = days.length > MAX_DAYS;
  const emps = useMemo(
    () => employees.filter((e) => team === "all" || e.team === team).sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name)),
    [employees, team],
  );

  // Reset draft + riwayat saat ditutup.
  useEffect(() => {
    if (!open) {
      setEdits(new Map());
      history.current = [];
      setConfirm(null);
    }
  }, [open]);

  // Ambil absensi sesuai rentang terpilih (mendukung lintas bulan). Edit yang
  // belum disimpan tetap dipertahankan walau pindah bulan.
  useEffect(() => {
    if (!open || from > to || tooWide) return;
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/api/attendance/bulk?from=${from}&to=${to}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load_failed"))))
      .then((d) => {
        if (Array.isArray(d?.records)) setLoaded(d.records as Rec[]);
      })
      .catch((e) => {
        if (e?.name !== "AbortError") toast.error(locale === "id" ? "Gagal memuat data." : "Failed to load data.");
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, from, to, tooWide]);

  const snapshot = useCallback((cur: Map<string, Brush>) => {
    history.current.push(new Map(cur));
    if (history.current.length > 80) history.current.shift();
  }, []);

  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (prev) setEdits(prev);
  }, []);

  // Pointer release global; ESC menutup; Ctrl/Cmd+Z undo; kunci scroll body.
  useEffect(() => {
    if (!open) return;
    const up = () => (painting.current = false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirm) setConfirm(null);
        else attemptClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, edits.size, confirm, undo]);

  // Mutasi edits (functional, murni) dengan prune: status == baseline → bukan
  // perubahan. Snapshot undo diambil di pemanggil (di luar updater) agar tidak
  // ganda saat React StrictMode menjalankan updater dua kali.
  const paint = useCallback(
    (cells: { empId: string; date: string }[], b: Brush) => {
      if (cells.length === 0) return;
      setEdits((prev) => {
        const next = new Map(prev);
        for (const { empId, date } of cells) {
          const k = keyOf(empId, date);
          if (b === baseOf(empId, date)) next.delete(k);
          else next.set(k, b);
        }
        return next;
      });
    },
    [baseOf],
  );
  // Aksi diskret (klik sel, isi baris/kolom): catat undo lalu cat.
  const stroke = (cells: { empId: string; date: string }[]) => {
    if (cells.length === 0) return;
    snapshot(edits);
    paint(cells, brush);
  };

  const statusOf = (empId: string, date: string): Brush => edits.get(keyOf(empId, date)) ?? baseOf(empId, date);
  const isDirty = (empId: string, date: string) => edits.has(keyOf(empId, date));

  // Header & "Isi kosong": HANYA mengisi sel kosong (off) di hari kerja terjadwal —
  // tidak pernah menimpa/menghapus data yang sudah ada.
  const emptyScheduled = useCallback(
    (cells: { empId: string; date: string }[], wd: (e: string) => number[]) =>
      cells.filter(
        ({ empId, date }) => wd(empId).includes(dow(date)) && !holidaySet.has(date) && statusOf(empId, date) === "off",
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edits, baseOf, holidaySet],
  );
  const wdOf = (empId: string) => emps.find((e) => e.id === empId)?.workDays ?? [];

  const fillRow = (empId: string) => stroke(emptyScheduled(days.map((date) => ({ empId, date })), wdOf));
  const fillCol = (date: string) => stroke(emptyScheduled(emps.map((e) => ({ empId: e.id, date })), wdOf));
  const fillAll = () => stroke(emptyScheduled(emps.flatMap((e) => days.map((date) => ({ empId: e.id, date }))), wdOf));

  function attemptClose() {
    if (edits.size > 0) {
      setConfirm({ title: t.discardTitle, message: t.discardMsg, yes: t.discardYes, danger: true, onYes: () => { setConfirm(null); onClose(); } });
      return;
    }
    onClose();
  }

  async function doSave() {
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
      history.current = [];
      router.refresh();
      onClose();
    } catch {
      toast.error(t.failed);
    } finally {
      setSaving(false);
    }
  }

  function save() {
    if (edits.size === 0 || saving) return;
    const realDeletes = [...edits].filter(([k, s]) => s === "off" && clockInKeys.has(k)).length;
    if (realDeletes > 0) {
      setConfirm({
        title: t.delTitle,
        message: t.delMsg(realDeletes),
        yes: t.delYes,
        danger: true,
        onYes: () => { setConfirm(null); void doSave(); },
      });
      return;
    }
    void doSave();
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex flex-col bg-cream">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">{t.title}</h2>
          <p className="mt-0.5 max-w-3xl text-xs text-muted">{t.help}</p>
        </div>
        <button type="button" onClick={attemptClose} aria-label={t.cancel} className="rounded-xl p-2 text-muted transition-colors hover:bg-sand">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t.from}
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t.to}
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink" />
          </label>
          {loading && <span className="pb-2 text-xs text-faint">{t.loading}</span>}
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip active={team === "all"} onClick={() => setTeam("all")}>{t.allTeams}</Chip>
            {TEAMS.map((tm) => (
              <Chip key={tm} active={team === tm} onClick={() => setTeam(tm)}>{TEAM_META[tm].label}</Chip>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-faint">{t.brush}</span>
          {BRUSHES.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBrush(b)}
              className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all", UI[b].chip, brush === b ? cn("ring-2 ring-offset-1", UI[b].ring) : "opacity-80 hover:opacity-100")}
            >
              <span className="grid h-4 w-4 place-items-center rounded text-[10px] font-bold">{UI[b].letter || "•"}</span>
              {UI[b][locale]}
            </button>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
          <button type="button" onClick={fillAll} title={t.fillEmptyHint} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-sand">
            <PaintBucket className="h-4 w-4" /> {t.fillEmpty}
          </button>
          <button type="button" onClick={undo} disabled={history.current.length === 0} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-sand disabled:opacity-40">
            <Undo2 className="h-4 w-4" /> {t.undo}
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-auto px-4 py-3 sm:px-6">
        {tooWide && <p className="py-10 text-center text-sm text-faint">{t.tooWide}</p>}
        {!tooWide && (
        <table className="border-separate border-spacing-0 select-none text-center text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 min-w-[190px] border-b border-r border-line bg-forest-700 px-3 py-2 text-left text-xs font-semibold text-white">{t.empName}</th>
              {days.map((d) => {
                const wknd = dow(d) === 0 || dow(d) === 6;
                return (
                  <th key={d} onClick={() => fillCol(d)} title={d} className={cn("sticky top-0 z-20 min-w-[38px] cursor-pointer border-b border-r border-line px-1 py-1 text-[11px] font-semibold leading-tight transition-[filter]", wknd ? "bg-[#7d2b2b] text-[#fde8e8]" : "bg-forest-700 text-white", "hover:brightness-110")}>
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
                <th onClick={() => fillRow(e.id)} className={cn("sticky left-0 z-10 min-w-[190px] cursor-pointer border-b border-r border-line px-3 py-1.5 text-left transition-colors hover:bg-sand", ri % 2 ? "bg-[#f8faf7]" : "bg-white")}>
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
                  const isHoliday = holidaySet.has(d);
                  const isOff = st === "off";
                  const offBg = isHoliday
                    ? "bg-[#f6e9e9] hover:bg-[#efdada]" // libur nasional
                    : scheduled
                      ? "bg-white hover:bg-sand"
                      : "bg-[#eef1f4] hover:bg-[#e3e7ec]"; // bukan jadwal / weekend
                  return (
                    <td key={d} className="border-b border-r border-line p-0">
                      <div
                        role="button"
                        tabIndex={-1}
                        title={isHoliday ? "Libur nasional" : undefined}
                        onPointerDown={(ev) => {
                          ev.preventDefault();
                          painting.current = true;
                          snapshot(edits); // satu undo per goresan
                          paint([{ empId: e.id, date: d }], brush);
                        }}
                        onPointerEnter={() => {
                          if (painting.current) paint([{ empId: e.id, date: d }], brush);
                        }}
                        className={cn("flex h-8 w-full cursor-pointer items-center justify-center text-[11px] font-bold transition-colors", isOff ? offBg : cn(UI[st].cell, "hover:brightness-95"), dirty && "ring-2 ring-inset ring-forest-600")}
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
        )}
        {!tooWide && emps.length === 0 && <p className="py-10 text-center text-sm text-faint">—</p>}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 border-t border-line bg-cream px-4 py-3 sm:px-6">
        <div className="flex flex-col">
          <span className={cn("text-sm font-medium", edits.size ? "text-forest-700" : "text-faint")}>{t.changes(edits.size)}</span>
          <span className="hidden text-[11px] text-faint sm:block">{t.touchTip}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => { snapshot(edits); setEdits(new Map()); }} disabled={edits.size === 0 || saving}>
            <RotateCcw className="h-4 w-4" /> {t.reset}
          </Button>
          <Button variant="outline" onClick={attemptClose} disabled={saving}>{t.cancel}</Button>
          <Button onClick={save} disabled={edits.size === 0 || saving}>
            <Check className="h-4 w-4" /> {saving ? t.saving : `${t.save} (${edits.size})`}
          </Button>
        </div>
      </div>

      {/* Konfirmasi (di dalam overlay agar selalu di atas grid) */}
      {confirm && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-bark/50 backdrop-blur-sm" onClick={() => setConfirm(null)} />
          <div role="dialog" aria-modal="true" className="relative w-full max-w-sm rounded-2xl bg-panel p-6 shadow-pop">
            <div className="flex items-start gap-3">
              {confirm.danger && (
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-clay-soft text-clay">
                  <AlertTriangle className="h-5 w-5" />
                </span>
              )}
              <div>
                <h3 className="font-display text-base font-semibold text-ink">{confirm.title}</h3>
                <p className="mt-1 text-sm text-muted">{confirm.message}</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirm(null)}>{t.keep}</Button>
              <Button variant={confirm.danger ? "danger" : "primary"} onClick={confirm.onYes}>{confirm.yes}</Button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", active ? "bg-forest-700 text-white" : "border border-line text-muted hover:bg-sand")}>
      {children}
    </button>
  );
}
