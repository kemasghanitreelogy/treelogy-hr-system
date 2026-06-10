"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Fingerprint,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
} from "lucide-react";
import type { TeamGeofence } from "@/lib/types";
import { distanceMeters, formatDistance } from "@/lib/geo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CameraCapture } from "./camera-capture";

type Phase = "out" | "in";
type Flow = "idle" | "locating" | "camera" | "submitting";

/**
 * Get the most accurate GPS fix we can within a short window. The first fix a
 * device returns is often coarse (Wi-Fi/cell based) before the GPS chip locks
 * on, so we watch for a few seconds, keep the reading with the smallest accuracy
 * radius, and stop early once it's good enough (≤ targetAccuracy metres).
 */
function getBestPosition(targetAccuracy = 30, maxWait = 10000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("no_geo"));
      return;
    }
    let best: GeolocationPosition | null = null;
    const finish = () => {
      clearTimeout(timer);
      navigator.geolocation.clearWatch(id);
      if (best) resolve(best);
      else reject(new Error("no_fix"));
    };
    const timer = setTimeout(finish, maxWait);
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
        if (pos.coords.accuracy <= targetAccuracy) finish(); // good enough — stop converging
      },
      (err) => {
        if (!best) {
          clearTimeout(timer);
          navigator.geolocation.clearWatch(id);
          reject(err);
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxWait },
    );
  });
}

