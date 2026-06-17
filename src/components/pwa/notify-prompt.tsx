"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useLocale } from "@/components/layout/locale-context";
import type { Locale } from "@/lib/i18n";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

// Set by the login page on a successful sign-in so this prompt fires once
// per fresh login (and again on the next login), per the requirement.
export const JUST_LOGGED_IN_KEY = "treelogy-just-logged-in";

const STR: Record<Locale, { title: string; message: string; enable: string; later: string; ok: string; fail: string }> = {
  id: {
    title: "Aktifkan notifikasi?",
    message:
      "Dapatkan pengingat clock-in, persetujuan cuti/lembur, dan info penting langsung di perangkat ini.",
    enable: "Aktifkan",
    later: "Nanti",
    ok: "Notifikasi aktif untuk perangkat ini.",
    fail: "Gagal mengaktifkan notifikasi. Coba lagi.",
  },
  en: {
    title: "Enable notifications?",
    message:
      "Get clock-in reminders, leave/overtime approvals, and important updates right on this device.",
    enable: "Enable",
    later: "Later",
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

export function NotifyPrompt() {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Only nag right after a fresh login — consume the flag immediately so it
    // never re-appears on in-app navigation within the same session.
    let justLoggedIn = false;
    try {
      justLoggedIn = sessionStorage.getItem(JUST_LOGGED_IN_KEY) === "1";
      sessionStorage.removeItem(JUST_LOGGED_IN_KEY);
    } catch {
      /* sessionStorage unavailable (private mode) */
    }
    if (!justLoggedIn) return;

    const supported =
      "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    // No push support, no VAPID key, or the user already decided (granted/denied)
    // → nothing to prompt for.
    if (!supported || !VAPID_PUBLIC || Notification.permission !== "default") return;

    // Let the dashboard finish its entrance before interrupting.
    const id = window.setTimeout(() => setShow(true), 1200);
    return () => window.clearTimeout(id);
  }, []);

  // Auto-dismiss the moment notifications get enabled (or blocked) by ANY means
  // — the in-app button, the browser UI, or the phone's settings. Without this
  // the popup lingers until something re-renders it.
  useEffect(() => {
    if (!show) return;
    const settle = () => {
      if (typeof Notification !== "undefined" && Notification.permission !== "default") setShow(false);
    };
    let status: PermissionStatus | null = null;
    navigator.permissions
      ?.query({ name: "notifications" as PermissionName })
      .then((s) => {
        status = s;
        s.onchange = settle;
      })
      .catch(() => {});
    // Coming back from the OS settings / permission sheet → re-check.
    document.addEventListener("visibilitychange", settle);
    window.addEventListener("focus", settle);
    return () => {
      if (status) status.onchange = null;
      document.removeEventListener("visibilitychange", settle);
      window.removeEventListener("focus", settle);
    };
  }, [show]);

  // Fire-and-forget subscription so the modal never blocks on the network.
  async function subscribeInBackground() {
    try {
      // `ready` resolves once the SW is active (more reliable than getRegistration).
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
      toast.success(t.ok);
    } catch {
      toast.error(t.fail);
    }
  }

  async function enable() {
    setBusy(true);
    let perm: NotificationPermission = "default";
    try {
      perm = await Notification.requestPermission();
    } catch {
      /* some browsers reject if not user-gesture — treat as undecided */
    }
    // Close instantly the moment the user decides — no spinner, no lingering.
    setShow(false);
    setBusy(false);
    if (perm === "granted") void subscribeInBackground();
  }

  return (
    <ConfirmDialog
      open={show}
      title={t.title}
      message={t.message}
      confirmLabel={t.enable}
      cancelLabel={t.later}
      icon={<BellRing className="h-6 w-6" />}
      busy={busy}
      onConfirm={enable}
      onCancel={() => setShow(false)}
    />
  );
}
