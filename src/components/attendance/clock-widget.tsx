"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Fingerprint,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  PartyPopper,
  PiggyBank,
  Timer,
} from "lucide-react";
import { createPortal } from "react-dom";
import type { TeamGeofence } from "@/lib/types";
import { distanceMeters, formatDistance } from "@/lib/geo";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/layout/locale-context";
import type { Locale } from "@/lib/i18n";
import { CameraCapture } from "./camera-capture";

type Phase = "out" | "in";
type Flow = "idle" | "locating" | "camera" | "submitting";

const STR: Record<
  Locale,
  {
    loading: string;
    gpsInaccurate: (accuracy: number) => string;
    locationRequiredLong: string;
    outOfRange: (distance: string, max: number) => string;
    locationRequired: string;
    photoRequired: string;
    recordFailed: string;
    pendingSent: (dir: "in" | "out") => string;
    clockInOk: string;
    clockOutOk: string;
    connectionProblem: string;
    status: string;
    working: string;
    notClockedIn: string;
    clockedInAt: string;
    workDuration: string;
    hm: (h: number, m: number) => string;
    geoChip: (distance: string, label: string, accuracy: number) => string;
    locationRule: (radius: number) => string;
    photoRule: string;
    checkingLocation: string;
    processing: string;
    clockOut: string;
    clockInNow: string;
    verifyNote: string;
    cameraTitle: (dir: "in" | "out") => string;
    oorTitle: string;
    oorBodyStart: string;
    oorBodyMid: (location: string, max: number) => string;
    oorBodyNeeds: string;
    oorHrConfirm: string;
    oorBodyEnd: string;
    oorNoteLabel: string;
    oorNotePlaceholder: string;
    cancel: string;
    sendToHr: string;
    offDayTitle: string;
    offDayBody: string;
    offDaySwapTitle: string;
    offDaySwapDesc: string;
    offDayOtTitle: string;
    offDayOtDesc: string;
    swapSent: string;
    overtimeSent: string;
  }
