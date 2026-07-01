"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { CatMascot, PawPrint, Sparkle } from "@/components/attendance/cat-mascot";

/**
 * One-shot clock-in / clock-out mascot overlay — a small celebratory moment.
 * Four situations, driven by color psychology:
 *  - clock-in on-time   → happy green cat + paw/sparkle confetti (reinforcement).
 *  - clock-in late       → worried amber cat, no confetti (gentle, non-shaming).
 *  - clock-out normal    → content green cat waving off the day (calm).
 *  - clock-out overtime  → proud amber cat + confetti (celebrate the extra effort).
 *
 * On a dimmed, blurred scrim, staggered reveal, holds a clean 2s, then fades out.
 * GPU-only motion, pointer-events-none (seamless), reduced-motion safe.
 */

const STR = {
  id: {
    inOn: () => ({ t: "Tepat waktu, cakep! 🐾", s: "Meong~ absen masuk tercatat" }),
    inLate: (n: number) => ({ t: `Telat ${n} menit 🐾`, s: "Santai, kucing juga suka rebahan dulu" }),
    outNorm: () => ({ t: "Kerja bagus hari ini! 🐾", s: "Hati-hati di jalan, sampai besok~" }),
  },
  en: {
    inOn: () => ({ t: "Purrfect timing! 🐾", s: "Meow~ clock-in recorded" }),
    inLate: (n: number) => ({ t: `${n} min late 🐾`, s: "No biggie — even cats oversleep" }),
    outNorm: () => ({ t: "Great work today! 🐾", s: "Head home safe — see you tomorrow~" }),
  },
} as const;

/** Paw-burst trajectories (celebratory moments) — each flings to its own offset. */
const PAWS: { dx: string; dy: string; rot: string; delay: string }[] = [
  { dx: "-74px", dy: "-54px", rot: "-28deg", delay: "0.30s" },
  { dx: "74px", dy: "-54px", rot: "28deg", delay: "0.33s" },
  { dx: "-98px", dy: "8px", rot: "-16deg", delay: "0.31s" },
  { dx: "98px", dy: "8px", rot: "16deg", delay: "0.36s" },
  { dx: "-44px", dy: "-88px", rot: "-8deg", delay: "0.39s" },
  { dx: "44px", dy: "-88px", rot: "8deg", delay: "0.42s" },
];

/** Twinkling sparkles (celebratory moments) — staggered across the hold. */
const SPARKLES: { cls: string; size: string; color: string; delay: string }[] = [
  { cls: "-right-1 top-1", size: "h-4 w-4", color: "#e0a82e", delay: "0.45s" },
  { cls: "-left-1 top-1/2", size: "h-3 w-3", color: "#a4c26a", delay: "0.75s" },
  { cls: "bottom-1 right-2", size: "h-3.5 w-3.5", color: "#e0a82e", delay: "1.05s" },
];

export function ClockStamp({
  dir,
  flag,
  minutes,
  locale,
  onDone,
}: {
  /** "in" = clock-in, "out" = clock-out. */
  dir: "in" | "out";
  /** in → late; out → overtime. */
  flag: boolean;
  /** late minutes (in) or overtime minutes (out). */
  minutes: number;
  locale: "id" | "en";
  onDone: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Keep onDone current without re-running the timer — the parent widget
  // re-renders every second (ticking clock), which would otherwise reset the
  // dismiss timer and the overlay would never go away.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    setMounted(true);
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(flag ? [10, 40, 10] : 14);
      }
    } catch {
      /* vibrate unsupported — ignore */
    }
    const fade = setTimeout(() => setLeaving(true), 3800);
    const done = setTimeout(() => onDoneRef.current(), 4000);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
    // Mount-only: fixed 2s lifecycle, immune to parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mounted) return null;

  // Situation → mascot expression, tone, copy, and whether to celebrate.
  // Clock-out is always the same "heading home" moment (overtime included).
  const expression: "happy" | "late" | "sleepy" = dir === "out" ? "sleepy" : flag ? "late" : "happy";
  const tone: "green" | "amber" = dir === "out" ? "green" : flag ? "amber" : "green";
  const celebrate = dir === "in" && !flag; // only an on-time clock-in gets confetti
  const backpack = dir === "out";
  const c = STR[locale];
  const copy = dir === "out" ? c.outNorm() : flag ? c.inLate(minutes) : c.inOn();

  const glow = tone === "amber" ? "bg-gold-soft" : "bg-forest-100";
  const title = tone === "amber" ? "text-[#8a6512]" : "text-forest-700";

  return createPortal(
    <div
      className={`pointer-events-none fixed inset-0 z-[80] flex items-center justify-center overflow-hidden px-6 transition-opacity duration-200 ${leaving ? "opacity-0" : "opacity-100"}`}
      role="status"
      aria-live="polite"
    >
      <div className="absolute inset-0 animate-overlay bg-bark/45 backdrop-blur-sm" />

      <div className="animate-dialog relative flex max-w-xs flex-col items-center gap-2 rounded-3xl bg-panel px-8 py-7 text-center shadow-pop">
        <div className="relative mb-1 flex h-32 w-32 items-center justify-center">
          {/* Soft glow behind the head */}
          <span className={`absolute -top-1 h-20 w-20 rounded-full ${glow} opacity-70 blur-lg`} />
          {/* Paw burst radiating from the mascot (celebratory moments) */}
          {celebrate && (
            <div className="pointer-events-none absolute left-1/2 top-1/3">
              {PAWS.map((p, i) => (
                <span
                  key={i}
                  className="animate-paw absolute"
                  style={{ "--dx": p.dx, "--dy": p.dy, "--rot": p.rot, animationDelay: p.delay } as CSSProperties}
                >
                  <PawPrint className="h-5 w-5" color="#5f7e3e" />
                </span>
              ))}
            </div>
          )}
          <span className="animate-cat-bounce relative" style={{ animationDelay: "0.1s" }}>
            <CatMascot expression={expression} tone={tone} backpack={backpack} className="h-32 w-32" />
          </span>
          {/* Twinkling sparkles around the mascot (celebratory moments) */}
          {celebrate &&
            SPARKLES.map((s, i) => (
              <span key={i} className={`animate-sparkle absolute ${s.cls}`} style={{ animationDelay: s.delay }}>
                <Sparkle className={s.size} color={s.color} />
              </span>
            ))}
        </div>

        <p className={`fade-up font-display text-lg font-bold ${title}`} style={{ animationDelay: "0.22s" }}>
          {copy.t}
        </p>
        <p className="fade-up text-sm text-muted" style={{ animationDelay: "0.3s" }}>
          {copy.s}
        </p>
      </div>
    </div>,
    document.body,
  );
}
