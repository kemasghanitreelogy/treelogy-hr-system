import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Penanda versi yang ikut di laporan "Detail teknis". Tanpa ini, laporan dari
  // perangkat orang lain tidak bisa dipastikan berasal dari versi yang mana —
  // dan separuh penelusuran terbuang untuk menebak itu.
  env: {
    NEXT_PUBLIC_COMMIT: (process.env.VERCEL_GIT_COMMIT_SHA ?? "lokal").slice(0, 8),
  },
  // pdf.js dibiarkan di luar bundel server.
  //
  // Saat ikut dibundel, ia mencari berkas worker-nya di dalam folder build dan
  // gagal ("Cannot find module .../chunks/pdf.worker.mjs") — sehingga pembacaan
  // PDF di server, yang menjadi jalan kedua untuk perangkat yang tidak sanggup
  // membaca sendiri, selalu gagal. Di luar bundel, Node memuatnya dari
  // node_modules seperti biasa dan worker-nya ketemu.
  serverExternalPackages: ["pdfjs-dist"],
  experimental: {
    // Router cache halaman dinamis: hasil prefetch/kunjungan dipakai ulang
    // selama 3 menit — pindah-pindah menu tanpa server roundtrip (instan).
    staleTimes: { dynamic: 180, static: 300 },
  },
  async headers() {
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
      { key: "X-DNS-Prefetch-Control", value: "on" },
    ];
    return [
      { source: "/:path*", headers: security },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
      },
    ];
  },
};

export default nextConfig;
