/**
 * Treelogy clock-in cat mascot — a hand-drawn, softly-shaded SVG (no emoji) that
 * reads as a chubby 3D chibi cat. Two moods:
 *  - "happy" → forest-green cat, big glossy eyes + :3 mouth (on-time).
 *  - "late"  → warm amber cat, worried brows + a sliding sweat drop (gentle,
 *              non-shaming). Both twitch their ears, wag their tail, and gently
 *              "breathe" (motion lives in globals.css). Pure presentational.
 */

const BARK = "#26331e";
const BLUSH = "#ef8fa6";
const INNER_EAR = "#f4c7cf";

export function CatMascot({ mood, className }: { mood: "happy" | "late"; className?: string }) {
  const late = mood === "late";
  const light = late ? "#f6d074" : "#b3d074";
  const base = late ? "#e0a82e" : "#7d9c57";
  const dark = late ? "#b9841f" : "#587741";
  const u = mood; // unique gradient id suffix

  return (
    <svg viewBox="0 0 120 120" className={className} role="img" aria-hidden fill="none">
      <defs>
        <radialGradient id={`head-${u}`} cx="40%" cy="32%" r="78%">
          <stop offset="0%" stopColor={light} />
          <stop offset="55%" stopColor={base} />
          <stop offset="100%" stopColor={dark} />
        </radialGradient>
        <linearGradient id={`tail-${u}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={base} />
          <stop offset="100%" stopColor={dark} />
        </linearGradient>
        <radialGradient id={`eye-${u}`} cx="38%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#5a5250" />
          <stop offset="60%" stopColor="#241f1e" />
          <stop offset="100%" stopColor="#100c0c" />
        </radialGradient>
      </defs>

      {/* Ground shadow (squashes with the breathing bob) */}
      <ellipse className="cat-shadow" cx="60" cy="110" rx="30" ry="6" fill={BARK} />

      {/* Tail (behind the body, wags) */}
      <path className="cat-tail" d="M84 94 Q114 88 104 58" stroke={`url(#tail-${u})`} strokeWidth="11" strokeLinecap="round" />

      <g className="cat-body">
        {/* Ears */}
        <g className="cat-ear-l">
          <path d="M34 46 L26 12 L58 36 Z" fill={`url(#head-${u})`} />
          <path d="M37 42 L31 21 L50 35 Z" fill={INNER_EAR} />
        </g>
        <g className="cat-ear-r">
          <path d="M86 46 L94 12 L62 36 Z" fill={`url(#head-${u})`} />
          <path d="M83 42 L89 21 L70 35 Z" fill={INNER_EAR} />
        </g>

        {/* Brand leaf sprout */}
        <path d="M60 32 C56 22 62 15 71 16 C71 25 66 32 60 32 Z" fill={dark} />

        {/* Head */}
        <ellipse cx="60" cy="62" rx="38" ry="35" fill={`url(#head-${u})`} />
        {/* Top-left gloss highlight → the 3D pop */}
        <ellipse cx="45" cy="46" rx="16" ry="12" fill="#ffffff" fillOpacity="0.22" />

        {/* Whiskers */}
        <g stroke={BARK} strokeOpacity="0.38" strokeWidth="1.6" strokeLinecap="round">
          <path d="M42 66 L24 62" /><path d="M42 70 L22 70" /><path d="M42 74 L24 78" />
          <path d="M78 66 L96 62" /><path d="M78 70 L98 70" /><path d="M78 74 L96 78" />
        </g>

        {/* Blush */}
        <ellipse cx="36" cy="72" rx="6.5" ry="4.2" fill={BLUSH} fillOpacity="0.6" />
        <ellipse cx="84" cy="72" rx="6.5" ry="4.2" fill={BLUSH} fillOpacity="0.6" />

        {/* Worried brows (late only) */}
        {late && (
          <g stroke={BARK} strokeWidth="2.6" strokeLinecap="round">
            <path d="M39 49 Q47 46 53 50" />
            <path d="M67 50 Q73 46 81 49" />
          </g>
        )}

        {/* Big glossy eyes */}
        <g>
          <ellipse cx="46" cy={late ? "61" : "60"} rx="7.6" ry="9.4" fill={`url(#eye-${u})`} />
          <ellipse cx="74" cy={late ? "61" : "60"} rx="7.6" ry="9.4" fill={`url(#eye-${u})`} />
          {/* catchlights */}
          <circle cx="43.5" cy={late ? "57.5" : "56.5"} r="2.9" fill="#fff" />
          <circle cx="71.5" cy={late ? "57.5" : "56.5"} r="2.9" fill="#fff" />
          <circle cx="48" cy={late ? "63.5" : "62.5"} r="1.5" fill="#fff" fillOpacity="0.85" />
          <circle cx="76" cy={late ? "63.5" : "62.5"} r="1.5" fill="#fff" fillOpacity="0.85" />
        </g>

        {/* Nose */}
        <path d="M56.5 67 L63.5 67 L60 71.5 Z" fill="#c06774" />

        {/* Mouth */}
        {late ? (
          <ellipse cx="60" cy="77" rx="4.2" ry="5.2" fill="#7a3b40" />
        ) : (
          <path d="M60 72 Q55 78.5 50.5 74 M60 72 Q65 78.5 69.5 74" stroke={BARK} strokeWidth="3" strokeLinecap="round" />
        )}
      </g>

      {/* Sweat drop (late only) */}
      {late && (
        <path className="cat-sweat" d="M90 40 C86 46 86 51 90 51 C94 51 94 46 90 40 Z" fill="#8fbfe0" stroke="#4a7ba6" strokeWidth="0.6" />
      )}
    </svg>
  );
}

/** Tiny paw print for the on-time confetti burst. */
export function PawPrint({ className, color = "#5f7e3e" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={color} aria-hidden>
      <ellipse cx="12" cy="16" rx="6" ry="5" />
      <circle cx="5.5" cy="9.5" r="2.3" />
      <circle cx="10" cy="6" r="2.3" />
      <circle cx="14" cy="6" r="2.3" />
      <circle cx="18.5" cy="9.5" r="2.3" />
    </svg>
  );
}

/** Four-point sparkle for the on-time twinkle. */
export function Sparkle({ className, color = "#e0a82e" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={color} aria-hidden>
      <path d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z" />
    </svg>
  );
}
