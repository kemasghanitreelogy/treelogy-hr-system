"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
// Demo: the signed-in user (Dewi Lestari → employee e08).
const CURRENT_USER_ID = "e08";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type State = "loading" | "unsupported" | "unconfigured" | "denied" | "idle" | "subscribed";

export function PushManager() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [iosNeedsInstall, setIosNeedsInstall] = useState(false);

  useEffect(() => {
    const supported =
      "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!supported) {
      // iOS < 16.4 or non-installed iOS Safari lacks PushManager.
      const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia?.("(display-mode: standalone)").matches;
      if (isIos && !standalone) setIosNeedsInstall(true);
      setState("unsupported");
      return;
    }
    if (!VAPID_PUBLIC) {
      setState("unconfigured");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setState(sub ? "subscribed" : "idle"))
      .catch(() => setState("idle"));
  }, []);

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "idle");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        setMsg("Service worker aktif pada build production (npm run build && start).");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub, userId: CURRENT_USER_ID }),
      });
      if (!res.ok) throw new Error("save_failed");
      setState("subscribed");
      setMsg("Notifikasi aktif untuk perangkat ini.");
    } catch {
      setMsg("Gagal mengaktifkan notifikasi. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("idle");
      setMsg("Notifikasi dinonaktifkan.");
    } catch {
      setMsg("Gagal menonaktifkan.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Pengingat Clock-In ⏰",
          body: "Jangan lupa absen masuk shift hari ini. Selamat bekerja! 🌿",
          url: "/attendance",
          userId: CURRENT_USER_ID,
        }),
      });
      const data = await res.json();
      setMsg(data.sent > 0 ? `Notifikasi terkirim (${data.sent}).` : "Tidak ada perangkat terdaftar.");
    } catch {
      setMsg("Gagal mengirim notifikasi uji.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return null;
  if (state === "unsupported" && !iosNeedsInstall) return null;

  return (
    <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            state === "subscribed" ? "bg-[#e9f0d8] text-forest-600" : "bg-forest-100 text-forest-700"
          }`}
        >
          {state === "subscribed" ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">Notifikasi Push</p>
          <p className="text-xs text-muted">
            {state === "subscribed"
              ? "Aktif — pengingat absensi & approval cuti."
              : state === "denied"
                ? "Diblokir. Aktifkan izin notifikasi di pengaturan browser."
                : state === "unconfigured"
                  ? "Belum dikonfigurasi (VAPID key kosong)."
                  : iosNeedsInstall
                    ? "Di iOS: Pasang dulu ke layar utama, lalu aktifkan dari sana."
                    : "Aktifkan untuk pengingat clock-in & persetujuan."}
          </p>
          {msg && <p className="mt-0.5 text-xs text-forest-600">{msg}</p>}
        </div>
      </div>

      <div className="flex shrink-0 gap-2">
        {state === "idle" && (
          <Button size="sm" onClick={enable} disabled={busy}>
            <Bell className="h-4 w-4" /> Aktifkan
          </Button>
        )}
        {state === "subscribed" && (
          <>
            <Button size="sm" variant="outline" onClick={sendTest} disabled={busy}>
              <Send className="h-4 w-4" /> Uji
            </Button>
            <Button size="sm" variant="ghost" onClick={disable} disabled={busy} className="text-muted">
              <BellOff className="h-4 w-4" /> Matikan
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
