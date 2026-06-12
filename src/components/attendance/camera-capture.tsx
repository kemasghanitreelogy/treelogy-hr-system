"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Check, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/layout/locale-context";
import type { Locale } from "@/lib/i18n";

const STR: Record<
  Locale,
  {
    defaultTitle: string;
    cameraError: string;
    close: string;
    capturedAlt: string;
    faceGuide: string;
    retake: string;
    usePhoto: string;
    takePhoto: string;
  }
> = {
  id: {
    defaultTitle: "Verifikasi Wajah",
    cameraError: "Kamera tidak dapat diakses. Izinkan akses kamera di browser.",
    close: "Tutup",
    capturedAlt: "Hasil foto",
    faceGuide: "Posisikan wajah di dalam bingkai",
    retake: "Ulangi",
    usePhoto: "Gunakan foto",
    takePhoto: "Ambil foto",
  },
  en: {
    defaultTitle: "Face Verification",
    cameraError: "Camera cannot be accessed. Allow camera access in your browser.",
    close: "Close",
    capturedAlt: "Captured photo",
    faceGuide: "Position your face inside the frame",
    retake: "Retake",
    usePhoto: "Use photo",
    takePhoto: "Take photo",
  },
};

/**
 * Selfie capture with a face-shaped oval guide.
 * Flow: live preview → Capture → review the still → Retake or Use.
 * NOTE: this only takes a photo — there is no face detection/recognition.
 */
export function CameraCapture({
  open,
  title,
  onCapture,
  onCancel,
}: {
  open: boolean;
  title?: string;
  onCapture: (dataUrl: string) => void;
  onCancel: () => void;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [captured, setCaptured] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    setReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setReady(true);
      }
    } catch {
      setError("camera_denied");
    }
  }, []);

  // Open the camera when the sheet opens; tear down on close.
  useEffect(() => {
    if (!open) return;
    setCaptured(null);
    startCamera();
    return () => stop();
  }, [open, startCamera, stop]);

  // Lock background scroll and hide the app chrome (topbar + bottom nav)
  // so the camera is the only thing on screen.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("camera-open");
    return () => {
      document.body.style.overflow = prev;
      document.body.classList.remove("camera-open");
    };
  }, [open]);

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const size = 480;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // center-crop square from the video feed
    const vw = video.videoWidth || size;
    const vh = video.videoHeight || size;
    const side = Math.min(vw, vh);
    const sx = (vw - side) / 2;
    const sy = (vh - side) / 2;
    // mirror horizontally so the selfie matches the preview
    ctx.translate(size, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, side, side, 0, 0, size, size);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    stop(); // freeze the still — stop the live feed
    setCaptured(dataUrl);
  }

  function retake() {
    setCaptured(null);
    startCamera();
  }

  function confirm() {
    if (captured) onCapture(captured);
  }

  function cancel() {
    stop();
    onCancel();
  }

  if (!open || typeof document === "undefined") return null;

  const reviewing = captured != null;

  // Portal to <body> so the overlay escapes any transformed ancestor
  // (e.g. the dashboard's `fade-up` wrapper, which would otherwise become
  // the containing block for this fixed element and clip it).
  return createPortal(
    <div className="fixed inset-x-0 top-0 z-[80] flex h-dvh-screen flex-col overflow-hidden bg-bark">
      {/* Header: title + close */}
      <div
        className="flex shrink-0 items-center justify-between px-4 py-3 text-cream"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <span className="font-display text-base font-semibold">{title ?? t.defaultTitle}</span>
        <button
          onClick={cancel}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-cream/70 hover:bg-forest-700/60"
          aria-label={t.close}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Frame */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {error ? (
          <div className="px-8 text-center text-cream">
            <Camera className="mx-auto h-10 w-10 text-cream/50" />
            <p className="mt-3 text-sm text-cream/80">{t.cameraError}</p>
            <Button variant="secondary" className="mt-5" onClick={cancel}>
              {t.close}
            </Button>
          </div>
        ) : reviewing ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={captured!} alt={t.capturedAlt} className="h-full w-full object-cover" />
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
            {/* Oval face guide overlay */}
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              preserveAspectRatio="xMidYMid slice"
              viewBox="0 0 100 100"
            >
              <defs>
                <mask id="faceMask">
                  <rect width="100" height="100" fill="white" />
                  <ellipse cx="50" cy="46" rx="26" ry="34" fill="black" />
                </mask>
              </defs>
              <rect width="100" height="100" fill="rgba(15,20,12,0.6)" mask="url(#faceMask)" />
              <ellipse
                cx="50"
                cy="46"
                rx="26"
                ry="34"
                fill="none"
                stroke={ready ? "#a4c26a" : "#8b9082"}
                strokeWidth="0.8"
                strokeDasharray="3 2"
              />
            </svg>
            <p className="absolute bottom-6 left-0 right-0 text-center text-sm text-cream/90">
              {t.faceGuide}
            </p>
          </>
        )}
      </div>

      {/* Controls */}
      {!error && (
        <div
          className="flex shrink-0 items-center justify-center gap-10 px-6 py-6"
          style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        >
          {reviewing ? (
            <>
              <ControlButton label={t.retake} onClick={retake}>
                <RotateCcw className="h-6 w-6" />
              </ControlButton>
              <button
                onClick={confirm}
                className="flex cursor-pointer items-center justify-center rounded-full bg-lime ring-4 ring-cream/20 transition active:scale-95"
                style={{ height: 72, width: 72 }}
                aria-label={t.usePhoto}
              >
                <Check className="h-8 w-8 text-bark" />
              </button>
              <span className="h-14 w-14" aria-hidden />
            </>
          ) : (
            <button
              onClick={capture}
              disabled={!ready}
              className="flex cursor-pointer items-center justify-center rounded-full bg-cream ring-4 ring-cream/30 transition active:scale-95 disabled:opacity-40"
              style={{ height: 76, width: 76 }}
              aria-label={t.takePhoto}
            >
              <span className="h-16 w-16 rounded-full border-[3px] border-bark" />
            </button>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex h-14 w-14 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-full bg-forest-800 text-cream/85 transition hover:bg-forest-700 active:scale-95"
      aria-label={label}
    >
      {children}
    </button>
  );
}
