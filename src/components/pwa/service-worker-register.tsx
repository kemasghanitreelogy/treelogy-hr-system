"use client";

import { useEffect } from "react";

/** Registers the service worker in production and auto-applies updates. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          // When a new SW is installed, activate it immediately.
          reg.addEventListener("updatefound", () => {
            const sw = reg.installing;
            if (!sw) return;
            sw.addEventListener("statechange", () => {
              if (sw.state === "installed" && navigator.serviceWorker.controller) {
                sw.postMessage("SKIP_WAITING");
              }
            });
          });
        })
        .catch(() => {
          /* registration failed — app still works online */
        });
    };

    // Muat ulang saat service worker baru mengambil alih — TAPI paling banyak
    // sekali per tab.
    //
    // `refreshing` saja tidak cukup: nilainya lahir baru setiap kali halaman
    // dimuat, jadi kalau ada keadaan yang membuat SW mengambil alih di setiap
    // pemuatan, penjaganya ikut ter-reset dan halaman memuat-ulang terus tanpa
    // pernah sempat tampil — persis seperti "loading terus". sessionStorage
    // bertahan melintasi muat-ulang, jadi putarannya terputus di percobaan
    // kedua. Ia dibersihkan saat tab ditutup, jadi pembaruan berikutnya tetap
    // bisa terpasang normal.
    const RELOAD_KEY = "treelogy.sw.reloaded";
    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      try {
        if (sessionStorage.getItem(RELOAD_KEY)) return;
        sessionStorage.setItem(RELOAD_KEY, "1");
      } catch {
        // Mode privat bisa melarang sessionStorage. Tanpa penjaga yang awet,
        // lebih baik TIDAK memuat ulang sama sekali daripada berisiko
        // berputar: pembaruannya akan terpasang saat halaman dibuka lagi.
        return;
      }
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    window.addEventListener("load", onLoad);
    return () => {
      window.removeEventListener("load", onLoad);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
