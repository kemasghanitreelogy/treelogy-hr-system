"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Selfie capture with a face-shaped oval guide.
 * NOTE: this only takes a photo — there is no face detection/recognition.
 */
export function CameraCapture({
  open,
  title = "Verifikasi Wajah",
  onCapture,
  onCancel,
}: {
  open: boolean;
  title?: string;
  onCapture: (dataUrl: string) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setReady(false);

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch {
        setError("Kamera tidak dapat diakses. Izinkan akses kamera di browser.");
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [open, stop]);

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
    stop();
    onCapture(dataUrl);
  }

  function cancel() {
    stop();
    onCancel();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-bark">
      <div className="flex items-center justify-between px-4 py-3 text-cream">
        <span className="font-display text-base font-semibold">{title}</span>
        <button
          onClick={cancel}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-cream/70 hover:bg-forest-700/60"
          aria-label="Tutup"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {error ? (
          <div className="px-8 text-center text-cream">
            <Camera className="mx-auto h-10 w-10 text-cream/50" />
            <p className="mt-3 text-sm text-cream/80">{error}</p>
            <Button variant="secondary" className="mt-5" onClick={cancel}>
              Tutup
            </Button>
          </div>
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
            <svg className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" viewBox="0 0 100 100">
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
            <p className="absolute bottom-28 left-0 right-0 text-center text-sm text-cream/90">
              Posisikan wajah di dalam bingkai
            </p>
          </>
        )}
      </div>

      {!error && (
        <div className="flex items-center justify-center gap-6 px-6 py-7">
          <button
            onClick={cancel}
            className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-forest-800 text-cream/80 transition hover:bg-forest-700"
            aria-label="Batal"
          >
            <RotateCw className="h-5 w-5" />
          </button>
          <button
            onClick={capture}
            disabled={!ready}
            className="flex h-18 w-18 cursor-pointer items-center justify-center rounded-full bg-lime ring-4 ring-cream/20 transition active:scale-95 disabled:opacity-40"
            style={{ height: 72, width: 72 }}
            aria-label="Ambil foto"
          >
            <Camera className="h-7 w-7 text-bark" />
          </button>
          <span className="h-12 w-12" />
        </div>
      )}
    </div>
  );
}
