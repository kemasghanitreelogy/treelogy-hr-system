"use client";

import { createContext, useContext } from "react";
import type { Locale } from "@/lib/i18n";

/**
 * Locale aktif untuk SEMUA client component di bawah dashboard.
 * Nilainya berasal dari cookie yang dibaca server (layout) — konsisten SSR.
 * Default "id" membuat komponen aman dipakai di luar provider (mis. login).
 */
const LocaleContext = createContext<Locale>("id");

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}
