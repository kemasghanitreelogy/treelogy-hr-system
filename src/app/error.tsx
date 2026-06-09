"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="grain flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-clay-soft text-clay">
        <RotateCw className="h-7 w-7" />
      </span>
      <h1 className="mt-5 font-display text-xl font-bold text-ink">Terjadi kesalahan</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        Maaf, ada gangguan saat memuat halaman. Silakan coba lagi.
      </p>
      <button
        onClick={reset}
        className="mt-6 inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-forest-600 px-5 text-sm font-medium text-cream transition-colors hover:bg-forest-700"
      >
        <RotateCw className="h-4 w-4" /> Coba lagi
      </button>
    </div>
  );
}
