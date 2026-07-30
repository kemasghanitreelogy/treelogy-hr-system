"use client";

import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Foto barang dari bucket privat `inventory-photos`.
 *
 * Bucket-nya privat, jadi sumbernya adalah route API yang mengalihkan ke signed
 * URL berumur 60 detik — host-nya berubah-ubah sehingga next/image tidak bisa
 * mengoptimalkannya; <img> biasa adalah pilihan yang benar di sini.
 *
 * Tiga keadaan ditangani eksplisit supaya tidak pernah ada kotak kosong tanpa
 * penjelasan: skeleton selagi memuat, fade-in saat siap, dan pesan jelas kalau
 * gagal (mis. signed URL kedaluwarsa atau berkas sudah dihapus).
 */
export function ItemPhoto({
  path,
  alt,
  className,
  rounded = "rounded-2xl",
}: {
  path: string;
  alt: string;
  className?: string;
  rounded?: string;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const src = `/api/inventory/photo?path=${encodeURIComponent(path)}`;

  // Ganti barang → ganti foto: kembalikan ke skeleton, jangan tampilkan foto lama.
  useEffect(() => setState("loading"), [path]);

  return (
    <div className={cn("relative overflow-hidden border border-line bg-sand/60", rounded, className)}>
      {state === "loading" && <div aria-hidden className="absolute inset-0 animate-pulse bg-sand" />}

      {state === "error" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-faint">
          <ImageOff className="h-6 w-6" />
          <span className="text-xs">Foto tidak bisa dimuat</span>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setState("ready")}
          onError={() => setState("error")}
          className={cn(
            "h-full w-full object-cover transition-opacity duration-300",
            state === "ready" ? "opacity-100" : "opacity-0",
          )}
        />
      )}
    </div>
  );
}
