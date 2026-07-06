"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { allClocks, removeClock } from "@/lib/clock-queue";
import { postClock, isFinalClockResponse } from "@/lib/clock-post";

const STALE_MS = 18 * 60 * 60 * 1000; // too old to record accurately → drop
const FRESH_MS = 8000; // let the widget's own attempt handle very recent items

let draining = false;

/**
 * Drains any offline clock queue when the app regains focus/connectivity (or
 * simply on reopen). Replays are idempotent server-side and each carries its own
 * clientTime, so the recorded clock stays on its real moment. Renders nothing.
 */
export function ClockSync() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function drain() {
      if (draining) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      draining = true;
      let synced = 0;
      try {
        const items = (await allClocks()).sort((a, b) => a.at - b.at);
        for (const it of items) {
          if (cancelled) break;
          const age = Date.now() - it.at;
          if (age > STALE_MS) {
            await removeClock(it.id); // stale → drop rather than record a wrong time
            continue;
          }
          if (age < FRESH_MS) continue; // the widget is likely still handling this one
          try {
            const res = await postClock(it.payload);
            if (isFinalClockResponse(res.status)) {
              await removeClock(it.id); // recorded (or permanent error) → done
              synced++;
            } else {
              break; // auth/transient (401/5xx…) → stop; retry on the next event
            }
          } catch {
            break; // still offline → retry on the next event
          }
        }
      } finally {
        draining = false;
      }
      if (synced > 0 && !cancelled) router.refresh();
    }

    drain();
    const onOnline = () => drain();
    const onVisible = () => {
      if (document.visibilityState === "visible") drain();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
