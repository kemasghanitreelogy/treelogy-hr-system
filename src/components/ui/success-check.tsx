import { cn } from "@/lib/utils";

/**
 * Animated success checkmark — the ring draws first, then the tick.
 * Inherits color via `currentColor`. Honors prefers-reduced-motion
 * (durations are globally clamped in globals.css).
 */
export function SuccessCheck({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 52 52" fill="none" className={cn("h-12 w-12", className)} aria-hidden>
      <circle
        cx="26"
        cy="26"
        r="24"
        stroke="currentColor"
        strokeWidth="2.5"
        style={{
          strokeDasharray: 151,
          strokeDashoffset: 151,
          animation: "draw-stroke 0.5s ease-out forwards",
        }}
      />
      <path
        d="M15 26.5l7.5 7.5L37 19"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 40,
          strokeDashoffset: 40,
          animation: "draw-stroke 0.34s 0.42s ease-out forwards",
        }}
      />
    </svg>
  );
}
