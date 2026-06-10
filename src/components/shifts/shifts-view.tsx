"use client";

import { useState } from "react";
import { ArrowLeftRight, Check, Clock, Coffee, Plus, X } from "lucide-react";
import type { DayOffInLieu, Employee, RequestStatus, Shift } from "@/lib/types";
import { TEAM_META } from "@/lib/constants";
import { cn, formatDate } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge, RequestBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

export function ShiftsView({
  shifts,
  swaps,
  employees,
}: {
  shifts: Shift[];
  swaps: DayOffInLieu[];
  employees: Pick<Employee, "id" | "name" | "team" | "position">[];
}) {
  const empMap = new Map(employees.map((e) => [e.id, e]));
  const [swapList, setSwapList] = useState(swaps);
  const toast = useToast();

  function decide(id: string, status: RequestStatus) {
    setSwapList((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
    toast.success(status === "approved" ? "Tukar libur disetujui ✓" : "Tukar libur ditolak ✓");
  }

  const pendingSwaps = swapList.filter((s) => s.status === "pending").length;

  return (
    <div className="space-y-5 fade-up">
      {/* Shift definitions */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">Definisi Shift</h2>
          <Button size="sm" variant="outline">
            <Plus className="h-4 w-4" /> Tambah shift
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shifts.map((s) => (
            <div key={s.id} className="card overflow-hidden">
              <div className="h-1.5 w-full" style={{ background: s.color }} />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-ink">{s.name}</h3>
                    <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium", TEAM_META[s.team].chip)}>
                      {TEAM_META[s.team].label}
                    </span>
                  </div>
                  <span className="font-display text-lg font-bold tabular-nums text-forest-600">
                    {s.startTime}
                  </span>
                </div>
                <div className="mt-3 space-y-1.5 text-sm text-muted">
                  <p className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-faint" /> {s.startTime} – {s.endTime}
                  </p>
                  <p className="flex items-center gap-2">
                    <Coffee className="h-4 w-4 text-faint" /> Istirahat {s.breakMinutes} menit
                  </p>
                  <p className="flex items-center gap-2">
                    <ArrowLeftRight className="h-4 w-4 text-faint" /> Lembur setelah {s.overtimeAfter}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Day-off in lieu / swap */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Tukar Libur / Day-off in Lieu</CardTitle>
            <p className="mt-0.5 text-sm text-muted">
              Pengganti hari libur untuk tim pabrik yang bekerja di hari istirahat/libur.
            </p>
          </div>
          {pendingSwaps > 0 && (
            <Badge tone="gold" className="shrink-0 whitespace-nowrap">
              {pendingSwaps} menunggu
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {swapList.map((s) => {
            const emp = empMap.get(s.employeeId);
            return (
              <div
                key={s.id}
                className="flex flex-col gap-3 rounded-2xl border border-line bg-cream/40 p-4 sm:flex-row sm:items-center"
              >
                <div className="flex items-center gap-3 sm:w-56">
                  <Avatar name={emp?.name ?? "?"} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{emp?.name}</p>
                    <p className="truncate text-xs text-faint">{emp?.position}</p>
                  </div>
                </div>

                <div className="flex flex-1 items-center gap-2 text-sm">
                  <div className="flex-1 rounded-lg bg-clay-soft px-2 py-1.5 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-[#8c3c1f]">Bekerja</p>
                    <p className="whitespace-nowrap font-medium text-[#8c3c1f]">{formatDate(s.workedDate)}</p>
                  </div>
                  <ArrowLeftRight className="h-4 w-4 shrink-0 text-faint" />
                  <div className="flex-1 rounded-lg bg-[#e9f0d8] px-2 py-1.5 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-forest-600">Libur ganti</p>
                    <p className="whitespace-nowrap font-medium text-forest-600">{formatDate(s.offDate)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:w-auto">
                  {s.status === "pending" ? (
                    <>
                      <Button size="sm" onClick={() => decide(s.id, "approved")} className="flex-1 sm:flex-none">
                        <Check className="h-4 w-4" /> Setujui
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => decide(s.id, "rejected")} className="flex-1 sm:flex-none">
                        <X className="h-4 w-4" /> Tolak
                      </Button>
                    </>
                  ) : (
                    <RequestBadge status={s.status} />
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
