/**
 * Treelogy clock mascot — a charming, semi-realistic sitting kitten drawn as a
 * lightweight vector (layered gradients + soft shading; no raster, no SVG blur
 * filters). Life comes from a slight head tilt (line-of-action), a converging
 * gaze, and forelegs that actually connect the shoulders to the paws. Two tones
 * (green / amber) × three expressions (happy / late / sleepy). Ears twitch, tail
 * sways, and it gently breathes (motion in globals.css).
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
    ? { light: "#f7cd84", base: "#e2963a", dark: "#bd7420", shade: "#96530f", stripe: "#a25e18", cream: "#fbeed0", creamSh: "#e6c793", inner: "#e7a288", iris1: "#b6cd6f", iris2: "#7a9a3f", iris3: "#33421a", furL: "#f9d791", furD: "#c8801f" }
    : { light: "#bdd47e", base: "#7d9c57", dark: "#556d3c", shade: "#37481f", stripe: "#42592c", cream: "#eef3d6", creamSh: "#d5deb4", inner: "#cfe0b0", iris1: "#e6c25f", iris2: "#c08f2b", iris3: "#4a3410", furL: "#cbe08c", furD: "#5f7a3c" };
  const u = `${expression}-${tone}`;
  const tilt = late ? -6 : -8;

  return (
    <svg viewBox="0 0 120 144" className={className} role="img" aria-hidden fill="none">
      <defs>
        <radialGradient id={`head-${u}`} cx="38%" cy="24%" r="84%">
          <stop offset="0%" stopColor={c.light} />
          <stop offset="50%" stopColor={c.base} />
          <stop offset="86%" stopColor={c.dark} />
          <stop offset="100%" stopColor={c.shade} />
        </radialGradient>
        <radialGradient id={`body-${u}`} cx="44%" cy="14%" r="96%">
          <stop offset="0%" stopColor={c.light} />
          <stop offset="55%" stopColor={c.base} />
          <stop offset="92%" stopColor={c.dark} />
          <stop offset="100%" stopColor={c.shade} />
        </radialGradient>
        <radialGradient id={`belly-${u}`} cx="50%" cy="26%" r="82%">
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
        <radialGradient id={`iris-${u}`} cx="50%" cy="38%" r="62%">
          <stop offset="0%" stopColor={c.iris1} />
          <stop offset="55%" stopColor={c.iris2} />
          <stop offset="100%" stopColor={c.iris3} />
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
        {/* Backpack behind the body (clock-out) */}
        {backpack && (
          <g>
            <rect x="12" y="82" width="24" height="34" rx="9" fill="#c85536" />
            <rect x="15" y="88" width="15" height="16" rx="5" fill="#e0805f" />
            <path d="M18 82 Q24 78 30 82" stroke="#a84327" strokeWidth="3" fill="none" strokeLinecap="round" />
          </g>
        )}

        {/* Body + belly */}
        <path d="M60 58 C40 58 31 79 30 101 C29 123 42 136 60 136 C78 136 91 123 90 101 C89 79 80 58 60 58 Z" fill={`url(#body-${u})`} />
        <path d="M60 74 C49 74 43 88 43 104 C43 122 50 132 60 132 C70 132 77 122 77 104 C77 88 71 74 60 74 Z" fill={`url(#belly-${u})`} />
        <g stroke={c.stripe} strokeWidth="3.6" strokeLinecap="round" strokeOpacity="0.38" fill="none">
          <path d="M35 90 Q41 94 40 99" /><path d="M34 104 Q41 108 40 113" />
          <path d="M85 90 Q79 94 80 99" /><path d="M86 104 Q79 108 80 113" />
        </g>

        {/* Hind feet */}
        <ellipse cx="43" cy="132" rx="11" ry="7" fill={c.base} />
        <ellipse cx="77" cy="132" rx="11" ry="7" fill={c.base} />

        {/* Forelegs + paws — a distinct pose per emotion (posing to the feeling) */}
        {expression === "happy" && (
          <g>
            {/* eager: both paws raised together near the chin */}
            <path d="M45 76 Q40 94 54 86" stroke={c.base} strokeWidth="14" strokeLinecap="round" />
            <path d="M75 76 Q80 94 66 86" stroke={c.base} strokeWidth="14" strokeLinecap="round" />
            <Paw cx={54} cy={86} u={u} />
            <Paw cx={66} cy={86} u={u} />
          </g>
        )}
        {late && (
          <g>
            {/* timid: one paw hangs low, the other fidgets at the chest */}
            <path d="M47 76 Q42 98 47 114" stroke={c.base} strokeWidth="14" strokeLinecap="round" />
            <path d="M74 76 Q80 92 69 103" stroke={c.base} strokeWidth="14" strokeLinecap="round" />
            <Paw cx={47} cy={116} u={u} />
            <Paw cx={69} cy={105} u={u} />
          </g>
        )}
        {sleepy && (
          <g>
            {/* heading home: one paw resting, the other waves (drawn after the head) */}
            <path d="M46 76 Q42 96 50 110" stroke={c.base} strokeWidth="14" strokeLinecap="round" />
            <Paw cx={50} cy={112} u={u} />
          </g>
        )}

        {/* Backpack shoulder straps over the chest (clock-out) */}
        {backpack && (
          <g>
            <path d="M50 74 Q50 60 45 52" stroke="#c85536" strokeWidth="6" strokeLinecap="round" fill="none" />
            <path d="M70 74 Q70 60 75 52" stroke="#c85536" strokeWidth="6" strokeLinecap="round" fill="none" />
            <rect x="47" y="86" width="7" height="5" rx="1.5" fill="#f2e2b0" />
            <rect x="66" y="86" width="7" height="5" rx="1.5" fill="#f2e2b0" />
          </g>
        )}

        {/* Cast shadow from the head onto the chest */}
        <ellipse cx="60" cy="74" rx="26" ry="9" fill={c.shade} opacity="0.16" />

        {/* HEAD (slight tilt for life) */}
        <g transform={`rotate(${tilt} 60 72)`}>
          {/* Fluffy cheek floof peeking from behind the head */}
          <g fill={`url(#head-${u})`}>
            <ellipse cx="23" cy="57" rx="6.5" ry="5.5" /><ellipse cx="24" cy="66" rx="6.5" ry="5.5" /><ellipse cx="28" cy="73" rx="6.5" ry="5.5" />
            <ellipse cx="97" cy="57" rx="6.5" ry="5.5" /><ellipse cx="96" cy="66" rx="6.5" ry="5.5" /><ellipse cx="92" cy="73" rx="6.5" ry="5.5" />
          </g>
          <g className="cat-ear-l">
            <path d="M31 27 L20 -2 L57 19 Z" fill={`url(#head-${u})`} />
            <path d="M35 24 L27 7 L50 19 Z" fill={`url(#ear-${u})`} />
          </g>
          <g className="cat-ear-r">
            <path d="M89 26 L99 -3 L63 18 Z" fill={`url(#head-${u})`} />
            <path d="M85 23 L93 6 L70 18 Z" fill={`url(#ear-${u})`} />
          </g>

          {/* Rounder head (fuller cheeks) */}
          <path d="M60 8 C34 8 21 24 21 44 C21 58 29 69 41 74 C50 78 70 78 79 74 C91 69 99 58 99 44 C99 24 86 8 60 8 Z" fill={`url(#head-${u})`} />
          <path d="M28 60 Q60 82 92 60 Q60 74 28 60 Z" fill={c.shade} opacity="0.16" />
          <path d="M33 20 Q60 6 87 20" stroke="#ffffff" strokeOpacity="0.30" strokeWidth="4" strokeLinecap="round" />
          {/* Soft fur strokes (rim + cheeks) for texture */}
          <g stroke={c.furD} strokeLinecap="round" fill="none" strokeOpacity="0.35">
            <path d="M26 40 Q23 34 24 29" strokeWidth="2.2" /><path d="M31 30 Q29 24 31 20" strokeWidth="2" />
            <path d="M90 38 Q94 32 92 27" strokeWidth="2.2" /><path d="M86 28 Q88 22 86 18" strokeWidth="2" />
            <path d="M24 58 Q18 60 16 58" strokeWidth="2.4" /><path d="M25 65 Q19 68 17 66" strokeWidth="2.4" /><path d="M27 71 Q22 75 20 73" strokeWidth="2.2" />
            <path d="M96 58 Q102 60 104 58" strokeWidth="2.4" /><path d="M95 65 Q101 68 103 66" strokeWidth="2.4" /><path d="M93 71 Q98 75 100 73" strokeWidth="2.2" />
          </g>

          {/* Forehead tabby "M" */}
          <g stroke={c.stripe} strokeWidth="2.2" strokeLinecap="round" strokeOpacity="0.7">
            <path d="M55 19 L53 6" /><path d="M60 20 L60 4" /><path d="M65 19 L67 6" />
            <path d="M49 23 L45 14" /><path d="M71 23 L75 14" />
          </g>

          {/* Blush */}
          <ellipse cx="33" cy="52" rx="6.5" ry="4" fill="#ef8fa6" fillOpacity="0.42" />
          <ellipse cx="87" cy="52" rx="6.5" ry="4" fill="#ef8fa6" fillOpacity="0.42" />

          {/* Eyebrows */}
          <g stroke={c.stripe} strokeWidth="1.7" strokeLinecap="round" strokeOpacity="0.7">
            {late ? (
              <>
                <path d="M39 27 Q46 23 52 28" />
                <path d="M68 28 Q74 23 81 27" />
              </>
            ) : (
              <>
                <path d="M39 28 Q46 24 52 28" />
                <path d="M68 28 Q74 24 81 28" />
              </>
            )}
          </g>

          {/* Eyes */}
          {sleepy ? (
            <g stroke={c.dark} strokeWidth="4.5" strokeLinecap="round">
              <path d="M35 44 Q45.5 52 56 44" />
              <path d="M64 44 Q74.5 52 85 44" />
            </g>
          ) : (
            <g>
              <ellipse cx="45" cy="43" rx="13" ry="15.5" fill="#fff" />
              <ellipse cx="75" cy="43" rx="13" ry="15.5" fill="#fff" />
              <circle cx="47.5" cy="44" r="11.8" fill={`url(#iris-${u})`} />
              <circle cx="72.5" cy="44" r="11.8" fill={`url(#iris-${u})`} />
              <circle cx="47.5" cy="44" r="11.8" fill="none" stroke={c.iris1} strokeWidth="1.4" strokeOpacity="0.6" />
              <circle cx="72.5" cy="44" r="11.8" fill="none" stroke={c.iris1} strokeWidth="1.4" strokeOpacity="0.6" />
              <ellipse cx="48.5" cy="44" rx="6.4" ry="9.4" fill="#0e0904" />
              <ellipse cx="71.5" cy="44" rx="6.4" ry="9.4" fill="#0e0904" />
              <path d="M32 36 A13 15.5 0 0 1 58 36 A13 9 0 0 0 32 36 Z" fill="#000" opacity="0.20" />
              <path d="M62 36 A13 15.5 0 0 1 88 36 A13 9 0 0 0 62 36 Z" fill="#000" opacity="0.20" />
              <circle cx="42.5" cy="38" r="4.6" fill="#fff" />
              <circle cx="68" cy="38" r="4.6" fill="#fff" />
              <circle cx="51.5" cy="49.5" r="2.4" fill="#fff" fillOpacity="0.85" />
              <circle cx="76.5" cy="49.5" r="2.4" fill="#fff" fillOpacity="0.85" />
              <path d="M40 33 l1.2 2.4 2.4 1.2 -2.4 1.2 -1.2 2.4 -1.2 -2.4 -2.4 -1.2 2.4 -1.2 z" fill="#fff" fillOpacity="0.9" />
            </g>
          )}

          {/* Muzzle */}
          <ellipse cx="52" cy="60" rx="8" ry="6.4" fill={`url(#belly-${u})`} fillOpacity="0.95" />
          <ellipse cx="68" cy="60" rx="8" ry="6.4" fill={`url(#belly-${u})`} fillOpacity="0.95" />
          <g fill="#b98a55" fillOpacity="0.6">
            <circle cx="49" cy="58" r="0.9" /><circle cx="53" cy="59" r="0.9" />
            <circle cx="67" cy="59" r="0.9" /><circle cx="71" cy="58" r="0.9" />
          </g>
          {/* Nose */}
          <path d="M55 53.5 Q60 51 65 53.5 Q62 59.5 60 60.5 Q58 59.5 55 53.5 Z" fill="#d98a90" />
          <path d="M57.5 55 Q60 53.5 62.5 55" stroke="#fff" strokeOpacity="0.55" strokeWidth="1" strokeLinecap="round" />

          {/* Mouth */}
          {late ? (
            <ellipse cx="60" cy="64" rx="3.3" ry="4.3" fill="#7a3b40" />
          ) : sleepy ? (
            <path d="M54 61 Q60 65 66 61" stroke={c.dark} strokeWidth="2.2" strokeLinecap="round" />
          ) : (
            <>
              <path d="M60 60.5 Q56 65 52.5 62 M60 60.5 Q64 65 67.5 62" stroke={c.dark} strokeWidth="2.2" strokeLinecap="round" />
              <path d="M57 63 Q60 67 63 63 Z" fill="#e58a9a" />
            </>
          )}

          {/* Whiskers */}
          <g stroke="#3a2a16" strokeOpacity="0.3" strokeWidth="1.1" strokeLinecap="round">
            <path d="M45 57 Q34 55 27 53" /><path d="M45 60 Q33 61 26 62" />
            <path d="M75 57 Q86 54 93 52" /><path d="M75 60 Q87 61 94 62" />
          </g>

          {/* Sweat drop (late only) */}
          {late && (
            <path className="cat-sweat" d="M95 28 C91 34 91 39 95 39 C99 39 99 34 95 28 Z" fill="#8fbfe0" stroke="#4a7ba6" strokeWidth="0.6" />
          )}
        </g>

        {/* Waving paw (drawn over the head so it reads as a goodbye) */}
        {sleepy && (
          <g>
            <path d="M76 74 Q86 64 89 54" stroke={c.base} strokeWidth="13" strokeLinecap="round" />
            <Paw cx={90} cy={52} u={u} />
          </g>
        )}
      </g>
    </svg>
  );
}

/** A cream paw with three little toe lines. */
function Paw({ cx, cy, u }: { cx: number; cy: number; u: string }) {
  return (
    <>
      <ellipse cx={cx} cy={cy} rx="7.6" ry="6.4" fill={`url(#belly-${u})`} />
      <g stroke="#cba86a" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.7">
        <path d={`M${cx - 3} ${cy - 2} L${cx - 3} ${cy + 2}`} />
        <path d={`M${cx} ${cy - 2.5} L${cx} ${cy + 1.5}`} />
        <path d={`M${cx + 3} ${cy - 2} L${cx + 3} ${cy + 2}`} />
      </g>
    </>
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