> = {
  id: {
    loading: "Memuat…",
    gpsInaccurate: (accuracy) =>
      `Sinyal GPS kurang akurat (±${accuracy} m). Pindah ke area terbuka lalu coba lagi.`,
    locationRequiredLong: "Lokasi wajib aktif. Izinkan akses lokasi di browser/HP Anda.",
    outOfRange: (distance, max) => `Di luar jangkauan (${distance} / maks ${max} m).`,
    locationRequired: "Lokasi wajib aktif.",
    photoRequired: "Foto wajah wajib diambil.",
    recordFailed: "Gagal merekam absensi. Coba lagi.",
    pendingSent: (dir) => `Pengajuan clock-${dir} di luar area terkirim — menunggu konfirmasi HR ✓`,
    clockInOk: "Clock-in berhasil terekam ✓",
    clockOutOk: "Clock-out berhasil terekam ✓",
    connectionProblem: "Koneksi bermasalah. Coba lagi.",
    status: "Status",
    working: "Sedang Bekerja",
    notClockedIn: "Belum Clock-In",
    clockedInAt: "Masuk pukul",
    workDuration: "Durasi kerja",
    hm: (h, m) => `${h}j ${m}m`,
    geoChip: (distance, label, accuracy) => `${distance} dari ${label} · ±${accuracy} m`,
    locationRule: (radius) => `Wajib lokasi (≤ ${radius} m)`,
    photoRule: "Wajib foto wajah",
    checkingLocation: "Memeriksa lokasi…",
    processing: "Memproses…",
    clockOut: "Clock Out",
    clockInNow: "Clock In Sekarang",
    verifyNote: "Absensi memverifikasi lokasi & foto wajah Anda.",
    cameraTitle: (dir) => `Verifikasi Wajah · Clock ${dir === "in" ? "In" : "Out"}`,
    oorTitle: "Anda di luar area kantor",
    oorBodyStart: "Posisi Anda",
    oorBodyMid: (location, max) => ` dari ${location} (maksimal ${max} m). Clock-`,
    oorBodyNeeds: " perlu ",
    oorHrConfirm: "konfirmasi HR",
    oorBodyEnd: " terlebih dahulu — absensi tercatat setelah disetujui.",
    oorNoteLabel: "Catatan untuk HR (opsional)",
    oorNotePlaceholder: "cth. Kunjungan ke supplier / tugas luar kantor…",
    cancel: "Batal",
    sendToHr: "Kirim ke HR",
    offDayTitle: "Hari ini jadwal libur Anda 🎉",
    offDayBody: "Anda tetap masuk di hari libur. Mau dihitung sebagai apa?",
    offDaySwapTitle: "Tukar hari libur",
    offDaySwapDesc: "Disimpan jadi tabungan libur — bisa dicairkan jadi libur lain (perlu konfirmasi HR).",
    offDayOtTitle: "Hitung sebagai lembur",
    offDayOtDesc: "Seluruh jam kerja hari ini dicatat sebagai lembur (dibuat saat Anda clock-out).",
    swapSent: "Tercatat — diajukan jadi tabungan libur ✓",
    overtimeSent: "Tercatat sebagai lembur — selesaikan dengan clock-out ✓",
  },
  en: {
    loading: "Loading…",
    gpsInaccurate: (accuracy) =>
      `GPS signal is inaccurate (±${accuracy} m). Move to an open area and try again.`,
    locationRequiredLong: "Location must be enabled. Allow location access in your browser/phone.",
    outOfRange: (distance, max) => `Out of range (${distance} / max ${max} m).`,
    locationRequired: "Location must be enabled.",
    photoRequired: "A face photo is required.",
    recordFailed: "Failed to record attendance. Try again.",
    pendingSent: (dir) => `Out-of-area clock-${dir} request sent — awaiting HR confirmation ✓`,
    clockInOk: "Clock-in recorded ✓",
    clockOutOk: "Clock-out recorded ✓",
    connectionProblem: "Connection problem. Try again.",
    status: "Status",
    working: "Currently Working",
    notClockedIn: "Not Clocked In",
    clockedInAt: "Clocked in at",
    workDuration: "Work duration",
    hm: (h, m) => `${h}h ${m}m`,
    geoChip: (distance, label, accuracy) => `${distance} from ${label} · ±${accuracy} m`,
    locationRule: (radius) => `Location required (≤ ${radius} m)`,
    photoRule: "Face photo required",
    checkingLocation: "Checking location…",
    processing: "Processing…",
    clockOut: "Clock Out",
    clockInNow: "Clock In Now",
    verifyNote: "Attendance verifies your location & face photo.",
    cameraTitle: (dir) => `Face Verification · Clock ${dir === "in" ? "In" : "Out"}`,
    oorTitle: "You are outside the office area",
    oorBodyStart: "You are",
    oorBodyMid: (location, max) => ` from ${location} (max ${max} m). Clock-`,
    oorBodyNeeds: " needs ",
    oorHrConfirm: "HR confirmation",
    oorBodyEnd: " first — attendance is recorded once approved.",
    oorNoteLabel: "Note for HR (optional)",
    oorNotePlaceholder: "e.g. Supplier visit / off-site assignment…",
    cancel: "Cancel",
    sendToHr: "Send to HR",
    offDayTitle: "Today is your day off 🎉",
    offDayBody: "You're clocking in on a day off. How should it count?",
    offDaySwapTitle: "Swap a day off",
    offDaySwapDesc: "Saved as leave savings — withdraw it for another day off later (needs HR confirmation).",
    offDayOtTitle: "Count as overtime",
    offDayOtDesc: "Your whole day's work is recorded as overtime (created when you clock out).",
    swapSent: "Recorded — submitted as leave savings ✓",
    overtimeSent: "Recorded as overtime — finish by clocking out ✓",
  },
};

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

