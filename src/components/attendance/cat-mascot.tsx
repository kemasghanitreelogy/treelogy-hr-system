/**
 * Treelogy clock-in cat mascot — a hand-drawn SVG (no emoji) with two moods:
 *  - "happy" → forest-green cat, closed smiling eyes + :3 mouth (on-time).
 *  - "late"  → warm amber cat, wide worried eyes + a sliding sweat drop (gentle,
 *              non-shaming). Ears twitch on both. All motion is CSS (globals.css).
 * A tiny leaf sprout nods to the Treelogy brand. Pure presentational, no state.
 */

const BARK = "#26331e";
const BLUSH = "#ef9aae";
const INNER_EAR = "#f3c9d0";

export function CatMascot({ mood, className }: { mood: "happy" | "late"; className?: string }) {
  const late = mood === "late";
  const fur = late ? "#e0a82e" : "#7d9c57";
  const furDark = late ? "#c78f1e" : "#5f7e3e";

  return (
    <svg viewBox="0 0 120 120" className={className} role="img" aria-hidden fill="none">
      {/* Ears */}
      <g className="cat-ear-l">
        <path d="M34 46 L26 14 L58 36 Z" fill={fur} />
        <path d="M37 42 L31 22 L50 35 Z" fill={INNER_EAR} />
      </g>
      <g className="cat-ear-r">
        <path d="M86 46 L94 14 L62 36 Z" fill={fur} />
        <path d="M83 42 L89 22 L70 35 Z" fill={INNER_EAR} />
      </g>

      {/* Brand leaf sprout */}
      <path d="M60 34 C56 24 62 17 71 18 C71 27 66 34 60 34 Z" fill={furDark} />
      <path d="M60 34 L61 40" stroke={furDark} strokeWidth={2.4} strokeLinecap="round" />

      {/* Head */}
      <ellipse cx="60" cy="66" rx="38" ry="35" fill={fur} />

      {/* Whiskers */}
      <g stroke={BARK} strokeOpacity="0.4" strokeWidth="1.6" strokeLinecap="round">
        <path d="M42 66 L24 62" /><path d="M42 70 L22 70" /><path d="M42 74 L24 78" />
        <path d="M78 66 L96 62" /><path d="M78 70 L98 70" /><path d="M78 74 L96 78" />
      </g>

      {/* Blush */}
      <ellipse cx="37" cy="72" rx="6" ry="4" fill={BLUSH} fillOpacity="0.55" />
      <ellipse cx="83" cy="72" rx="6" ry="4" fill={BLUSH} fillOpacity="0.55" />

      {/* Eyes */}
      {late ? (
        <g>
          <path d="M40 50 Q47 47 53 50" stroke={BARK} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M67 50 Q73 47 80 50" stroke={BARK} strokeWidth="2.4" strokeLinecap="round" />
          <ellipse cx="47" cy="62" rx="6.5" ry="8.5" fill="#fff" stroke={BARK} strokeWidth="1.4" />
          <ellipse cx="73" cy="62" rx="6.5" ry="8.5" fill="#fff" stroke={BARK} strokeWidth="1.4" />
          <circle cx="47" cy="59" r="3.6" fill={BARK} />
          <circle cx="73" cy="59" r="3.6" fill={BARK} />
          <circle cx="48.4" cy="57.4" r="1.2" fill="#fff" />
          <circle cx="74.4" cy="57.4" r="1.2" fill="#fff" />
        </g>
      ) : (
        <g stroke={BARK} strokeWidth="4.5" strokeLinecap="round">
          <path d="M40 63 Q47 54 54 63" />
          <path d="M66 63 Q73 54 80 63" />
        </g>
      )}

      {/* Nose */}
      <path d="M56 66 L64 66 L60 71 Z" fill="#b9636f" />

      {/* Mouth */}
      {late ? (
        <ellipse cx="60" cy="76" rx="4.5" ry="5.5" fill="#7a3b40" />
      ) : (
        <path d="M60 71 Q55 78 50 73 M60 71 Q65 78 70 73" stroke={BARK} strokeWidth="3" strokeLinecap="round" />
      )}

      {/* Sweat drop (late only) */}
      {late && (
        <path className="cat-sweat" d="M88 40 C84 46 84 51 88 51 C92 51 92 46 88 40 Z" fill="#8fbfe0" stroke="#4a7ba6" strokeWidth="0.6" />
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
