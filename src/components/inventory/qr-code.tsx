"use client";

import { useMemo } from "react";
import { qrSvgPath } from "@/lib/qr";
import { cn } from "@/lib/utils";

/**
 * QR sebagai satu <path> SVG (engine: nayuki/QR-Code-generator).
 *
 * Satu node vektor, bukan ratusan <rect> — jadi menampilkan banyak QR sekaligus
 * (grid label) tetap murah, dan hasilnya tajam di zoom/cetak berapa pun.
 *
 * `scanline` menambah sapuan sekali jalan saat QR pertama tampil: petunjuk halus
 * bahwa kode ini memang untuk dipindai.
 */
export function QrCode({
  value,
  size = 168,
  border = 2,
  className,
  scanline = false,
  title,
}: {
  value: string;
  size?: number;
  border?: number;
  className?: string;
  scanline?: boolean;
  title?: string;
}) {
  // Encoding hanya berjalan ulang saat teks/quiet-zone berubah.
  const qr = useMemo(() => {
    try {
      return qrSvgPath(value, { ecc: "quartile", border });
    } catch {
      return null;
    }
  }, [value, border]);

  if (!qr) {
    return (
      <div
        className={cn("flex items-center justify-center rounded-xl bg-sand text-xs text-faint", className)}
        style={{ width: size, height: size }}
      >
        QR gagal dibuat
      </div>
    );
  }

  return (
    <div
      className={cn("relative overflow-hidden rounded-xl bg-white p-0", className)}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox={`0 0 ${qr.viewBox} ${qr.viewBox}`}
        width={size}
        height={size}
        shapeRendering="crispEdges"
        role="img"
        aria-label={title ?? `QR ${value}`}
        className="animate-qr-in block"
      >
        <rect width={qr.viewBox} height={qr.viewBox} fill="#ffffff" />
        <path d={qr.d} fill="#1f241b" />
      </svg>
      {scanline && (
        <span
          aria-hidden
          className="animate-qr-scan pointer-events-none absolute inset-x-2 top-0 h-6 rounded-full bg-gradient-to-b from-transparent via-forest-400/35 to-transparent"
        />
      )}
    </div>
  );
}
