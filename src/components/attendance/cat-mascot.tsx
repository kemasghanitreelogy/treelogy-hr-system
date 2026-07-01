/**
 * Treelogy clock-in/out cat mascot — a chubby Pixar-ish sitting kitten, drawn as
 * a lightweight vector (gradients for the 3D look, no raster / no SVG filters, so
 * it stays tiny and cheap). Two tones (green / amber) and three expressions:
 *  - "happy"  → big sparkly eyes + :3 smile.
 *  - "late"   → worried brows + a sliding sweat drop (gentle, non-shaming).
 *  - "sleepy" → content closed eyes (clock-out, heading home).
 * Ears twitch, tail sways, and it gently "breathes" (motion in globals.css).
 */

const BROW = { happy: 0, late: -2, sleepy: 1 };

export function CatMascot({
  expression,
  tone,
  className,
}: {
  expression: "happy" | "late" | "sleepy";
  tone: "green" | "amber";
  className?: string;
}) {
  const late = expression === "late";
  const sleepy = expression === "sleepy";
  const amber = tone === "amber";

  const furLight = amber ? "#f7c977" : "#b7d178";
  const furBase = amber ? "#e79b3c" : "#7d9c57";
  const furDark = amber ? "#c67c26" : "#566f3d";
  const stripe = amber ? "#b76d1e" : "#46602f";
  const belly = amber ? "#fbeccb" : "#eef3d6";
  const innerEar = amber ? "#f3bda9" : "#cfe0b0";
  const u = `${expression}-${tone}`;

  return (
    <svg viewBox="0 0 120 140" className={className} role="img" aria-hidden fill="none">
      <defs>
        <radialGradient id={`head-${u}`} cx="42%" cy="30%" r="80%">
          <stop offset="0%" stopColor={furLight} />
          <stop offset="58%" stopColor={furBase} />
          <stop offset="100%" stopColor={furDark} />
        </radialGradient>
        <radialGradient id={`body-${u}`} cx="45%" cy="22%" r="90%">
          <stop offset="0%" stopColor={furLight} />
          <stop offset="60%" stopColor={furBase} />
          <stop offset="100%" stopColor={furDark} />
        </radialGradient>
        <linearGradient id={`tail-${u}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={furBase} />
          <stop offset="100%" stopColor={furDark} />
        </linearGradient>
        <radialGradient id={`eye-${u}`} cx="36%" cy="28%" r="85%">
          <stop offset="0%" stopColor="#6e4c2c" />
          <stop offset="55%" stopColor="#3a2413" />
          <stop offset="100%" stopColor="#1c1109" />
        </radialGradient>
      </defs>

      {/* Ground shadow */}
      <ellipse className="cat-shadow" cx="60" cy="134" rx="32" ry="6" fill="#26331e" />

      {/* Tail (behind body, sways) */}
      <g className="cat-tail">
        <path d="M84 114 C106 112 116 92 105 79 C99 72 90 76 93 85" stroke={`url(#tail-${u})`} strokeWidth="13" strokeLinecap="round" />
        <path d="M99 100 L108 103 M98 89 L106 90" stroke={stripe} strokeWidth="3" strokeLinecap="round" strokeOpacity="0.5" />
      </g>

      <g className="cat-body">
        {/* Body */}
        <path d="M60 60 C41 60 32 80 31 101 C30 122 43 134 60 134 C77 134 90 122 89 101 C88 80 79 60 60 60 Z" fill={`url(#body-${u})`} />
        {/* Belly */}
        <ellipse cx="60" cy="104" rx="19" ry="24" fill={belly} />
        {/* Body stripes */}
        <g stroke={stripe} strokeWidth="3.4" strokeLinecap="round" strokeOpacity="0.55" fill="none">
          <path d="M34 92 Q40 95 39 100" /><path d="M34 104 Q41 107 40 112" />
          <path d="M86 92 Q80 95 81 100" /><path d="M86 104 Q79 107 80 112" />
        </g>

        {/* Hind feet */}
        <ellipse cx="42" cy="131" rx="11" ry="7" fill={furBase} />
        <ellipse cx="78" cy="131" rx="11" ry="7" fill={furBase} />
        <g stroke={furDark} strokeWidth="1.4" strokeLinecap="round" strokeOpacity="0.6">
          <path d="M40 127 L40 131" /><path d="M44 127 L44 131" />
          <path d="M76 127 L76 131" /><path d="M80 127 L80 131" />
        </g>

        {/* Front paws, held together at the chest */}
        <ellipse cx="53" cy="97" rx="8" ry="15" fill={furBase} />
        <ellipse cx="67" cy="97" rx="8" ry="15" fill={furBase} />
        <ellipse cx="53" cy="84" rx="6.5" ry="5" fill={belly} />
        <ellipse cx="67" cy="84" rx="6.5" ry="5" fill={belly} />
        <g stroke={furDark} strokeWidth="1.3" strokeLinecap="round" strokeOpacity="0.6">
          <path d="M51 82 L51 86" /><path d="M55 82 L55 86" />
          <path d="M65 82 L65 86" /><path d="M69 82 L69 86" />
        </g>

        {/* Ears */}
        <g className="cat-ear-l">
          <path d="M32 26 L23 1 L56 20 Z" fill={`url(#head-${u})`} />
          <path d="M35 23 L28 8 L49 20 Z" fill={innerEar} />
        </g>
        <g className="cat-ear-r">
          <path d="M88 26 L97 1 L64 20 Z" fill={`url(#head-${u})`} />
          <path d="M85 23 L92 8 L71 20 Z" fill={innerEar} />
        </g>

        {/* Head */}
        <ellipse cx="60" cy="43" rx="38" ry="34" fill={`url(#head-${u})`} />
        {/* Cheek fluff */}
        <ellipse cx="25" cy="50" rx="7" ry="6" fill={furLight} />
        <ellipse cx="95" cy="50" rx="7" ry="6" fill={furLight} />
        {/* Gloss highlight */}
        <ellipse cx="44" cy="28" rx="15" ry="10" fill="#ffffff" fillOpacity="0.18" />

        {/* Forehead tabby "M" */}
        <g stroke={stripe} strokeWidth="2.4" strokeLinecap="round" strokeOpacity="0.75">
          <path d="M55 21 L53 8" /><path d="M60 22 L60 6" /><path d="M65 21 L67 8" />
        </g>

        {/* Blush */}
        <ellipse cx="33" cy="53" rx="6" ry="3.8" fill="#ef8fa6" fillOpacity="0.5" />
        <ellipse cx="87" cy="53" rx="6" ry="3.8" fill="#ef8fa6" fillOpacity="0.5" />

        {/* Eyebrows */}
        <g stroke={furDark} strokeWidth="3" strokeLinecap="round">
          <path d={`M38 ${27 + BROW[expression]} Q46 ${23 + BROW[expression]} 53 ${27 - (late ? 1 : 0)}`} />
          <path d={`M67 ${27 - (late ? 1 : 0)} Q74 ${23 + BROW[expression]} 82 ${27 + BROW[expression]}`} />
        </g>

        {/* Eyes */}
        {sleepy ? (
          <g stroke={furDark} strokeWidth="4.5" strokeLinecap="round">
            <path d="M37 45 Q46 53 55 45" />
            <path d="M65 45 Q74 53 83 45" />
          </g>
        ) : (
          <g>
            <ellipse cx="46" cy="45" rx="11" ry="13" fill={`url(#eye-${u})`} />
            <ellipse cx="74" cy="45" rx="11" ry="13" fill={`url(#eye-${u})`} />
            <circle cx="42" cy="40" r="4.4" fill="#fff" />
            <circle cx="70" cy="40" r="4.4" fill="#fff" />
            <circle cx="49" cy="49" r="2.2" fill="#fff" fillOpacity="0.85" />
            <circle cx="77" cy="49" r="2.2" fill="#fff" fillOpacity="0.85" />
          </g>
        )}

        {/* Whisker pads */}
        <ellipse cx="52" cy="60" rx="7" ry="5.5" fill={belly} fillOpacity="0.75" />
        <ellipse cx="68" cy="60" rx="7" ry="5.5" fill={belly} fillOpacity="0.75" />

        {/* Nose */}
        <path d="M56 55 Q60 53 64 55 Q62 60 60 61 Q58 60 56 55 Z" fill="#d9848c" />

        {/* Mouth */}
        {late ? (
          <ellipse cx="60" cy="64" rx="3.4" ry="4.4" fill="#7a3b40" />
        ) : sleepy ? (
          <path d="M54 62 Q60 66 66 62" stroke={furDark} strokeWidth="2.4" strokeLinecap="round" />
        ) : (
          <path d="M60 61 Q56 65 52 62 M60 61 Q64 65 68 62" stroke={furDark} strokeWidth="2.4" strokeLinecap="round" />
        )}

        {/* Whiskers */}
        <g stroke="#26331e" strokeOpacity="0.3" strokeWidth="1.3" strokeLinecap="round">
          <path d="M46 58 L30 55" /><path d="M46 62 L29 63" />
          <path d="M74 58 L90 55" /><path d="M74 62 L91 63" />
        </g>
      </g>

      {/* Sweat drop (late only) */}
      {late && (
        <path className="cat-sweat" d="M94 30 C90 36 90 41 94 41 C98 41 98 36 94 30 Z" fill="#8fbfe0" stroke="#4a7ba6" strokeWidth="0.6" />
      )}
    </svg>
  );
}

/** Tiny paw print for the celebratory confetti burst. */
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
