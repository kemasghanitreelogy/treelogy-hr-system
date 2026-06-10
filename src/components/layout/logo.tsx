import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({ className, mark = false }: { className?: string; mark?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Image
        src="/logo-treelogy.png"
        alt="Treelogy"
        width={36}
        height={36}
        priority
        className="h-9 w-9 shrink-0 rounded-xl object-cover"
      />
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
