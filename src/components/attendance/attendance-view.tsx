"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarDays, Check, ChevronRight, Clock, Download, LogIn, LogOut, PartyPopper, X } from "lucide-react";
import type { AttendanceRecord, AttendanceStatus, ClockApprovalRequest, Employee, RequestStatus, Team } from "@/lib/types";
import { TEAMS, TEAM_META } from "@/lib/constants";
import { cn, formatDate, formatTime, minutesToHM } from "@/lib/utils";
import { formatDistance } from "@/lib/geo";
import { Avatar } from "@/components/ui/avatar";
import { AttendanceBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { ScopeTabs, scopeOptionsFor, type Scope } from "@/components/ui/scope-tabs";
import { useStickyTab } from "@/lib/use-sticky-tab";
import { useToast } from "@/components/ui/toast";
import { useLocale } from "@/components/layout/locale-context";
import { apiErrorMessage } from "@/lib/api-error";
import type { Locale } from "@/lib/i18n";
import { AttendanceDetail } from "./attendance-detail";

const STR: Record<
  Locale,
  {
    myHistory: string;
    myHistoryHint: string;
    pickDate: string;
    allDates: string;
    showAll: string;
    exportRecap: string;
    present: string;
    late: string;
    leaveSick: string;
    absent: string;
    totalOvertime: string;
    allTeams: string;
    all: string;
    onTime: string;
    thEmployee: string;
    thTeam: string;
    thDate: string;
    thIn: string;
    thOut: string;
    thLate: string;
    thOvertime: string;
    thDistance: string;
    thStatus: string;
    processFailed: string;
    approvedOk: string;
    rejectedOk: string;
    connectionProblem: string;
    approvalsTitle: string;
    approvalsDesc: string;
    fromSite: (distance: string) => string;
    offDayWork: string;
    swapChoice: string;
    overtimeChoice: string;
    approve: string;
    reject: string;
    emptyTitle: string;
    emptyHint: string;
    exportTitle: string;
    exportDesc: string;
    exportFrom: string;
    exportTo: string;
    exportBtn: string;
    exportEmpty: string;
    cName: string;
    cTeam: string;
    cDate: string;
    cStatus: string;
    cLateMin: string;
    cOtMin: string;
    cDistance: string;
  }
> = {
  id: {
    myHistory: "Riwayat absensi saya",
    myHistoryHint: "Ketuk satu baris untuk melihat foto, jarak, dan detail jam.",
    pickDate: "Pilih tanggal",
    allDates: "Semua tanggal",
    showAll: "Tampilkan semua",
    exportRecap: "Ekspor rekap",
    present: "Hadir",
    late: "Terlambat",
    leaveSick: "Cuti/Sakit",
    absent: "Alpa",
    totalOvertime: "Total lembur",
    allTeams: "Semua tim",
    all: "Semua",
    onTime: "Tepat waktu",
    thEmployee: "Karyawan",
    thTeam: "Tim",
    thDate: "Tanggal",
    thIn: "Masuk",
    thOut: "Pulang",
    thLate: "Telat",
    thOvertime: "Lembur",
    thDistance: "Jarak",
    thStatus: "Status",
    processFailed: "Gagal memproses. Pastikan Anda HR/admin.",
    approvedOk: "Absensi dikonfirmasi ✓",
    rejectedOk: "Pengajuan ditolak ✓",
    connectionProblem: "Koneksi bermasalah. Coba lagi.",
    approvalsTitle: "Perlu Konfirmasi HR",
    approvalsDesc: "Clock di luar area atau kerja di hari libur. Setujui untuk mencatat absensinya.",
    fromSite: (distance) => `${distance} dari lokasi`,
    offDayWork: "Kerja hari libur",
    swapChoice: "Tukar libur",
    overtimeChoice: "Lembur",
    approve: "Setujui",
    reject: "Tolak",
    emptyTitle: "Tidak ada data absensi",
    emptyHint: "Pilih tanggal lain atau ubah filter tim / ketepatan waktu.",
    exportTitle: "Ekspor Rekap Absensi",
    exportDesc: "Pilih rentang tanggal. File CSV berisi data informatif (tanpa foto).",
    exportFrom: "Dari tanggal",
    exportTo: "Sampai tanggal",
    exportBtn: "Unduh CSV",
    exportEmpty: "Tidak ada data pada rentang ini.",
    cName: "Nama",
    cTeam: "Tim",
    cDate: "Tanggal",
    cStatus: "Status",
    cLateMin: "Telat (menit)",
    cOtMin: "Lembur (menit)",
    cDistance: "Jarak (m)",
  },
  en: {
    myHistory: "My attendance history",
    myHistoryHint: "Tap a row to see the photo, distance, and time details.",
    pickDate: "Choose a date",
    allDates: "All dates",
    showAll: "Show all",
    exportRecap: "Export summary",
    present: "Present",
    late: "Late",
    leaveSick: "Leave/Sick",
    absent: "Absent",
    totalOvertime: "Total overtime",
    allTeams: "All teams",
    all: "All",
    onTime: "On time",
    thEmployee: "Employee",
    thTeam: "Team",
    thDate: "Date",
    thIn: "In",
    thOut: "Out",
    thLate: "Late",
    thOvertime: "Overtime",
    thDistance: "Distance",
    thStatus: "Status",
    processFailed: "Failed to process. Make sure you are HR/admin.",
    approvedOk: "Attendance confirmed ✓",
    rejectedOk: "Request rejected ✓",
    connectionProblem: "Connection problem. Try again.",
    approvalsTitle: "Needs HR Confirmation",
    approvalsDesc: "Out-of-area clock-ins or holiday work. Approve to record attendance.",
    fromSite: (distance) => `${distance} from the site`,
    offDayWork: "Holiday work",
    swapChoice: "Day-off swap",
    overtimeChoice: "Overtime",
    approve: "Approve",
    reject: "Reject",
    emptyTitle: "No attendance data",
    emptyHint: "Pick another date or change the team / punctuality filter.",
    exportTitle: "Export Attendance Summary",
    exportDesc: "Pick a date range. The CSV contains informative data only (no photos).",
    exportFrom: "From date",
    exportTo: "To date",
    exportBtn: "Download CSV",
    exportEmpty: "No data in this range.",
    cName: "Name",
    cTeam: "Team",
    cDate: "Date",
    cStatus: "Status",
    cLateMin: "Late (min)",
    cOtMin: "Overtime (min)",
    cDistance: "Distance (m)",
  },
};

type EmpLite = Pick<Employee, "id" | "nik" | "name" | "team" | "position" | "workStart" | "workEnd">;

/** Label status untuk ekspor CSV (data informatif). */
const STATUS_CSV: Record<Locale, Record<AttendanceStatus, string>> = {
  id: { present: "Hadir", late: "Terlambat", absent: "Alpa", leave: "Cuti", sick: "Sakit", off: "Libur", holiday: "Hari libur" },
  en: { present: "Present", late: "Late", absent: "Absent", leave: "Leave", sick: "Sick", off: "Day off", holiday: "Holiday" },
};

interface Row extends AttendanceRecord {
  emp: EmpLite;
}

export function AttendanceView({
  records,
  employees,
  dates,
  defaultDate,
  canReviewAll = true,
  approvals = [],
  currentUserName = "HR",
  currentEmployeeId = null,
}: {
  records: AttendanceRecord[];
  employees: EmpLite[];
  dates: string[];
  defaultDate: string;
  /** HR/admin see & review everyone; an employee sees only their own. */
  canReviewAll?: boolean;
  /** Pengajuan clock di luar area (pending) — panel konfirmasi HR. */
  approvals?: ClockApprovalRequest[];
  currentUserName?: string;
  currentEmployeeId?: string | null;
}) {
  const locale = useLocale();
  const t = STR[locale];
  // Empty = show ALL records; pick a date to filter to that day.
  const [date, setDate] = useState("");
  const [team, setTeam] = useState<"all" | Team>("all");
  // Filter ketepatan waktu: "ontime" = hadir tanpa telat, "late" = terlambat.
  const [punct, setPunct] = useState<"all" | "ontime" | "late">("all");
  const [selected, setSelected] = useState<Row | null>(null);
  // Ekspor rekap: rentang tanggal.
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFrom, setExportFrom] = useState(dates[0] ?? defaultDate);
  const [exportTo, setExportTo] = useState(dates[dates.length - 1] ?? defaultDate);
  const toast = useToast();

  // Scope: HR → Semua/Data Saya (default Data Saya). Karyawan: hanya datanya.
  const scopeOpts = scopeOptionsFor(canReviewAll, false);
  const [scope, setScope] = useStickyTab<Scope>("attendance.scope", "mine", scopeOpts.length ? scopeOpts : ["mine"]);
  // "reviewing" = tampilan HR (roster, ringkasan, kolom nama). Data Saya → tampilan mandiri.
  const reviewing = canReviewAll && scope !== "mine";

  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const rows: Row[] = useMemo(() => {
    return records
      .filter((r) => !date || r.date === date)
      .filter((r) => reviewing || !currentEmployeeId || r.employeeId === currentEmployeeId)
      .map((r) => ({ ...r, emp: empMap.get(r.employeeId)! }))
      .filter((r) => r.emp && (team === "all" || r.emp.team === team))
      .filter((r) =>
        punct === "all" ? true : punct === "late" ? r.status === "late" : r.status === "present",
      )
      // Newest day first, then by name within a day.
      .sort((a, b) => b.date.localeCompare(a.date) || a.emp.name.localeCompare(b.emp.name));
  }, [records, date, team, punct, empMap, reviewing, currentEmployeeId]);

  const summary = useMemo(() => {
    const s = { present: 0, late: 0, absent: 0, leave: 0, off: 0, ot: 0 };
    for (const r of rows) {
      if (r.status === "present") s.present++;
      else if (r.status === "late") { s.present++; s.late++; }
      else if (r.status === "absent") s.absent++;
      else if (r.status === "leave" || r.status === "sick") s.leave++;
      else if (r.status === "off") s.off++;
      s.ot += r.overtimeMinutes;
    }
    return s;
  }, [rows]);

  function exportCsv() {
    const inRange = records
      .filter((r) => r.date >= exportFrom && r.date <= exportTo)
      .map((r) => ({ r, emp: empMap.get(r.employeeId) }))
      .filter((x) => x.emp && (team === "all" || x.emp.team === team))
      .sort((a, b) => a.r.date.localeCompare(b.r.date) || a.emp!.name.localeCompare(b.emp!.name));
    if (inRange.length === 0) {
      toast.error(t.exportEmpty);
      return;
    }
    const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["NIK", t.cName, t.cTeam, t.cDate, t.thIn, t.thOut, t.cLateMin, t.cOtMin, t.cDistance, t.cStatus]
      .map(cell)
      .join(",");
    const lines = inRange.map(({ r, emp }) =>
      [
        emp!.nik,
        emp!.name,
        TEAM_META[emp!.team].label,
        r.date,
        r.clockIn ? formatTime(r.clockIn) : "",
        r.clockOut ? formatTime(r.clockOut) : "",
        r.lateMinutes || 0,
        r.overtimeMinutes || 0,
        r.clockInDistanceM ?? "",
        STATUS_CSV[locale][r.status],
      ]
        .map(cell)
        .join(","),
    );
    // BOM agar Excel mengenali UTF-8 (huruf Indonesia tampil benar).
    const csv = "﻿" + [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rekap-absensi-${exportFrom}_${exportTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  }

  return (
    <div className="space-y-4 fade-up">
      {/* Heading (employee self-view) */}
      {!reviewing && (
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">{t.myHistory}</h2>
          <p className="text-sm text-muted">{t.myHistoryHint}</p>
        </div>
      )}

      {/* Scope + date + controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {scopeOpts.length > 0 && <ScopeTabs options={scopeOpts} value={scope} onChange={setScope} />}
          <div className="flex items-center gap-2">
            <div className="relative sm:max-w-[220px]">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <Input
                type="date"
                value={date}
                min={dates[0]}
                max={dates[dates.length - 1]}
                onChange={(e) => setDate(e.target.value)}
                className="pl-9"
                aria-label={t.pickDate}
              />
            </div>
            {date ? (
              <button
                type="button"
                onClick={() => setDate("")}
                className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-line px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-sand"
              >
                <X className="h-3.5 w-3.5" /> {t.showAll}
              </button>
            ) : (
              <span className="shrink-0 text-xs font-medium text-faint">{t.allDates}</span>
            )}
          </div>
        </div>
        {reviewing && (
          <Button variant="outline" className="shrink-0" onClick={() => setExportOpen(true)}>
            <Download className="h-4 w-4" /> {t.exportRecap}
          </Button>
        )}
      </div>

      {/* Konfirmasi clock di luar area (HR) */}
      {reviewing && approvals.length > 0 && (
        <ClockApprovalsCard approvals={approvals} employees={employees} currentUserName={currentUserName} />
      )}

      {/* Summary — per-day roster figures; only meaningful for a single date. */}
      {reviewing && date && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <SummaryChip label={t.present} value={summary.present} className="text-forest-600" />
          <SummaryChip label={t.late} value={summary.late} className="text-[#8a6512]" />
          <SummaryChip label={t.leaveSick} value={summary.leave} className="text-sky" />
          <SummaryChip label={t.absent} value={summary.absent} className="text-clay" />
          <SummaryChip label={t.totalOvertime} value={minutesToHM(summary.ot, locale)} className="text-olive" />
        </div>
      )}

      {/* Filters: tim (HR) + ketepatan waktu */}
      <div className="flex flex-wrap items-center gap-2">
        {reviewing && (
          <>
            <Chip active={team === "all"} onClick={() => setTeam("all")}>{t.allTeams}</Chip>
            {TEAMS.map((t) => (
              <Chip key={t} active={team === t} onClick={() => setTeam(t)}>
                {TEAM_META[t].label}
              </Chip>
            ))}
            <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden />
          </>
        )}
        <Chip active={punct === "all"} onClick={() => setPunct("all")}>{t.all}</Chip>
        <Chip active={punct === "ontime"} onClick={() => setPunct("ontime")}>{t.onTime}</Chip>
        <Chip active={punct === "late"} onClick={() => setPunct("late")}>{t.late}</Chip>
      </div>

      {/* Desktop table */}
      <Card className="hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-cream/50 text-left text-xs font-semibold uppercase tracking-wide text-faint">
                <th className="px-5 py-3">{t.thDate}</th>
                {reviewing && (
                  <>
                    <th className="px-5 py-3">{t.thEmployee}</th>
                    <th className="px-5 py-3">{t.thTeam}</th>
                  </>
                )}
                <th className="px-5 py-3">{t.thIn}</th>
                <th className="px-5 py-3">{t.thOut}</th>
                <th className="px-5 py-3">{t.thLate}</th>
                <th className="px-5 py-3">{t.thOvertime}</th>
                <th className="px-5 py-3">{t.thDistance}</th>
                <th className="px-5 py-3">{t.thStatus}</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className="cursor-pointer transition-colors hover:bg-cream/60"
                >
                  <td className="px-5 py-3 whitespace-nowrap font-medium text-ink">{formatDate(r.date, "short", locale)}</td>
                  {reviewing && (
                    <>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={r.emp.name} size="sm" />
                          <div>
                            <p className="font-medium text-ink">{r.emp.name}</p>
                            <p className="text-xs text-faint">{r.emp.position}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", TEAM_META[r.emp.team].chip)}>
                          {TEAM_META[r.emp.team].label}
                        </span>
                      </td>
                    </>
                  )}
                  <td className="px-5 py-3 tabular-nums text-muted">{formatTime(r.clockIn)}</td>
                  <td className="px-5 py-3 tabular-nums text-muted">{formatTime(r.clockOut)}</td>
                  <td className="px-5 py-3 tabular-nums">
                    {r.lateMinutes > 0 ? <span className="text-[#8a6512]">{r.lateMinutes}m</span> : <span className="text-faint">—</span>}
                  </td>
                  <td className="px-5 py-3 tabular-nums">
                    {r.overtimeMinutes > 0 ? <span className="text-olive">{minutesToHM(r.overtimeMinutes, locale)}</span> : <span className="text-faint">—</span>}
                  </td>
                  <td className="px-5 py-3 tabular-nums">
                    {r.clockInDistanceM != null ? (
                      <span className="text-muted">{r.clockInDistanceM} m</span>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <AttendanceBadge status={r.status} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <ChevronRight className="ml-auto h-4 w-4 text-faint" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <Empty />}
      </Card>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {rows.map((r) => (
          <button
            key={r.id}
            onClick={() => setSelected(r)}
            className="card w-full p-4 text-left transition-colors active:bg-cream/60"
          >
            <div className="flex items-center gap-3">
              {reviewing ? (
                <>
                  <Avatar name={r.emp.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{r.emp.name}</p>
                    <p className="truncate text-xs text-faint">{r.emp.position}</p>
                  </div>
                </>
              ) : (
                <p className="min-w-0 flex-1 truncate font-medium text-ink">{formatDate(r.date, "short", locale)}</p>
              )}
              <div className="flex shrink-0 flex-col items-end gap-1">
                {reviewing && <span className="text-xs text-faint">{formatDate(r.date, "short", locale)}</span>}
                <AttendanceBadge status={r.status} />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
              <Mini label={t.thIn} value={formatTime(r.clockIn)} />
              <Mini label={t.thOut} value={formatTime(r.clockOut)} />
              <Mini label={t.thLate} value={r.lateMinutes ? `${r.lateMinutes}m` : "—"} />
              <Mini label={t.thDistance} value={r.clockInDistanceM != null ? `${r.clockInDistanceM}m` : "—"} />
            </div>
          </button>
        ))}
        {rows.length === 0 && <Empty />}
      </div>

      <AttendanceDetail
        open={selected != null}
        record={selected}
        employeeName={selected?.emp.name ?? ""}
        position={selected?.emp.position ?? ""}
        team={selected?.emp.team ?? null}
        scheduleStart={selected?.emp.workStart ?? "08:00"}
        scheduleEnd={selected?.emp.workEnd ?? "17:00"}
        onClose={() => setSelected(null)}
      />

      <Sheet open={exportOpen} onClose={() => setExportOpen(false)} title={t.exportTitle} description={t.exportDesc}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.exportFrom}>
              <Input
                type="date"
                value={exportFrom}
                min={dates[0]}
                max={dates[dates.length - 1]}
                onChange={(e) => setExportFrom(e.target.value)}
              />
            </Field>
            <Field label={t.exportTo}>
              <Input
                type="date"
                value={exportTo}
                min={dates[0]}
                max={dates[dates.length - 1]}
                onChange={(e) => setExportTo(e.target.value)}
              />
            </Field>
          </div>
          <Button className="w-full" onClick={exportCsv}>
            <Download className="h-4 w-4" /> {t.exportBtn}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

/** Panel HR: setujui/tolak clock-in/out yang dilakukan di luar area kantor. */
function ClockApprovalsCard({
  approvals,
  employees,
  currentUserName,
}: {
  approvals: ClockApprovalRequest[];
  employees: EmpLite[];
  currentUserName: string;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const [list, setList] = useState(approvals);
  const [busyId, setBusyId] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();

  async function decide(id: string, status: RequestStatus) {
    const prev = list.find((a) => a.id === id);
    if (!prev) return;
    setBusyId(id);
    try {
      const res = await fetch("/api/attendance/approvals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, approver: currentUserName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.request) {
        toast.error(apiErrorMessage(data?.error, locale, res.status));
        return;
      }
      setList((cur) => cur.filter((a) => a.id !== id));
      toast.success(status === "approved" ? t.approvedOk : t.rejectedOk);
      router.refresh();
    } catch {
      toast.error(t.connectionProblem);
    } finally {
      setBusyId(null);
    }
  }

  if (list.length === 0) return null;

  return (
    <Card className="border-2 border-gold/40">
      <CardHeader className="flex-wrap">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-clay-soft text-[#8c3c1f]">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div>
            <CardTitle>{t.approvalsTitle}</CardTitle>
            <p className="mt-0.5 text-sm text-muted">{t.approvalsDesc}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {list.map((a) => {
          const emp = empMap.get(a.employeeId);
          const isIn = a.direction === "in";
          const isOffDay = a.kind === "off_day";
          return (
            <div key={a.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-cream/40 p-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3 sm:w-52">
                <Avatar name={emp?.name ?? "?"} size="sm" />
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{emp?.name}</p>
                  <p className="truncate text-xs text-faint">{emp?.position}</p>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  {isOffDay ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-[#8a6512]">
                      <PartyPopper className="h-4 w-4" /> {t.offDayWork}
                    </span>
                  ) : (
                    <span className={cn("inline-flex items-center gap-1.5 font-medium", isIn ? "text-forest-700" : "text-[#8c3c1f]")}>
                      {isIn ? <LogIn className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
                      Clock-{a.direction}
                    </span>
                  )}
                  <span className="text-ink">
                    {formatDate(a.date, "short", locale)} · {formatTime(a.requestedAt)}
                    {isOffDay && a.clockOutAt ? `–${formatTime(a.clockOutAt)}` : ""}
                  </span>
                  {isOffDay ? (
                    <Badge tone={a.offDayChoice === "overtime" ? "sky" : "matcha"}>
                      {a.offDayChoice === "overtime" ? t.overtimeChoice : t.swapChoice}
                    </Badge>
                  ) : (
                    a.distanceM != null && <span className="text-[#8c3c1f]">{t.fromSite(formatDistance(a.distanceM))}</span>
                  )}
                </div>
                {a.note && (
                  <p className="mt-1.5 rounded-lg bg-sand/70 px-2.5 py-1.5 text-sm text-muted">
                    &ldquo;{a.note}&rdquo;
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 sm:w-auto">
                <Button size="sm" disabled={busyId === a.id} onClick={() => decide(a.id, "approved")} className="flex-1 sm:flex-none">
                  <Check className="h-4 w-4" /> {t.approve}
                </Button>
                <Button size="sm" variant="outline" disabled={busyId === a.id} onClick={() => decide(a.id, "rejected")} className="flex-1 sm:flex-none">
                  <X className="h-4 w-4" /> {t.reject}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function SummaryChip({ label, value, className }: { label: string; value: number | string; className?: string }) {
  return (
    <div className="card p-3.5">
      <p className={cn("font-display text-xl font-bold tabular-nums", className)}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-cream/60 py-1.5">
      <p className="text-[10px] text-faint">{label}</p>
      <p className="font-medium tabular-nums text-ink">{value}</p>
    </div>
  );
}

function Empty() {
  const locale = useLocale();
  const t = STR[locale];
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-12 text-center">
      <Clock className="h-6 w-6 text-faint" />
      <p className="text-sm font-medium text-ink">{t.emptyTitle}</p>
      <p className="text-sm text-faint">{t.emptyHint}</p>
    </div>
  );
}
