"use client";

import { useEffect, useState } from "react";
import { Download, Plus, Share, X } from "lucide-react";
import { Logo } from "@/components/layout/logo";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "treelogy-pwa-dismissed";
const DISMISS_DAYS = 14; // Android/desktop: a real action, snooze longer.
const IOS_DISMISS_DAYS = 3; // iOS: just guidance, let it resurface sooner.

function recentlyDismissed(days: number): boolean {
  try {
    const ts = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() - ts < days * 86_400_000;
  } catch {
    return false;
  }
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** iPhone/iPod, classic iPad, AND iPadOS (which now reports a desktop "Macintosh" UA). */
function isIosDevice(): boolean {
  const ua = window.navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return true;
  return /Macintosh/.test(ua) && (window.navigator.maxTouchPoints ?? 0) > 1;
}

/** In-app webviews (IG/FB/Line/etc.) can't "Add to Home Screen" — user must open in Safari. */
function isInAppBrowser(): boolean {
  return /FBAN|FBAV|Instagram|Line|Twitter|MicroMessenger|GSA|DuckDuckGo/i.test(window.navigator.userAgent);
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [inApp, setInApp] = useState(false);

  useEffect(() => {
    if (isStandalone()) return; // already installed → nothing to do

    // Android / desktop Chromium: capture the native install prompt.
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      if (!recentlyDismissed(DISMISS_DAYS)) setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    const onInstalled = () => setShow(false);
    window.addEventListener("appinstalled", onInstalled);

    // iOS has NO install API — surface the manual "Add to Home Screen" steps
    // (any iOS browser; in an in-app webview we tell them to open Safari first).
    let timer: number | undefined;
    if (isIosDevice() && !recentlyDismissed(IOS_DISMISS_DAYS)) {
      setInApp(isInAppBrowser());
      timer = window.setTimeout(() => {
        setIosHint(true);
        setShow(true);
      }, 2000);
    }

    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-md lg:bottom-4 lg:left-auto lg:right-4 lg:mx-0">
      <div className="card flex items-start gap-3 p-4 shadow-pop">
        <div className="shrink-0">
          <Logo mark />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Pasang Treelogy HR</p>

          {iosHint ? (
            inApp ? (
              <p className="mt-1 text-xs text-muted">
                Buka halaman ini di <span className="font-medium text-ink">Safari</span> dulu
                (ketuk menu <span className="font-medium text-ink">•••</span> →{" "}
                <span className="font-medium text-ink">Buka di Safari</span>), lalu pasang dari sana.
              </p>
            ) : (
              <div className="mt-1 space-y-1 text-xs text-muted">
                <p>Di iPhone, pasang lewat menu Bagikan Safari:</p>
                <p className="flex items-center gap-1.5">
                  <span className="font-medium text-ink">1.</span> Ketuk
                  <Share className="h-3.5 w-3.5 text-sky" /> (Bagikan)
                </p>
                <p className="flex items-center gap-1.5">
                  <span className="font-medium text-ink">2.</span> Pilih
                  <Plus className="h-3.5 w-3.5 text-forest-600" />
                  <span className="font-medium text-ink">Add to Home Screen</span>
                </p>
              </div>
            )
          ) : (
            <p className="mt-0.5 text-xs text-muted">
              Akses cepat, layar penuh, dan bisa dipakai offline — langsung dari layar utama.
            </p>
          )}

          {!iosHint && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={install}
                className="inline-flex h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-forest-600 text-sm font-medium text-cream transition-colors hover:bg-forest-700"
              >
                <Download className="h-4 w-4" /> Pasang
              </button>
              <button
                onClick={dismiss}
                className="inline-flex h-9 cursor-pointer items-center justify-center rounded-xl px-3 text-sm font-medium text-muted transition-colors hover:bg-sand"
              >
                Nanti
              </button>
            </div>
          )}
        </div>
        <button
          onClick={dismiss}
          aria-label="Tutup"
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-faint transition-colors hover:bg-sand hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
