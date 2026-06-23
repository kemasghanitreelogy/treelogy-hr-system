"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, PaintBucket, RotateCcw, Undo2, X } from "lucide-react";
import type { AttendanceRecord, Team } from "@/lib/types";
import { TEAMS, TEAM_META } from "@/lib/constants";
import { cn, witaToday } from "@/lib/utils";
import type { Locale } from "@/lib/i18n";
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

const MAX_DAYS = 366; // batas atas grid (≈1 tahun); render dioptimasi per-baris.

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
    loadFailed: "Gagal memuat data.",
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
    holiday: "Libur nasional",
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
    loadFailed: "Failed to load data.",
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
    holiday: "Public holiday",
  },
};

const WD = { id: ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"], en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] };

const pad = (n: number) => String(n).padStart(2, "0");
const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const keyOf = (empId: string, date: string) => `${empId}|${date}`;
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
  while (cur <= end && out.length <= MAX_DAYS + 1) {
    const dt = new Date(cur);
    out.push(`${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`);
    cur += 86_400_000;
  }
  return out;
}

interface CellView {
  date: string;
  status: Brush;
  dirty: boolean;
  scheduled: boolean;
  holiday: boolean;
}

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

  // Refs supaya handler bisa stabil (useCallback []) tanpa stale closure → memoisasi
  // per-baris efektif saat drag.
  const editsRef = useRef(edits);
  const brushRef = useRef(brush);
  const baseOfRef = useRef(baseOf);
  const empsRef = useRef(emps);
  const daysRef = useRef(days);
  const holidayRef = useRef(holidaySet);
  editsRef.current = edits;
  brushRef.current = brush;
  baseOfRef.current = baseOf;
  empsRef.current = emps;
  daysRef.current = days;
  holidayRef.current = holidaySet;

  const snapshot = useCallback((cur: Map<string, Brush>) => {
    history.current.push(new Map(cur));
    if (history.current.length > 120) history.current.shift();
  }, []);
  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (prev) setEdits(prev);
  }, []);

  const currentStatus = useCallback((empId: string, date: string): Brush => editsRef.current.get(keyOf(empId, date)) ?? baseOfRef.current(empId, date), []);
  const isEmptyScheduled = useCallback(
    (empId: string, date: string) => {
      const wd = empsRef.current.find((e) => e.id === empId)?.workDays ?? [];
      return wd.includes(dow(date)) && !holidayRef.current.has(date) && currentStatus(empId, date) === "off";
    },
    [currentStatus],
  );

  // Mutasi murni; baca brush/baseline lewat ref agar identitas callback stabil.
  const paintCells = useCallback((cells: { empId: string; date: string }[]) => {
    if (cells.length === 0) return;
    setEdits((prev) => {
      const next = new Map(prev);
      const b = brushRef.current;
      const base = baseOfRef.current;
      for (const { empId, date } of cells) {
        const k = keyOf(empId, date);
        if (b === base(empId, date)) next.delete(k);
        else next.set(k, b);
      }
      return next;
    });
  }, []);

  const onStart = useCallback((empId: string, date: string) => {
    painting.current = true;
    snapshot(editsRef.current); // satu undo per goresan
    paintCells([{ empId, date }]);
  }, [snapshot, paintCells]);
  const onDrag = useCallback((empId: string, date: string) => {
    if (painting.current) paintCells([{ empId, date }]);
  }, [paintCells]);

  // Header & "Isi kosong": HANYA isi sel kosong hari kerja (tak menimpa/menghapus).
  const onFillRow = useCallback((empId: string) => {
    const cells = daysRef.current.filter((d) => isEmptyScheduled(empId, d)).map((date) => ({ empId, date }));
    if (cells.length) { snapshot(editsRef.current); paintCells(cells); }
  }, [isEmptyScheduled, snapshot, paintCells]);
  const onFillCol = useCallback((date: string) => {
    const cells = empsRef.current.filter((e) => isEmptyScheduled(e.id, date)).map((e) => ({ empId: e.id, date }));
    if (cells.length) { snapshot(editsRef.current); paintCells(cells); }
  }, [isEmptyScheduled, snapshot, paintCells]);
  const fillAll = () => {
    const cells: { empId: string; date: string }[] = [];
    for (const e of emps) for (const d of days) if (isEmptyScheduled(e.id, d)) cells.push({ empId: e.id, date: d });
    if (cells.length) { snapshot(edits); paintCells(cells); }
  };

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
        if (e?.name !== "AbortError") toast.error(t.loadFailed);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, from, to, tooWide]);

  // Pointer release global; ESC; Ctrl/Cmd+Z; kunci scroll body.
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
      setConfirm({ title: t.delTitle, message: t.delMsg(realDeletes), yes: t.delYes, danger: true, onYes: () => { setConfirm(null); void doSave(); } });
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
        {tooWide ? (
          <p className="py-10 text-center text-sm text-faint">{t.tooWide}</p>
        ) : (
          <table className="border-separate border-spacing-0 select-none text-center text-sm">
            <GridHeader days={days} locale={locale} holidaySet={holidaySet} empLabel={t.empName} onFillCol={onFillCol} />
            <tbody>
              {emps.map((e, ri) => {
                const cells: CellView[] = days.map((d) => ({
                  date: d,
                  status: edits.get(keyOf(e.id, d)) ?? baseOf(e.id, d),
                  dirty: edits.has(keyOf(e.id, d)),
                  scheduled: e.workDays.includes(dow(d)),
                  holiday: holidaySet.has(d),
                }));
                const sig = cells.map((c) => `${c.date}${c.status}${c.dirty ? "*" : ""}`).join("|");
                return <EmpRow key={e.id} emp={e} ri={ri} cells={cells} sig={sig} holidayTitle={t.holiday} onStart={onStart} onDrag={onDrag} onFillRow={onFillRow} />;
              })}
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

// Header memo: props stabil saat drag (days/holidaySet/onFillCol semua stabil).
const GridHeader = memo(function GridHeader({
  days,
  locale,
  holidaySet,
  empLabel,
  onFillCol,
}: {
  days: string[];
  locale: Locale;
  holidaySet: Set<string>;
  empLabel: string;
  onFillCol: (date: string) => void;
}) {
  return (
    <thead>
      <tr>
        <th className="sticky left-0 top-0 z-30 min-w-[190px] border-b border-r border-line bg-forest-700 px-3 py-2 text-left text-xs font-semibold text-white">{empLabel}</th>
        {days.map((d) => {
          const wknd = dow(d) === 0 || dow(d) === 6;
          const hol = holidaySet.has(d);
          return (
            <th key={d} onClick={() => onFillCol(d)} title={d} className={cn("sticky top-0 z-20 min-w-[38px] cursor-pointer border-b border-r border-line px-1 py-1 text-[11px] font-semibold leading-tight transition-[filter] hover:brightness-110", wknd || hol ? "bg-[#7d2b2b] text-[#fde8e8]" : "bg-forest-700 text-white")}>
              <div className="opacity-80">{WD[locale][dow(d)]}</div>
              <div>{Number(d.slice(8, 10))}</div>
            </th>
          );
        })}
      </tr>
    </thead>
  );
});

// Baris memo: hanya re-render saat signature selnya berubah (saat drag, cuma
// baris di bawah pointer). `sig` dipakai di komparator, bukan di body.
const EmpRow = memo(
  function EmpRow({
    emp,
    ri,
    cells,
    holidayTitle,
    onStart,
    onDrag,
    onFillRow,
  }: {
    emp: Emp;
    ri: number;
    cells: CellView[];
    sig: string;
    holidayTitle: string;
    onStart: (empId: string, date: string) => void;
    onDrag: (empId: string, date: string) => void;
    onFillRow: (empId: string) => void;
  }) {
    return (
      <tr>
        <th onClick={() => onFillRow(emp.id)} className={cn("sticky left-0 z-10 min-w-[190px] cursor-pointer border-b border-r border-line px-3 py-1.5 text-left transition-colors hover:bg-sand", ri % 2 ? "bg-[#f8faf7]" : "bg-white")}>
          <div className="flex items-center gap-2">
            <span className="w-4 shrink-0 text-[11px] font-medium text-faint">{ri + 1}</span>
            <span className="truncate text-[13px] font-medium text-ink">{emp.name}</span>
          </div>
          <span className="ml-6 text-[10px] text-muted">{TEAM_META[emp.team].label}</span>
        </th>
        {cells.map((c) => {
          const isOff = c.status === "off";
          const offBg = c.holiday ? "bg-[#f6e9e9] hover:bg-[#efdada]" : c.scheduled ? "bg-white hover:bg-sand" : "bg-[#eef1f4] hover:bg-[#e3e7ec]";
          return (
            <td key={c.date} className="border-b border-r border-line p-0">
              <div
                role="button"
                tabIndex={-1}
                title={c.holiday ? holidayTitle : undefined}
                onPointerDown={(ev) => { ev.preventDefault(); onStart(emp.id, c.date); }}
                onPointerEnter={() => onDrag(emp.id, c.date)}
                className={cn("flex h-8 w-full cursor-pointer items-center justify-center text-[11px] font-bold transition-colors", isOff ? offBg : cn(UI[c.status].cell, "hover:brightness-95"), c.dirty && "ring-2 ring-inset ring-forest-600")}
              >
                {!isOff && UI[c.status].letter}
              </div>
            </td>
          );
        })}
      </tr>
    );
  },
  (prev, next) => prev.sig === next.sig && prev.ri === next.ri && prev.emp.id === next.emp.id && prev.holidayTitle === next.holidayTitle,
);

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", active ? "bg-forest-700 text-white" : "border border-line text-muted hover:bg-sand")}>
      {children}
    </button>
  );
}