export function ClockWidget({
  geofence,
  requireLocation,
  requirePhoto,
  shiftLabel = "Office Reguler · 08:00–17:00",
}: {
  geofence: TeamGeofence;
  requireLocation: boolean;
  requirePhoto: boolean;
  shiftLabel?: string;
}) {
  const [now, setNow] = useState<Date | null>(null);
  const [phase, setPhase] = useState<Phase>("out");
  const [clockInAt, setClockInAt] = useState<Date | null>(null);
  const [flow, setFlow] = useState<Flow>("idle");
  const [notice, setNotice] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [geo, setGeo] = useState<{ lat: number; lng: number; distance: number; accuracy: number } | null>(null);
  const pendingDir = phase === "out" ? "in" : "out";

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const time = now
    ? now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    : "--:--:--";
  const dateStr = now
    ? now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";

  async function start() {
    setNotice(null);
    let coords: { lat: number; lng: number; distance: number; accuracy: number } | null = null;

    if (requireLocation) {
      setFlow("locating");
      try {
        const pos = await getBestPosition();
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;
        const distance = distanceMeters(lat, lng, geofence.lat, geofence.lng);
        coords = { lat, lng, distance, accuracy };
        setGeo(coords);
        if (distance > geofence.radiusM) {
          // If the gap is within the GPS uncertainty, it's likely a weak signal
          // rather than truly being away — ask to retry instead of hard-rejecting.
          const couldBeInside = distance - accuracy <= geofence.radiusM;
          setFlow("idle");
          setNotice({
            tone: "error",
            text: couldBeInside
              ? `Sinyal GPS kurang akurat (±${Math.round(accuracy)} m). Pindah ke area terbuka lalu coba lagi.`
              : `Anda ${formatDistance(distance)} dari ${geofence.label} — maksimal ${geofence.radiusM} m. Mendekatlah ke lokasi.`,
          });
          return;
        }
      } catch {
        setFlow("idle");
        setNotice({ tone: "error", text: "Lokasi wajib aktif. Izinkan akses lokasi di browser/HP Anda." });
        return;
      }
    }

    if (requirePhoto) {
      setFlow("camera");
    } else {
      await submit(coords, null);
    }
  }

  async function onCapture(dataUrl: string) {
    setFlow("submitting");
    await submit(geo, dataUrl);
  }

  async function submit(
    coords: { lat: number; lng: number; distance: number; accuracy: number } | null,
    photo: string | null,
  ) {
    setFlow("submitting");
    try {
      const res = await fetch("/api/attendance/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction: pendingDir, lat: coords?.lat, lng: coords?.lng, photo }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "out_of_range") {
          setNotice({ tone: "error", text: `Di luar jangkauan (${formatDistance(data.distance)} / maks ${data.maxRadius} m).` });
        } else if (data.error === "location_required") {
          setNotice({ tone: "error", text: "Lokasi wajib aktif." });
        } else if (data.error === "photo_required") {
          setNotice({ tone: "error", text: "Foto wajah wajib diambil." });
        } else {
          setNotice({ tone: "error", text: "Gagal merekam absensi. Coba lagi." });
        }
        setFlow("idle");
        return;
      }
      if (pendingDir === "in") {
        setClockInAt(new Date());
        setPhase("in");
        setNotice({ tone: "ok", text: "Clock-in berhasil terekam ✓" });
      } else {
        setPhase("out");
        setNotice({ tone: "ok", text: "Clock-out berhasil terekam ✓" });
      }
    } catch {
      setNotice({ tone: "error", text: "Koneksi bermasalah. Coba lagi." });
    } finally {
      setFlow("idle");
    }
  }

  const worked =
    clockInAt && now && phase === "in"
      ? Math.max(0, Math.floor((now.getTime() - clockInAt.getTime()) / 60000))
      : 0;
  const busy = flow === "locating" || flow === "submitting";

  return (
    <>
      <div className="card overflow-hidden">
        <div className="relative bg-bark px-5 py-6 text-cream">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-forest-700/40 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 text-forest-100/70">
              <Clock className="h-4 w-4" />
              <span className="text-sm">{dateStr || "Memuat…"}</span>
            </div>
            <p className="mt-2 font-display text-5xl font-bold tabular-nums tracking-tight">{time}</p>
            <p className="mt-1 text-sm text-forest-100/70">WITA</p>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-forest-100/80">
              <span className="flex items-center gap-1.5">
                <Fingerprint className="h-4 w-4 text-lime" /> {shiftLabel}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-lime" /> {geofence.label}
              </span>
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">Status</p>
              <p className={cn("font-display text-lg font-semibold", phase === "in" ? "text-forest-600" : "text-faint")}>
                {phase === "in" ? "Sedang Bekerja" : "Belum Clock-In"}
              </p>
            </div>
            {phase === "in" && clockInAt && (
              <div className="text-right">
                <p className="text-sm text-muted">Masuk pukul</p>
                <p className="font-display text-lg font-semibold text-ink">
                  {clockInAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false })}
                </p>
              </div>
            )}
          </div>

          {phase === "in" && (
            <div className="mb-4 rounded-xl bg-[#e9f0d8] px-4 py-2.5 text-sm text-forest-700">
              Durasi kerja: <span className="font-semibold">{Math.floor(worked / 60)}j {worked % 60}m</span>
            </div>
          )}

          {/* Requirements row */}
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            {requireLocation && (
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1", geo ? "bg-[#e9f0d8] text-forest-700" : "bg-sand text-muted")}>
                <MapPin className="h-3 w-3" />
                {geo
                  ? `${formatDistance(geo.distance)} dari ${geofence.label} · ±${Math.round(geo.accuracy)} m`
                  : `Wajib lokasi (≤ ${geofence.radiusM} m)`}
              </span>
            )}
            {requirePhoto && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sand px-2.5 py-1 text-muted">
                <Fingerprint className="h-3 w-3" /> Wajib foto wajah
              </span>
            )}
          </div>

          {notice && (
            <div
              className={cn(
                "mb-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm",
                notice.tone === "error" ? "bg-clay-soft text-[#8c3c1f]" : "bg-[#e9f0d8] text-forest-700",
              )}
            >
              {notice.tone === "error" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>{notice.text}</span>
            </div>
          )}

          <Button
            onClick={start}
            size="lg"
            variant={phase === "in" ? "danger" : "primary"}
            className="h-14 w-full text-base"
            disabled={busy}
          >
            {busy ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                {flow === "locating" ? "Memeriksa lokasi…" : "Memproses…"}
              </>
            ) : phase === "in" ? (
              <>
                <LogOut className="h-5 w-5" /> Clock Out
              </>
            ) : (
              <>
                <LogIn className="h-5 w-5" /> Clock In Sekarang
              </>
            )}
          </Button>
          <p className="mt-2.5 text-center text-xs text-faint">
            Absensi memverifikasi lokasi &amp; foto wajah Anda.
          </p>
        </div>
      </div>

      <CameraCapture
        open={flow === "camera"}
        title={`Verifikasi Wajah · Clock ${pendingDir === "in" ? "In" : "Out"}`}
        onCapture={onCapture}
        onCancel={() => setFlow("idle")}
      />
    </>
  );
}
