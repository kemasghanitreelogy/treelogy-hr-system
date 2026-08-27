/* Treelogy Workspace — Service Worker
   Offline-first PWA: precache aset publik, navigasi network-first BERBATAS
   WAKTU dengan cadangan halaman offline, aset statis stale-while-revalidate. */

// Dinaikkan saat perilaku SW berubah — tanpa ini perangkat tetap memakai
// service worker lama dari cache dan perbaikannya tidak pernah terpasang.
const VERSION = "treelogy-workspace-v9";
const APP_SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;

/**
 * Berapa lama navigasi menunggu jaringan sebelum menyerah ke cadangan.
 *
 * INI YANG DULU TIDAK ADA, dan itulah sebabnya aplikasi bisa "loading terus":
 * `fetch` yang menggantung — bukan gagal — tidak pernah menolak, jadi cabang
 * penangkap galat tidak pernah jalan dan halaman menunggu selamanya. Di
 * jaringan seluler yang timbul-tenggelam, itu persis yang terjadi.
 */
const NAV_TIMEOUT_MS = 8000;

/**
 * Hanya aset PUBLIK dan statis.
 *
 * "/dashboard" DULU ada di sini dan itu bug yang serius: halaman itu dipagari
 * login, jadi saat pemakainya belum masuk ia menjawab 307 ke /login. `fetch`
 * mengikuti redirect, dan Cache API MENOLAK menyimpan respons hasil redirect —
 * `addAll()` melempar, seluruh install gagal, dan service worker tidak pernah
 * aktif. Selain itu HTML dashboard berisi nama dan data orang yang sedang
 * masuk; menyimpannya di cache bersama berarti perangkat yang dipakai berdua
 * bisa menampilkan data pengguna sebelumnya.
 */
const PRECACHE = [
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_SHELL);
      // Satu per satu, bukan addAll(): satu berkas yang gagal tidak boleh
      // menggagalkan SELURUH install lalu meninggalkan aplikasi tanpa
      // service worker sama sekali.
      await Promise.all(
        PRECACHE.map(async (u) => {
          try {
            const res = await fetch(new Request(u, { cache: "reload" }));
            if (res.ok && !res.redirected) await cache.put(u, res);
          } catch {
            /* biarkan — sisanya tetap terpasang */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Buang cache versi lama — termasuk cache halaman ber-login dari v8.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })(),
  );
});

// Let the page trigger an immediate update.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    // .mjs & .wasm = worker pdf.js dan pembaca barcode (masing-masing ~1MB,
    // isinya tidak pernah berubah tanpa ganti nama versi). Tanpa ini keduanya
    // diunduh ulang setiap kali halaman resi dipakai.
    /\.(?:js|mjs|wasm|css|woff2?|ttf|otf|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)
  );
}

/** Menyerah setelah `ms` — dipakai supaya jaringan yang menggantung tetap
 *  berujung pada sesuatu, bukan pada layar memuat tanpa akhir. */
function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // jangan sentuh lintas-origin

  // Tautan berkas & endpoint API dibiarkan lewat apa adanya.
  // Membukanya dari Google Sheet adalah navigasi tingkat atas, sehingga tanpa
  // pengecualian ini service worker memperlakukannya seperti halaman aplikasi:
  // muncul splash/shell PWA sebelum berkasnya tampil, dan responsnya sempat
  // di-cache. Padahal yang diinginkan hanya membuka berkas.
  if (url.pathname.startsWith("/api/")) return;

  // 1) Navigasi halaman → jaringan dulu, TAPI berbatas waktu.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          // preloadResponse pun dibatasi waktunya: kalau ia menggantung,
          // menunggunya tanpa batas sama saja dengan menggantungkan halaman.
          const preload = await Promise.race([event.preloadResponse, timeout(NAV_TIMEOUT_MS)]);
          if (preload) return preload;
          return await Promise.race([fetch(request), timeout(NAV_TIMEOUT_MS)]);
        } catch {
          // Halaman ber-login TIDAK di-cache (lihat catatan PRECACHE), jadi
          // yang tersisa memang halaman offline — dan itu jujur: lebih baik
          // "kamu sedang offline" daripada berputar tanpa akhir.
          return (await caches.match("/offline")) || Response.error();
        }
      })(),
    );
    return;
  }

  // 2) Aset statis → stale-while-revalidate.
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC);
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res && res.status === 200 && !res.redirected) cache.put(request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })(),
    );
    return;
  }

  // 3) Sisanya → jaringan langsung, tanpa cache. Data milik pengguna tidak
  //    pernah disimpan supaya tidak bocor ke pemakai berikutnya di perangkat
  //    yang sama, dan supaya yang tampil tidak pernah basi.
  event.respondWith(fetch(request).catch(() => Response.error()));
});

/* ---------------- Web Push ---------------- */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Treelogy HR", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Treelogy HR";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badge || "/icons/favicon-48.png",
    tag: data.tag || "treelogy-hr",
    renotify: true,
    vibrate: [80, 40, 80],
    data: { url: data.url || "/dashboard" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        const url = new URL(client.url);
        if (url.origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
