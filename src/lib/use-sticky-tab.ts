"use client";

import { useEffect, useState } from "react";

/**
 * Pilihan tab/segmen yang DIINGAT lewat sessionStorage, sehingga saat pindah
 * menu lalu kembali, tab terakhir yang dipilih otomatis aktif lagi.
 * SSR & render pertama memakai `fallback` (hindari hydration mismatch), lalu
 * useEffect memuat nilai tersimpan jika ada & valid.
 */
export function useStickyTab<T extends string>(
  key: string,
  fallback: T,
  allowed: readonly T[],
): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(fallback);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("treelogy.tab." + key);
      if (saved && (allowed as readonly string[]).includes(saved)) setValue(saved as T);
    } catch {
      /* sessionStorage tak tersedia → pakai fallback */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = (v: T) => {
    setValue(v);
    try {
      sessionStorage.setItem("treelogy.tab." + key, v);
    } catch {
      /* ignore */
    }
  };

  return [value, set];
}