/** Nomor hari (0=Min..6=Sab) sekarang menurut WITA. */
function witaDowNow(): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Makassar", weekday: "short" }).format(new Date());
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
}

export function ClockWidget({
  geofence,
  requireLocation,
  requirePhoto,
  shiftLabel = "Office Reguler · 08:00–17:00",
  workDays = [1, 2, 3, 4, 5],
}: {
  geofence: TeamGeofence;
  requireLocation: boolean;
  requirePhoto: boolean;
  shiftLabel?: string;
  /** Hari kerja karyawan (0=Min..6=Sab); clock-in di luar ini → modal pilihan. */
  workDays?: number[];
}) {
  const locale = useLocale();
  const t = STR[locale];
  const offDayToday = !workDays.includes(witaDowNow());
  const [now, setNow] = useState<Date | null>(null);
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("out");
  const [clockInAt, setClockInAt] = useState<Date | null>(null);
  const [flow, setFlow] = useState<Flow>("idle");
  const [notice, setNotice] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [geo, setGeo] = useState<{ lat: number; lng: number; distance: number; accuracy: number } | null>(null);
  // Alur "di luar area": modal danger → catatan opsional → kirim sebagai
  // pengajuan konfirmasi HR (absensi tidak langsung tercatat).
  const [oorPrompt, setOorPrompt] = useState<{ distance: number } | null>(null);
  const [oorNote, setOorNote] = useState("");
  const [oorMode, setOorMode] = useState(false);
  // Alur "hari libur": clock-in sukses verifikasi → modal pilih tukar libur / lembur.
  const [oodPending, setOodPending] = useState<{
    coords: { lat: number; lng: number; distance: number; accuracy: number } | null;
    photo: string | null;
  } | null>(null);
  const pendingDir = phase === "out" ? "in" : "out";

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const intlLocale = locale === "en" ? "en-GB" : "id-ID";
  const time = now
    ? now.toLocaleTimeString(intlLocale, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    : "--:--:--";
  const dateStr = now
    ? now.toLocaleDateString(intlLocale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
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
          if (couldBeInside) {
            setNotice({
              tone: "error",
              text: t.gpsInaccurate(Math.round(accuracy)),
            });
            return;
          }
          // Benar-benar di luar area → tawarkan jalur konfirmasi HR.
          setOorNote("");
          setOorPrompt({ distance });
          return;
        }
      } catch {
        setFlow("idle");
        setNotice({ tone: "error", text: t.locationRequiredLong });
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
    await submit(geo, dataUrl, oorMode);
  }

  // Karyawan setuju mengajukan konfirmasi HR dari modal "di luar area".
  function confirmOutOfRange() {
    setOorPrompt(null);
    setOorMode(true);
    setNotice(null);
    if (requirePhoto) setFlow("camera");
    else submit(geo, null, true);
  }

  // Karyawan memilih perlakuan clock-in di hari libur.
  function chooseOffDay(choice: "swap" | "overtime") {
    const p = oodPending;
    setOodPending(null);
    if (!p) return;
    submit(p.coords, p.photo, false, choice);
  }

  async function submit(
    coords: { lat: number; lng: number; distance: number; accuracy: number } | null,
    photo: string | null,
    asOutOfRange = false,
    offDayChoice?: "swap" | "overtime",
  ) {
    // Clock-in di hari libur (dalam area) → minta pilihan dulu sebelum kirim.
    if (pendingDir === "in" && offDayToday && !asOutOfRange && !offDayChoice) {
      setFlow("idle");
      setOodPending({ coords, photo });
      return;
    }
    setFlow("submitting");
    try {
      const res = await fetch("/api/attendance/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: pendingDir,
          lat: coords?.lat,
          lng: coords?.lng,
          photo,
          confirmOutOfRange: asOutOfRange || undefined,
          note: asOutOfRange ? oorNote.trim() || undefined : undefined,
          offDayChoice,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "out_of_range") {
          setNotice({ tone: "error", text: t.outOfRange(formatDistance(data.distance), data.maxRadius) });
        } else if (data.error === "location_required") {
          setNotice({ tone: "error", text: t.locationRequired });
        } else if (data.error === "photo_required") {
          setNotice({ tone: "error", text: t.photoRequired });
        } else {
          setNotice({ tone: "error", text: t.recordFailed });
        }
        setFlow("idle");
        setOorMode(false);
        return;
      }
      // Pengajuan luar area terkirim — absensi MENUNGGU konfirmasi HR.
      if (data.pending) {
        setOorMode(false);
        setOorNote("");
        setNotice({
          tone: "ok",
          text: t.pendingSent(pendingDir),
        });
        router.refresh();
        return;
      }
      if (pendingDir === "in") {
        setClockInAt(new Date());
        setPhase("in");
        setNotice({
          tone: "ok",
          text: offDayChoice === "swap" ? t.swapSent : offDayChoice === "overtime" ? t.overtimeSent : t.clockInOk,
        });
      } else {
        setPhase("out");
        setNotice({ tone: "ok", text: t.clockOutOk });
      }
      // Sinkronkan ulang data server di latar belakang (riwayat absensi, dashboard)
      // tanpa memblokir UI — cache router diinvalidasi lalu di-prefetch ulang.
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: t.connectionProblem });
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
              <span className="text-sm">{dateStr || t.loading}</span>
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
              <p className="text-sm text-muted">{t.status}</p>
              <p className={cn("font-display text-lg font-semibold", phase === "in" ? "text-forest-600" : "text-faint")}>
                {phase === "in" ? t.working : t.notClockedIn}
              </p>
            </div>
            {phase === "in" && clockInAt && (
              <div className="text-right">
                <p className="text-sm text-muted">{t.clockedInAt}</p>
                <p className="font-display text-lg font-semibold text-ink">
                  {clockInAt.toLocaleTimeString(intlLocale, { hour: "2-digit", minute: "2-digit", hour12: false })}
                </p>
              </div>
            )}
          </div>

          {phase === "in" && (
            <div className="mb-4 rounded-xl bg-[#e9f0d8] px-4 py-2.5 text-sm text-forest-700">
              {t.workDuration}: <span className="font-semibold">{t.hm(Math.floor(worked / 60), worked % 60)}</span>
            </div>
          )}

          {/* Requirements row */}
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            {requireLocation && (
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1", geo ? "bg-[#e9f0d8] text-forest-700" : "bg-sand text-muted")}>
                <MapPin className="h-3 w-3" />
                {geo
                  ? t.geoChip(formatDistance(geo.distance), geofence.label, Math.round(geo.accuracy))
                  : t.locationRule(geofence.radiusM)}
              </span>
            )}
            {requirePhoto && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sand px-2.5 py-1 text-muted">
                <Fingerprint className="h-3 w-3" /> {t.photoRule}
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
                {flow === "locating" ? t.checkingLocation : t.processing}
              </>
            ) : phase === "in" ? (
              <>
                <LogOut className="h-5 w-5" /> {t.clockOut}
              </>
            ) : (
              <>
                <LogIn className="h-5 w-5" /> {t.clockInNow}
              </>
            )}
          </Button>
          <p className="mt-2.5 text-center text-xs text-faint">
            {t.verifyNote}
          </p>
        </div>
      </div>

      <CameraCapture
        open={flow === "camera"}
        title={t.cameraTitle(pendingDir)}
        onCapture={onCapture}
        onCancel={() => {
          setFlow("idle");
          setOorMode(false);
        }}
      />

      <OutOfRangeModal
        open={oorPrompt != null}
        direction={pendingDir}
        distance={oorPrompt?.distance ?? 0}
        maxRadius={geofence.radiusM}
        locationLabel={geofence.label}
        note={oorNote}
        onNoteChange={setOorNote}
        onConfirm={confirmOutOfRange}
        onCancel={() => setOorPrompt(null)}
      />

      <OffDayModal open={oodPending != null} t={t} onChoose={chooseOffDay} onCancel={() => setOodPending(null)} />
    </>
  );
}

