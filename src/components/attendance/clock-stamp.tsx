"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";

/**
 * One-shot clock-in feedback overlay. Color psychology drives the two states:
 *  - ON-TIME  → forest green (calm positive reinforcement) + a confident double ring.
 *  - LATE     → warm gold/amber (gentle, non-shaming caution — never alarm red) +
 *               a single softer ring and the minutes-late note.
 *
 * Motion is GPU-only (transform/opacity), plays once, and self-dismisses. It's
 * pointer-events-none so it never blocks the UI, and `prefers-reduced-motion`
 * (handled globally in globals.css) collapses the motion to an instant state.
 */

const STR = {
  id: {
    onTime: "Tepat waktu",
    late: (n: number) => `Telat ${n} menit`,
    clockedIn: "Absen masuk tercatat",
  },
  en: {
    onTime: "Right on time",
    late: (n: number) => `${n} min late`,
    clockedIn: "Clock-in recorded",
  },
} as const;

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
    const timer = setTimeout(onDone, late ? 1700 : 1500);
    return () => clearTimeout(timer);
  }, [late, onDone]);

  if (!mounted) return null;
  const t = STR[locale];
  const disc = late ? "bg-gold" : "bg-forest-600";
  const ring = late ? "border-gold/50" : "border-forest-500/50";

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center overflow-hidden px-6"
      role="status"
      aria-live="polite"
    >
      <div className={`absolute inset-0 animate-overlay ${late ? "bg-gold/10" : "bg-forest-700/10"}`} />

      <div className="relative flex flex-col items-center gap-4">
        <div className="relative flex h-24 w-24 items-center justify-center">
          {/* radiating ring(s) — confident double for on-time, one gentle for late */}
          <span className={`absolute h-24 w-24 rounded-full border-2 ${ring} animate-stamp-ring`} />
          {!late && (
            <span
              className={`absolute h-24 w-24 rounded-full border-2 ${ring} animate-stamp-ring`}
              style={{ animationDelay: "0.16s" }}
            />
          )}
          {/* badge */}
          <div className={`animate-pop-in flex h-24 w-24 items-center justify-center rounded-full ${disc} shadow-pop`}>
            {/* Dark tick on amber (caution chip = crisp on mobile); white on green. */}
            <Check className={`h-11 w-11 ${late ? "text-bark" : "text-cream"}`} strokeWidth={3} aria-hidden />
          </div>
        </div>

        <div className="fade-up flex flex-col items-center gap-1">
          <span className="rounded-full bg-panel/95 px-4 py-1.5 text-sm font-bold text-ink shadow-pop backdrop-blur-sm">
            {late ? t.late(lateMinutes) : t.onTime}
          </span>
          <span className="text-xs font-medium text-muted">{t.clockedIn}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
