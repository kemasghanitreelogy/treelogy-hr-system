"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Logo } from "@/components/layout/logo";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "treelogy-pwa-dismissed";
const DISMISS_DAYS = 14;

function recentlyDismissed(): boolean {
  try {
    const ts = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() - ts < DISMISS_DAYS * 86_400_000;
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

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS doesn't fire beforeinstallprompt — show manual A2HS hint.
    const ua = window.navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|chrome/i.test(ua);
    if (isIos && isSafari) {
      const t = setTimeout(() => {
        setIosHint(true);
        setShow(true);
      }, 2500);
      return () => {
        clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      };
    }

    const onInstalled = () => setShow(false);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
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
            <p className="mt-0.5 text-xs text-muted">
              Ketuk <Share className="inline h-3.5 w-3.5 align-text-bottom" /> lalu pilih
              <span className="font-medium text-ink"> “Add to Home Screen”</span> untuk akses cepat &amp; offline.
            </p>
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
