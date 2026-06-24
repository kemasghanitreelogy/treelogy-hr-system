"use client";

import { useEffect, useState } from "react";
import { Download, Plus, Share, X } from "lucide-react";
import { Logo } from "@/components/layout/logo";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
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

/**
 * Hanya tampilkan ajakan pasang di HP/tablet. Laptop/desktop (pointer presisi)
 * tidak perlu di-nag — primary pointer "coarse" = perangkat sentuh.
 */
function isMobileDevice(): boolean {
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const uaMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent);
  return coarse || uaMobile || isIosDevice();
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
    if (isStandalone()) return; // already installed → never nag again
    if (!isMobileDevice()) return; // laptop/desktop → jangan tampilkan ajakan pasang

    // Android / desktop Chromium: capture the native install prompt.
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    const onInstalled = () => setShow(false);
    window.addEventListener("appinstalled", onInstalled);

    // iOS has NO install API — surface the manual "Add to Home Screen" steps
    // (any iOS browser; in an in-app webview we tell them to open Safari first).
    let timer: number | undefined;
    if (isIosDevice()) {
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

  // Dismissal is in-memory only — the banner returns on every fresh load/visit
  // until the app is actually installed (standalone), per requirement.
  function dismiss() {
    setShow(false);
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
