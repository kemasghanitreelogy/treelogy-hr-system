import { cn } from "@/lib/utils";

export function Logo({ className, mark = false }: { className?: string; mark?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-forest-600 text-cream">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
          <path
            d="M12 21V11M12 11c0-3 2-5 5-5 0 3-2 5-5 5Zm0 2c0-3-2-5-5-5 0 3 2 5 5 5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {!mark && (
        <div className="leading-none">
          <span className="block font-display text-[15px] font-bold tracking-tight text-ink">
            TREELOGY
          </span>
          <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-faint">
            HR System
          </span>
        </div>
      )}
    </div>
  );
}