/**
 * Modal danger saat clock di luar area: jelaskan jaraknya, minta persetujuan
 * mengirim PENGAJUAN ke HR + catatan opsional. Portal ke body (transform pada
 * ancestor seperti .fade-up akan merusak position:fixed).
 */
function OutOfRangeModal({
  open,
  direction,
  distance,
  maxRadius,
  locationLabel,
  note,
  onNoteChange,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  direction: "in" | "out";
  distance: number;
  maxRadius: number;
  locationLabel: string;
  note: string;
  onNoteChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[75] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-bark/50 backdrop-blur-sm" onClick={onCancel} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={t.oorTitle}
        className="relative w-full rounded-t-3xl bg-panel p-5 shadow-pop sm:max-w-md sm:rounded-3xl"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-clay-soft text-[#8c3c1f]">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-ink">{t.oorTitle}</h2>
            <p className="mt-1 text-sm text-muted">
              {t.oorBodyStart} <span className="font-semibold text-[#8c3c1f]">{formatDistance(distance)}</span>
              {t.oorBodyMid(locationLabel, maxRadius)}
              {direction}
              {t.oorBodyNeeds}
              <span className="font-semibold">{t.oorHrConfirm}</span>
              {t.oorBodyEnd}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <Field label={t.oorNoteLabel}>
            <Textarea
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder={t.oorNotePlaceholder}
              rows={3}
            />
          </Field>
        </div>

        <div className="mt-4 flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
            {t.cancel}
          </Button>
          <Button type="button" variant="danger" className="flex-1" onClick={onConfirm}>
            {t.sendToHr}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Modal pilihan saat clock-in di hari libur. Psikologi: hangat & apresiatif
 * (bukan error) — header emas + ikon perayaan, lalu dua kartu pilihan besar
 * (tukar libur = hijau/tabungan, lembur = biru/jam). Portal ke body.
 */
function OffDayModal({
  open,
  t,
  onChoose,
  onCancel,
}: {
  open: boolean;
  t: (typeof STR)["id"];
  onChoose: (choice: "swap" | "overtime") => void;
  onCancel: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[75] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-bark/50 backdrop-blur-sm" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.offDayTitle}
        className="relative w-full overflow-hidden rounded-t-3xl bg-panel shadow-pop sm:max-w-md sm:rounded-3xl"
      >
        <div className="flex items-center gap-3 bg-gradient-to-br from-gold to-[#c8941f] px-5 py-5 text-white">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20">
            <PartyPopper className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold">{t.offDayTitle}</h2>
            <p className="mt-0.5 text-sm text-white/90">{t.offDayBody}</p>
          </div>
        </div>

        <div className="space-y-2.5 p-5">
          <button
            type="button"
            onClick={() => onChoose("swap")}
            className="flex w-full items-center gap-3 rounded-2xl border border-forest-200 bg-[#e9f0d8] px-4 py-3.5 text-left transition-transform active:scale-[0.98]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-forest-600 text-cream">
              <PiggyBank className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-forest-700">{t.offDaySwapTitle}</span>
              <span className="block text-xs text-forest-700/80">{t.offDaySwapDesc}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-forest-600" />
          </button>

          <button
            type="button"
            onClick={() => onChoose("overtime")}
            className="flex w-full items-center gap-3 rounded-2xl border border-sky/30 bg-sky-soft px-4 py-3.5 text-left transition-transform active:scale-[0.98]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky text-cream">
              <Timer className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-[#2c5775]">{t.offDayOtTitle}</span>
              <span className="block text-xs text-[#2c5775]/80">{t.offDayOtDesc}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-sky" />
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="mt-1 w-full rounded-xl py-2 text-sm font-medium text-muted transition-colors hover:bg-sand"
          >
            {t.cancel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
