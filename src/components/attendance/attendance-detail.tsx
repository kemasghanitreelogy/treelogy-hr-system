"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Clock3, LogIn, LogOut, MapPin, X } from "lucide-react";
import type { AttendanceRecord, Team } from "@/lib/types";
import { TEAM_META } from "@/lib/constants";
import { cn, formatDate, formatTime, minutesToHM } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { AttendanceBadge } from "@/components/ui/badge";

function workedMinutes(inIso?: string | null, outIso?: string | null): number | null {
  if (!inIso || !outIso) return null;
  const a = new Date(inIso).getTime();
  const b = new Date(outIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return null;
  return Math.round((b - a) / 60000);
}

function Selfie({ path, label }: { path?: string | null; label: string }) {
  const [broken, setBroken] = useState(false);
  if (!path || broken) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-sand text-faint">
        <Camera className="h-6 w-6" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/attendance/photo?path=${encodeURIComponent(path)}`}
      alt={`Foto ${label}`}
      onError={() => setBroken(true)}
      className="aspect-square w-full rounded-xl object-cover"
    />
  );
}

function Punch({
  dir,
  time,
  distance,
  lat,
  lng,
  photo,
}: {
  dir: "in" | "out";
  time?: string | null;
  distance?: number | null;
  lat?: number | null;
  lng?: number | null;
  photo?: string | null;
}) {
  const label = dir === "in" ? "Clock In" : "Clock Out";
  const Icon = dir === "in" ? LogIn : LogOut;
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg",
            dir === "in" ? "bg-forest-100 text-forest-700" : "bg-clay-soft text-clay",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="font-display text-sm font-semibold text-ink">{label}</span>
        <span className="ml-auto font-display text-lg font-bold tabular-nums text-ink">
          {formatTime(time)}
        </span>
      </div>

      <Selfie path={photo} label={label} />

      <div className="mt-3 space-y-1.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-muted">
            <MapPin className="h-4 w-4" /> Jarak dari kantor
          </span>
          <span className="font-medium tabular-nums text-ink">
            {distance != null ? `${distance} m` : "—"}
          </span>
        </div>
        {lat != null && lng != null && (
          <a
            href={`https://www.google.com/maps?q=${lat},${lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-forest-700 hover:underline"
          >
            Lihat lokasi di peta →
          </a>
        )}
      </div>
    </div>
  );
}

export function AttendanceDetail({
  open,
  record,
  employeeName,
  position,
  team,
  scheduleStart = "08:00",
  scheduleEnd = "17:00",
  onClose,
}: {
  open: boolean;
  record: AttendanceRecord | null;
  employeeName: string;
  position: string;
  team: Team | null;
  scheduleStart?: string;
  scheduleEnd?: string;
  onClose: () => void;
}) {
  // Portal to <body> so a transformed ancestor (e.g. the page's `fade-up`) can't
  // turn `position: fixed` into a containing block and push the dialog off-screen.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !record || !mounted) return null;
  const worked = workedMinutes(record.clockIn, record.clockOut);

  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-bark/50 backdrop-blur-sm animate-overlay" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-cream p-5 shadow-pop animate-dialog sm:rounded-2xl"
      >
        {/* Header */}
        <div className="flex items-start gap-3">
          <Avatar name={employeeName} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base font-semibold text-ink">{employeeName}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-faint">
              <span className="truncate">{position}</span>
              {team && (
                <span className={cn("rounded-full px-2 py-0.5 font-medium", TEAM_META[team].chip)}>
                  {TEAM_META[team].label}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-faint hover:bg-sand hover:text-ink"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Date + status */}
        <div className="mt-4 flex items-center justify-between rounded-xl bg-panel px-4 py-2.5">
          <span className="text-sm font-medium text-ink">{formatDate(record.date, "long")}</span>
          <AttendanceBadge status={record.status} />
        </div>

        {/* Schedule + late verdict */}
        <div
          className={cn(
            "mt-3 flex items-center justify-between rounded-xl px-4 py-2.5 text-sm",
            record.lateMinutes > 0 ? "bg-clay-soft text-[#8c3c1f]" : "bg-[#e9f0d8] text-forest-700",
          )}
        >
          <span className="flex items-center gap-1.5">
            <Clock3 className="h-4 w-4" /> Jadwal {scheduleStart}–{scheduleEnd}
          </span>
          <span className="font-semibold tabular-nums">
            {record.lateMinutes > 0 ? `Telat ${record.lateMinutes} menit` : "Tepat waktu"}
          </span>
        </div>

        {/* Punches */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Punch
            dir="in"
            time={record.clockIn}
            distance={record.clockInDistanceM}
            lat={record.clockInLat}
            lng={record.clockInLng}
            photo={record.clockInPhoto}
          />
          <Punch
            dir="out"
            time={record.clockOut}
            distance={record.clockOutDistanceM}
            lat={record.clockOutLat}
            lng={record.clockOutLng}
            photo={record.clockOutPhoto}
          />
        </div>

        {/* Footer metrics */}
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <Metric label="Telat" value={record.lateMinutes ? `${record.lateMinutes}m` : "—"} />
          <Metric label="Lembur" value={record.overtimeMinutes ? minutesToHM(record.overtimeMinutes) : "—"} />
          <Metric label="Durasi kerja" value={worked != null ? minutesToHM(worked) : "—"} />
        </div>
        <p className="mt-3 text-center text-xs text-faint">
          Sumber: {record.source} · diverifikasi lokasi &amp; foto wajah
        </p>
      </div>
    </div>,
    document.body,
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-panel px-3 py-2.5">
      <p className="font-display text-base font-bold tabular-nums text-ink">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
