/**
 * Treelogy clock mascot — a semi-realistic, richly-shaded sitting kitten drawn as
 * a lightweight vector (layered gradients + soft ambient-occlusion overlays + fur
 * tufts for dimension; no raster, no SVG blur filters, so it stays tiny/cheap).
 * Two tones (green / amber) × three expressions (happy / late / sleepy).
 * Ears twitch, tail sways, and it gently breathes (motion lives in globals.css).
 */

export function CatMascot({
  expression,
  tone,
  backpack = false,
  className,
}: {
  expression: "happy" | "late" | "sleepy";
  tone: "green" | "amber";
  /** Show a little backpack — "heading home" (clock-out). */
  backpack?: boolean;
  className?: string;
}) {
  const late = expression === "late";
  const sleepy = expression === "sleepy";
  const amber = tone === "amber";

  const c = amber
    ? { light: "#f4c574", base: "#e2963a", dark: "#bd7420", shade: "#9a5713", stripe: "#a25e18", cream: "#fbeed0", creamSh: "#eccf9d", inner: "#e7a288", iris: "#8fae4e" }
    : { light: "#b9d27a", base: "#7d9c57", dark: "#556d3c", shade: "#3f5330", stripe: "#42592c", cream: "#eef3d6", creamSh: "#d5deb4", inner: "#cfe0b0", iris: "#d1a33f" };
  const u = `${expression}-${tone}`;

  return (
    <svg viewBox="0 0 120 144" className={className} role="img" aria-hidden fill="none">
      <defs>
        <radialGradient id={`head-${u}`} cx="40%" cy="26%" r="82%">
          <stop offset="0%" stopColor={c.light} />
          <stop offset="52%" stopColor={c.base} />
          <stop offset="88%" stopColor={c.dark} />
          <stop offset="100%" stopColor={c.shade} />
        </radialGradient>
        <radialGradient id={`body-${u}`} cx="46%" cy="16%" r="94%">
          <stop offset="0%" stopColor={c.light} />
          <stop offset="55%" stopColor={c.base} />
          <stop offset="92%" stopColor={c.dark} />
          <stop offset="100%" stopColor={c.shade} />
        </radialGradient>
        <radialGradient id={`belly-${u}`} cx="50%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#fffaf0" />
          <stop offset="55%" stopColor={c.cream} />
          <stop offset="100%" stopColor={c.creamSh} />
        </radialGradient>
        <linearGradient id={`tail-${u}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={c.base} />
          <stop offset="100%" stopColor={c.shade} />
        </linearGradient>
        <radialGradient id={`ear-${u}`} cx="50%" cy="90%" r="80%">
          <stop offset="0%" stopColor={c.inner} />
          <stop offset="100%" stopColor={c.dark} />
        </radialGradient>
        <radialGradient id={`iris-${u}`} cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor={c.iris} />
          <stop offset="70%" stopColor={amber ? "#5f7a30" : "#a97f24"} />
          <stop offset="100%" stopColor="#2e3a16" />
        </radialGradient>
      </defs>

      {/* Ground shadow */}
      <ellipse className="cat-shadow" cx="60" cy="138" rx="33" ry="6" fill="#26331e" opacity="0.16" />

      {/* Tail (behind body, sways) */}
      <g className="cat-tail">
        <path d="M84 116 C107 114 118 92 106 78 C99 70 89 74 92 84" stroke={`url(#tail-${u})`} strokeWidth="14" strokeLinecap="round" />
        <path d="M101 101 L110 104 M99 90 L108 91 M96 111 L104 116" stroke={c.stripe} strokeWidth="3.2" strokeLinecap="round" strokeOpacity="0.5" />
        <circle cx="93" cy="84" r="6.5" fill={c.shade} opacity="0.5" />
      </g>

      <g className="cat-body">
        {/* Backpack peeking behind the body (clock-out) */}
        {backpack && (
          <g>
            <rect x="14" y="82" width="24" height="34" rx="9" fill="#c85536" />
            <rect x="17" y="88" width="15" height="16" rx="5" fill="#e0805f" />
            <path d="M20 82 Q26 78 32 82" stroke="#a84327" strokeWidth="3" fill="none" strokeLinecap="round" />
          </g>
        )}
        {/* Body */}
        <path d="M60 58 C40 58 31 79 30 101 C29 123 42 136 60 136 C78 136 91 123 90 101 C89 79 80 58 60 58 Z" fill={`url(#body-${u})`} />
        {/* Chest/belly fluff */}
        <path d="M60 74 C49 74 43 88 43 104 C43 122 50 132 60 132 C70 132 77 122 77 104 C77 88 71 74 60 74 Z" fill={`url(#belly-${u})`} />
        {/* Backpack shoulder straps over the chest (clock-out) */}
        {backpack && (
          <g>
            <path d="M45 70 Q46 90 49 110" stroke="#c85536" strokeWidth="6" strokeLinecap="round" fill="none" />
            <path d="M75 70 Q74 90 71 110" stroke="#c85536" strokeWidth="6" strokeLinecap="round" fill="none" />
            <path d="M45 70 Q46 88 48 104" stroke="#ffffff" strokeOpacity="0.2" strokeWidth="2" fill="none" />
            <rect x="45" y="89" width="7" height="5" rx="1.5" fill="#f2e2b0" />
            <rect x="68" y="89" width="7" height="5" rx="1.5" fill="#f2e2b0" />
          </g>
        )}
        {/* Body stripes (soft) */}
        <g stroke={c.stripe} strokeWidth="3.6" strokeLinecap="round" strokeOpacity="0.4" fill="none">
          <path d="M35 90 Q41 94 40 99" /><path d="M34 104 Q41 108 40 113" /><path d="M36 118 Q42 121 41 125" />
          <path d="M85 90 Q79 94 80 99" /><path d="M86 104 Q79 108 80 113" /><path d="M84 118 Q78 121 79 125" />
        </g>

        {/* Hind feet */}
        <ellipse cx="43" cy="132" rx="11" ry="7" fill={c.base} />
        <ellipse cx="77" cy="132" rx="11" ry="7" fill={c.base} />
        <path d="M43 132 a11 7 0 0 0 -11 0 Z" fill={c.shade} opacity="0.25" />
        <g stroke={c.shade} strokeWidth="1.3" strokeLinecap="round" strokeOpacity="0.55">
          <path d="M41 128 L41 132" /><path d="M45 128 L45 132" />
          <path d="M75 128 L75 132" /><path d="M79 128 L79 132" />
        </g>

        {/* Front paws held together at the chest */}
        <ellipse cx="53" cy="98" rx="8.2" ry="15" fill={c.base} />
        <ellipse cx="67" cy="98" rx="8.2" ry="15" fill={c.base} />
        <path d="M53 98 m-8 0 a8 15 0 0 0 16 0 Z" fill={c.shade} opacity="0.18" />
        <ellipse cx="53" cy="85" rx="6.6" ry="5" fill={`url(#belly-${u})`} />
        <ellipse cx="67" cy="85" rx="6.6" ry="5" fill={`url(#belly-${u})`} />
        <g stroke={c.shade} strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.5">
          <path d="M51 83 L51 87" /><path d="M55 83 L55 87" />
          <path d="M65 83 L65 87" /><path d="M69 83 L69 87" />
        </g>

        {/* Ears */}
        <g className="cat-ear-l">
          <path d="M31 27 L22 0 L57 20 Z" fill={`url(#head-${u})`} />
          <path d="M35 24 L28 8 L50 20 Z" fill={`url(#ear-${u})`} />
        </g>
        <g className="cat-ear-r">
          <path d="M89 27 L98 0 L63 20 Z" fill={`url(#head-${u})`} />
          <path d="M85 24 L92 8 L70 20 Z" fill={`url(#ear-${u})`} />
        </g>

        {/* Head */}
        <ellipse cx="60" cy="43" rx="39" ry="35" fill={`url(#head-${u})`} />
        {/* Ambient occlusion where head meets body + under chin */}
        <path d="M32 66 Q60 84 88 66 Q60 96 32 66 Z" fill={c.shade} opacity="0.20" />
        {/* Top rim light */}
        <path d="M34 22 Q60 8 86 22" stroke="#ffffff" strokeOpacity="0.28" strokeWidth="4" strokeLinecap="round" />

        {/* Forehead tabby "M" */}
        <g stroke={c.stripe} strokeWidth="2.3" strokeLinecap="round" strokeOpacity="0.7">
          <path d="M55 20 L53 7" /><path d="M60 21 L60 5" /><path d="M65 20 L67 7" />
          <path d="M49 24 L45 15" /><path d="M71 24 L75 15" />
        </g>

        {/* Blush */}
        <ellipse cx="32" cy="53" rx="6" ry="3.6" fill="#ef8fa6" fillOpacity="0.45" />
        <ellipse cx="88" cy="53" rx="6" ry="3.6" fill="#ef8fa6" fillOpacity="0.45" />

        {/* Eyebrows — thin, subtle fur marks */}
        <g stroke={c.stripe} strokeWidth="1.8" strokeLinecap="round" strokeOpacity="0.75">
          {late ? (
            <>
              <path d="M39 28 Q46 24 52 29" />
              <path d="M68 29 Q74 24 81 28" />
            </>
          ) : (
            <>
              <path d="M40 29 Q46 26 52 29" />
              <path d="M68 29 Q74 26 80 29" />
            </>
          )}
        </g>

        {/* Eyes */}
        {sleepy ? (
          <g stroke={c.dark} strokeWidth="4.5" strokeLinecap="round">
            <path d="M37 45 Q46 53 55 45" />
            <path d="M65 45 Q74 53 83 45" />
          </g>
        ) : (
          <g>
            {/* sclera / eye socket shadow */}
            <ellipse cx="46" cy="45" rx="11.5" ry="13.5" fill="#fff" />
            <ellipse cx="74" cy="45" rx="11.5" ry="13.5" fill="#fff" />
            {/* iris */}
            <circle cx="46" cy="46" r="10.5" fill={`url(#iris-${u})`} />
            <circle cx="74" cy="46" r="10.5" fill={`url(#iris-${u})`} />
            {/* pupil */}
            <ellipse cx="46" cy="46" rx="6" ry="8.5" fill="#140d07" />
            <ellipse cx="74" cy="46" rx="6" ry="8.5" fill="#140d07" />
            {/* upper-lid shadow */}
            <path d="M35 40 A11.5 13.5 0 0 1 57 40 A11.5 8 0 0 0 35 40 Z" fill="#000" opacity="0.16" />
            <path d="M63 40 A11.5 13.5 0 0 1 85 40 A11.5 8 0 0 0 63 40 Z" fill="#000" opacity="0.16" />
            {/* catchlights */}
            <circle cx="42.5" cy="41" r="3.4" fill="#fff" />
            <circle cx="70.5" cy="41" r="3.4" fill="#fff" />
            <circle cx="49" cy="50" r="1.8" fill="#fff" fillOpacity="0.7" />
            <circle cx="77" cy="50" r="1.8" fill="#fff" fillOpacity="0.7" />
          </g>
        )}

        {/* Muzzle */}
        <ellipse cx="52" cy="60" rx="7.5" ry="6" fill={`url(#belly-${u})`} fillOpacity="0.9" />
        <ellipse cx="68" cy="60" rx="7.5" ry="6" fill={`url(#belly-${u})`} fillOpacity="0.9" />
        {/* Nose */}
        <path d="M55.5 54.5 Q60 52.5 64.5 54.5 Q62 60 60 61 Q58 60 55.5 54.5 Z" fill="#cf7d84" />
        <path d="M57 56 Q60 54.5 63 56" stroke="#fff" strokeOpacity="0.5" strokeWidth="1" strokeLinecap="round" />

        {/* Mouth */}
        {late ? (
          <ellipse cx="60" cy="65" rx="3.3" ry="4.3" fill="#7a3b40" />
        ) : sleepy ? (
          <path d="M54 62 Q60 66 66 62" stroke={c.dark} strokeWidth="2.3" strokeLinecap="round" />
        ) : (
          <path d="M60 61 Q56 65.5 52 62 M60 61 Q64 65.5 68 62" stroke={c.dark} strokeWidth="2.3" strokeLinecap="round" />
        )}

        {/* Whiskers */}
        <g stroke="#3a2a16" strokeOpacity="0.32" strokeWidth="1.2" strokeLinecap="round">
          <path d="M45 58 Q34 56 28 54" /><path d="M45 61 Q33 62 27 63" />
          <path d="M75 58 Q86 56 92 54" /><path d="M75 61 Q87 62 93 63" />
        </g>
      </g>

      {/* Sweat drop (late only) */}
      {late && (
        <path className="cat-sweat" d="M95 30 C91 36 91 41 95 41 C99 41 99 36 95 30 Z" fill="#8fbfe0" stroke="#4a7ba6" strokeWidth="0.6" />
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
