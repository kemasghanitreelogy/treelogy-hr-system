"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

/**
 * One-shot clock-in mascot overlay — a small "world-class" celebratory moment.
 * Color psychology drives the two states:
 *  - ON-TIME → forest green, a happy cat + a playful paw burst (positive reinforcement).
 *  - LATE    → warm gold/amber, a startled-but-cute cat, no confetti (gentle,
 *              non-shaming — never alarm red).
 *
 * Shown on a dimmed, blurred scrim so it reads as one focused moment (no floating
 * over the card). Elements enter in a short stagger, the mascot springs with a
 * multi-bounce settle, it holds ~2s, then fades out. Everything is GPU-only
 * (transform/opacity), pointer-events-none (seamless — never blocks a tap), and
 * `prefers-reduced-motion` (handled globally in globals.css) collapses it to an
 * instant state.
 */

const STR = {
  id: {
    onTimeTitle: "Tepat waktu, cakep! 🐾",
    onTimeSub: "Meong~ absen masuk tercatat",
    lateTitle: (n: number) => `Telat ${n} menit 🐾`,
    lateSub: "Santai, kucing juga suka rebahan dulu",
  },
  en: {
    onTimeTitle: "Purrfect timing! 🐾",
    onTimeSub: "Meow~ clock-in recorded",
    lateTitle: (n: number) => `${n} min late 🐾`,
    lateSub: "No biggie — even cats oversleep",
  },
} as const;

/** Paw-burst trajectories (on-time only) — each flings to its own offset. */
const PAWS: { dx: string; dy: string; rot: string; delay: string }[] = [
  { dx: "-74px", dy: "-54px", rot: "-28deg", delay: "0.30s" },
  { dx: "74px", dy: "-54px", rot: "28deg", delay: "0.33s" },
  { dx: "-98px", dy: "8px", rot: "-16deg", delay: "0.31s" },
  { dx: "98px", dy: "8px", rot: "16deg", delay: "0.36s" },
  { dx: "-44px", dy: "-88px", rot: "-8deg", delay: "0.39s" },
  { dx: "44px", dy: "-88px", rot: "8deg", delay: "0.42s" },
];

export function ClockStamp({
  late,
  lateMinutes,
  locale,
  onDone,
}: {
  late: boolean;
  lateMinutes: number;
  locale: "id" | "en";
  onDone: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    // A light haptic tap — distinct pattern so late/on-time also *feel* different.
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(late ? [10, 40, 10] : 14);
      }
    } catch {
      /* vibrate unsupported — ignore */
    }
    // Hold ~1.7s, fade over the last 0.3s, unmount at 2s.
    const fade = setTimeout(() => setLeaving(true), 1700);
    const done = setTimeout(onDone, 2000);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
  }, [late, onDone]);

  if (!mounted) return null;
  const t = STR[locale];
  const halo = late ? "bg-gold-soft" : "bg-forest-100";
  const ring = late ? "border-gold/60" : "border-forest-400/60";
  const title = late ? "text-[#8a6512]" : "text-forest-700";

  return createPortal(
    <div
      className={`pointer-events-none fixed inset-0 z-[80] flex items-center justify-center overflow-hidden px-6 transition-opacity duration-300 ${leaving ? "opacity-0" : "opacity-100"}`}
      role="status"
      aria-live="polite"
    >
      <div className="absolute inset-0 animate-overlay bg-bark/45 backdrop-blur-sm" />

      <div className="animate-dialog relative flex max-w-xs flex-col items-center gap-2 rounded-3xl bg-panel px-8 py-7 text-center shadow-pop">
        <div className="relative mb-1 flex h-24 w-24 items-center justify-center">
          <span className={`absolute h-20 w-20 rounded-full ${halo}`} />
          <span className={`absolute h-20 w-20 rounded-full border-2 ${ring} animate-stamp-ring`} style={{ animationDelay: "0.16s" }} />
          {/* Paw burst radiating from the mascot (on-time only) */}
          {!late && (
            <div className="pointer-events-none absolute left-1/2 top-1/2">
              {PAWS.map((p, i) => (
                <span
                  key={i}
                  className="animate-paw absolute text-2xl leading-none"
                  style={{ "--dx": p.dx, "--dy": p.dy, "--rot": p.rot, animationDelay: p.delay } as CSSProperties}
                  aria-hidden
                >
                  🐾
                </span>
              ))}
            </div>
          )}
          <span className="animate-cat-bounce text-6xl leading-none" style={{ animationDelay: "0.1s" }} aria-hidden>
            {late ? "🙀" : "😸"}
          </span>
        </div>

        <p className={`fade-up font-display text-lg font-bold ${title}`} style={{ animationDelay: "0.22s" }}>
          {late ? t.lateTitle(lateMinutes) : t.onTimeTitle}
        </p>
        <p className="fade-up text-sm text-muted" style={{ animationDelay: "0.3s" }}>
          {late ? t.lateSub : t.onTimeSub}
        </p>
      </div>
    </div>,
    document.body,
  );
}
