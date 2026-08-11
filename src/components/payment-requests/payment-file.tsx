"use client";

import { useEffect, useState } from "react";
import { FileText, ImageOff, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

/* ============================================================
   Satu lampiran pengajuan pembayaran.

   Bucket-nya privat, jadi sumbernya adalah route yang menukar path menjadi
   signed URL berumur pendek. Gambar ditampilkan langsung sebagai pratinjau —
   memeriksa faktur tanpa perlu membuka tab baru adalah bedanya antara
   memverifikasi 16 pengajuan dalam semenit dan dalam sepuluh menit.
   PDF tidak bisa dipratinjau begitu saja, jadi tampil sebagai kartu berkas.
   ============================================================ */

const DEFAULT_API = "/api/payment-requests/file";

function isImage(path: string): boolean {
  return /\.(jpe?g|png|webp|heic|gif)$/i.test(path);
}

/** Nama berkas yang enak dibaca: buang folder & UUID, sisakan jenisnya. */
function labelOf(path: string, index: number, total: number): string {
  const ext = (path.split(".").pop() ?? "").toUpperCase();
  return total > 1 ? `Lampiran ${index + 1} · ${ext}` : `Lampiran · ${ext}`;
}

export function PaymentFile({
  path,
  index = 0,
  total = 1,
  className,
  api = DEFAULT_API,
}: {
  path: string;
  index?: number;
  total?: number;
  className?: string;
  /** Route penukar path → signed URL; ganti untuk bucket lain (mis. travel). */
  api?: string;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => setState("loading"), [path]);

  const href = `${api}?path=${encodeURIComponent(path)}`;

  if (!isImage(path)) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "flex items-center gap-2.5 rounded-xl border border-line bg-panel px-3 py-2.5 transition-colors hover:border-forest-300 hover:bg-cream/60",
          className,
        )}
      >
        <FileText className="h-4 w-4 shrink-0 text-faint" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">
          {labelOf(path, index, total)}
        </span>
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-faint" />
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={labelOf(path, index, total)}
      className={cn(
        "group relative block overflow-hidden rounded-xl border border-line bg-sand/60",
        className,
      )}
    >
      {state === "loading" && <div aria-hidden className="absolute inset-0 animate-pulse bg-sand" />}
      {state === "error" ? (
        <div className="flex h-full min-h-24 flex-col items-center justify-center gap-1 text-faint">
          <ImageOff className="h-5 w-5" />
          <span className="text-[10px]">gagal dimuat</span>
        </div>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={href}
            alt={labelOf(path, index, total)}
            loading="lazy"
            decoding="async"
            onLoad={() => setState("ready")}
            onError={() => setState("error")}
            className={cn(
              "h-full w-full object-cover transition-opacity duration-300",
              state === "ready" ? "opacity-100" : "opacity-0",
            )}
          />
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-bark/60 px-2 py-1 text-[10px] font-medium text-cream opacity-0 transition-opacity group-hover:opacity-100">
            {labelOf(path, index, total)}
            <ExternalLink className="h-3 w-3 shrink-0" />
          </span>
        </>
      )}
    </a>
  );
}
