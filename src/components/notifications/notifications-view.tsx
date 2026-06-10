"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellOff, Check, Clock, Wallet, X } from "lucide-react";
import type { AppNotification, NotifTone } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

const TONE: Record<NotifTone, { icon: typeof Check; wrap: string }> = {
  approved: { icon: Check, wrap: "bg-forest-100 text-forest-700" },
  rejected: { icon: X, wrap: "bg-clay-soft text-clay" },
  paid: { icon: Wallet, wrap: "bg-gold-soft text-[#8a6512]" },
  pending: { icon: Clock, wrap: "bg-sky-soft text-[#2c5775]" },
};

export function NotificationsView({ items }: { items: AppNotification[] }) {
  const router = useRouter();
  const marked = useRef(false);

  // Mark everything read once on open, then refresh so the bell dot clears.
  useEffect(() => {
    if (marked.current || !items.some((n) => !n.read)) return;
    marked.current = true;
    fetch("/api/notifications", { method: "PATCH" })
      .then(() => router.refresh())
      .catch(() => {});
  }, [items, router]);

  return (
    <div className="mx-auto max-w-2xl space-y-4 fade-up">
      <p className="text-sm text-muted">Riwayat persetujuan cuti, lembur, pembayaran, dan tukar libur.</p>

      {items.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 px-5 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sand text-faint">
            <BellOff className="h-6 w-6" />
          </span>
          <p className="text-sm text-faint">Belum ada notifikasi.</p>
        </div>
      ) : (
        <div className="card divide-y divide-line overflow-hidden">
          {items.map((n) => {
            const tone = TONE[n.tone] ?? TONE.pending;
            const Icon = tone.icon;
            return (
              <Link
                key={n.id}
                href={n.href || "#"}
                className={cn(
                  "flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-sand/50",
                  !n.read && "bg-forest-50/60",
                )}
              >
                <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", tone.wrap)}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{n.title}</p>
                  {n.body && <p className="truncate text-xs text-faint">{n.body}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="whitespace-nowrap text-xs text-faint">{formatDate(n.createdAt)}</span>
                  {!n.read && <span className="h-2 w-2 rounded-full bg-clay" />}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
