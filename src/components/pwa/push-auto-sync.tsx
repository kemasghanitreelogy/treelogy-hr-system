"use client";

import { useEffect } from "react";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  if (x.length !== b.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== b[i]) return false;
  return true;
}

/**
 * Keeps the device's push subscription fresh & stored on every app load.
 * Push subscriptions expire or get bound to an old VAPID key — when that happens
 * sends silently hit dead endpoints. Silently (only if permission already
 * granted) we re-subscribe when the subscription is missing or key-mismatched,
 * then upsert it server-side. No UI, no prompts.
 */
export function PushAutoSync() {
  useEffect(() => {
    if (!VAPID_PUBLIC) return;
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!supported || Notification.permission !== "granted") return;

    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const appKey = urlBase64ToUint8Array(VAPID_PUBLIC);
        let sub = await reg.pushManager.getSubscription();
        // Drop a subscription bound to a different (old) VAPID key.
        if (sub && !sameKey(sub.options.applicationServerKey, appKey)) {
          await sub.unsubscribe().catch(() => {});
          sub = null;
        }
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: appKey as BufferSource,
          });
        }
        if (cancelled) return;
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: sub }),
        });
      } catch {
        /* best-effort — never disrupt the app */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
