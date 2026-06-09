"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Clock, Download } from "lucide-react";
import type { AttendanceRecord, Employee, Team } from "@/lib/types";
import { TEAMS, TEAM_META } from "@/lib/constants";
import { cn, formatTime, minutesToHM } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { AttendanceBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";

interface Row extends AttendanceRecord {
  emp: Pick<Employee, "id" | "name" | "team" | "position">;
}

export function AttendanceView({
  records,
  employees,
  dates,
  defaultDate,
}: {
  records: AttendanceRecord[];
  employees: Pick<Employee, "id" | "name" | "team" | "position">[];
  dates: string[];
  defaultDate: string;
}) {
  const [date, setDate] = useState(defaultDate);
  const [team, setTeam] = useState<"all" | Team>("all");

  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const rows: Row[] = useMemo(() => {
    return records
      .filter((r) => r.date === date)
      .map((r) => ({ ...r, emp: empMap.get(r.employeeId)! }))
      .filter((r) => r.emp && (team === "all" || r.emp.team === team))
      .sort((a, b) => a.emp.name.localeCompare(b.emp.name));
  }, [records, date, team, empMap]);

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

  return (
    <div className="space-y-4 fade-up">
      {/* Date + controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-[220px]">
          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input
            type="date"
            value={date}
            min={dates[0]}
            max={dates[dates.length - 1]}
            onChange={(e) => setDate(e.target.value)}
            className="pl-9"
            aria-label="Pilih tanggal"
          />
        </div>
        <Button variant="outline" className="shrink-0">
          <Download className="h-4 w-4" /> Ekspor rekap
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryChip label="Hadir" value={summary.present} className="text-forest-600" />
        <SummaryChip label="Terlambat" value={summary.late} className="text-[#8a6512]" />
        <SummaryChip label="Cuti/Sakit" value={summary.leave} className="text-sky" />
        <SummaryChip label="Alpa" value={summary.absent} className="text-clay" />
        <SummaryChip label="Total lembur" value={minutesToHM(summary.ot)} className="text-olive" />
      </div>

      {/* Team filter */}
      <div className="flex flex-wrap gap-2">
        <Chip active={team === "all"} onClick={() => setTeam("all")}>Semua tim</Chip>
        {TEAMS.map((t) => (
          <Chip key={t} active={team === t} onClick={() => setTeam(t)}>
            {TEAM_META[t].label}
          </Chip>
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
                <th className="px-5 py-3">Masuk</th>
                <th className="px-5 py-3">Pulang</th>
                <th className="px-5 py-3">Telat</th>
                <th className="px-5 py-3">Lembur</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-cream/60">
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
                  <td className="px-5 py-3 tabular-nums text-muted">{formatTime(r.clockIn)}</td>
                  <td className="px-5 py-3 tabular-nums text-muted">{formatTime(r.clockOut)}</td>
                  <td className="px-5 py-3 tabular-nums">
                    {r.lateMinutes > 0 ? <span className="text-[#8a6512]">{r.lateMinutes}m</span> : <span className="text-faint">—</span>}
                  </td>
                  <td className="px-5 py-3 tabular-nums">
                    {r.overtimeMinutes > 0 ? <span className="text-olive">{minutesToHM(r.overtimeMinutes)}</span> : <span className="text-faint">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    <AttendanceBadge status={r.status} />
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
          <div key={r.id} className="card p-4">
            <div className="flex items-center gap-3">
              <Avatar name={r.emp.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{r.emp.name}</p>
                <p className="truncate text-xs text-faint">{r.emp.position}</p>
              </div>
              <AttendanceBadge status={r.status} />
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
              <Mini label="Masuk" value={formatTime(r.clockIn)} />
              <Mini label="Pulang" value={formatTime(r.clockOut)} />
              <Mini label="Telat" value={r.lateMinutes ? `${r.lateMinutes}m` : "—"} />
              <Mini label="Lembur" value={r.overtimeMinutes ? minutesToHM(r.overtimeMinutes) : "—"} />
            </div>
          </div>
        ))}
        {rows.length === 0 && <Empty />}
      </div>
    </div>
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
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-12 text-center">
      <Clock className="h-6 w-6 text-faint" />
      <p className="text-sm font-medium text-ink">Tidak ada data absensi</p>
      <p className="text-sm text-faint">Pilih tanggal lain atau ubah filter tim.</p>
    </div>
  );
}
