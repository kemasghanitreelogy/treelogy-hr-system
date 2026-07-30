"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, ScanLine, X } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { parseQrPayload } from "@/lib/qr";
import { useLocale } from "@/components/layout/locale-context";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

/* ============================================================
   Pemindai QR dalam aplikasi.

   Memakai BarcodeDetector bawaan browser (Chrome/Android, Edge) — nol dependency,
   nol bundle tambahan. Di browser yang belum mendukungnya (Safari iOS saat ini)
   panel otomatis berubah jadi input kode manual, bukan layar kosong: pengguna
   tetap bisa memindai dengan kamera bawaan HP karena QR berisi URL penuh.
   ============================================================ */

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

function getDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return typeof ctor === "function" ? ctor : null;
}

const STR: Record<
  Locale,
  {
    title: string;
    aim: string;
    starting: string;
    denied: string;
    unsupported: string;
    manualLabel: string;
    manualHint: string;
    open: string;
    close: string;
    notFound: string;
  }
> = {
  id: {
    title: "Pindai QR barang",
    aim: "Arahkan kamera ke label QR.",
    starting: "Menyalakan kamera…",
    denied: "Akses kamera ditolak. Izinkan kamera atau ketik kodenya di bawah.",
    unsupported: "Browser ini belum bisa memindai langsung. Ketik kode barangnya, atau pindai dengan kamera bawaan HP.",
    manualLabel: "Kode barang",
    manualHint: "Contoh: INV-0001",
    open: "Buka",
    close: "Tutup",
    notFound: "Kode tidak dikenali.",
  },
  en: {
    title: "Scan item QR",
    aim: "Point the camera at the QR label.",
    starting: "Starting the camera…",
    denied: "Camera access denied. Allow the camera or type the code below.",
    unsupported: "This browser can't scan in-app yet. Type the item code, or scan with your phone's camera app.",
    manualLabel: "Item code",
    manualHint: "e.g. INV-0001",
    open: "Open",
    close: "Close",
    notFound: "Code not recognised.",
  },
};

export function QrScanner({ onDetect, onClose }: { onDetect: (code: string) => void; onClose: () => void }) {
  const locale = useLocale();
  const t = STR[locale];
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const doneRef = useRef(false);

  const [phase, setPhase] = useState<"starting" | "scanning" | "denied" | "unsupported">("starting");
  const [manual, setManual] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    const Ctor = getDetectorCtor();
    if (!Ctor || !navigator.mediaDevices?.getUserMedia) {
      setPhase("unsupported");
      return;
    }

    let cancelled = false;
    const detector = new Ctor({ formats: ["qr_code"] });

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setPhase("scanning");

        const tick = async () => {
          if (cancelled || doneRef.current || !videoRef.current) return;
          try {
            const hits = await detector.detect(videoRef.current);
            for (const hit of hits) {
              const code = parseQrPayload(hit.rawValue);
              if (code) {
                doneRef.current = true;
                stop();
                onDetect(code);
                return;
              }
            }
          } catch {
            /* frame belum siap — coba lagi di frame berikutnya */
          }
          rafRef.current = requestAnimationFrame(() => void tick());
        };
        rafRef.current = requestAnimationFrame(() => void tick());
      } catch {
        if (!cancelled) setPhase("denied");
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [onDetect, stop]);

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const code = parseQrPayload(manual);
    if (!code) {
      setManualError(t.notFound);
      return;
    }
    stop();
    onDetect(code);
  }

  const live = phase === "starting" || phase === "scanning";

  return (
    <div className="space-y-4">
      {live && (
        <div className="relative overflow-hidden rounded-2xl bg-bark">
          <video
            ref={videoRef}
            playsInline
            muted
            className="aspect-square w-full object-cover"
            aria-label={t.title}
          />
          {/* Bingkai bidik + sapuan pemindai (transform/opacity saja). */}
          <span aria-hidden className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-cream/70" />
          <span
            aria-hidden
            className="animate-qr-scan pointer-events-none absolute inset-x-10 top-10 h-8 rounded-full bg-gradient-to-b from-transparent via-lime/50 to-transparent"
          />
          {phase === "starting" && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-bark/70 text-sm text-cream">
              <Loader2 className="h-4 w-4 animate-spin" /> {t.starting}
            </div>
          )}
          <p className="absolute inset-x-0 bottom-0 bg-bark/70 px-3 py-2 text-center text-xs text-cream">{t.aim}</p>
        </div>
      )}

      {phase !== "scanning" && phase !== "starting" && (
        <div className="rounded-2xl border border-dashed border-line bg-cream/50 px-4 py-5 text-center">
          <ScanLine className="mx-auto h-7 w-7 text-faint" />
          <p className="mt-2 text-sm text-muted">{phase === "denied" ? t.denied : t.unsupported}</p>
        </div>
      )}

      <form onSubmit={submitManual} className="space-y-3">
        <Field label={t.manualLabel} hint={t.manualHint}>
          <Input
            value={manual}
            onChange={(e) => {
              setManual(e.target.value);
              setManualError(null);
            }}
            placeholder="INV-0001"
            autoCapitalize="characters"
            className="uppercase"
          />
        </Field>
        {manualError && <p className="text-xs font-medium text-clay">{manualError}</p>}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => {
              stop();
              onClose();
            }}
          >
            <X className="h-4 w-4" /> {t.close}
          </Button>
          <Button type="submit" className="flex-1" disabled={!manual.trim()}>
            {t.open}
          </Button>
        </div>
      </form>
    </div>
  );
}
