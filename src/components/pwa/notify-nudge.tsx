"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useLocale } from "@/components/layout/locale-context";
import type { Locale } from "@/lib/i18n";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const DISMISS_KEY = "treelogy-notify-nudge-dismissed";
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // re-ask at most weekly

const STR: Record<Locale, { title: string; sub: string; enable: string; dismiss: string; ok: string; fail: string }> = {
  id: {
    title: "Nyalakan notifikasi",
    sub: "Biar tak ketinggalan pengingat absen & status pengajuanmu.",
    enable: "Aktifkan",
    dismiss: "Tutup",
    ok: "Notifikasi aktif untuk perangkat ini.",
    fail: "Gagal mengaktifkan notifikasi. Coba lagi.",
  },
  en: {
    title: "Turn on notifications",
    sub: "So you never miss clock-in reminders or your request updates.",
    enable: "Enable",
    dismiss: "Dismiss",
    ok: "Notifications enabled for this device.",
    fail: "Couldn't enable notifications. Try again.",
  },
};

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/**
 * A gentle, dismissible inline nudge for people who haven't turned on push yet.
 * Only shows when it can actually be acted on (push supported, VAPID set,
 * permission still "default", not already subscribed) and stays quiet for a week
 * after being dismissed. Complements the once-per-login NotifyPrompt modal.
 */
export function NotifyNudge() {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!supported || !VAPID_PUBLIC || Notification.permission !== "default") return;

    try {
      const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      if (at && Date.now() - at < COOLDOWN_MS) return;
    } catch {
      /* localStorage unavailable */
    }

    // Don't show if a subscription already exists on this device.
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => {
        if (!sub) setShow(true);
      })
      .catch(() => setShow(true));
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  async function enable() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        // Decided (blocked or still default) → stop nudging for a while.
        dismiss();
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub }),
      });
      if (!res.ok) throw new Error("save_failed");
      setShow(false);
      toast.success(t.ok);
    } catch {
      toast.error(t.fail);
    } finally {
      setBusy(false);
    }
  }

  if (!show) return null;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-forest-200 bg-forest-50/70 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-forest-100 text-forest-700">
        <Bell className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{t.title}</p>
        <p className="truncate text-xs text-muted">{t.sub}</p>
      </div>
      <button
        type="button"
        onClick={enable}
        disabled={busy}
        className="shrink-0 rounded-lg bg-forest-600 px-3 py-1.5 text-xs font-semibold text-cream transition-colors hover:bg-forest-700 disabled:opacity-60"
      >
        {t.enable}
      </button>
      <button type="button" onClick={dismiss} aria-label={t.dismiss} className="shrink-0 rounded-lg p-1.5 text-faint hover:text-muted">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
