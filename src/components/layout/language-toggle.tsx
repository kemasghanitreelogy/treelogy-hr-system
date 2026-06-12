"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Languages, Loader2 } from "lucide-react";
import { LOCALE_COOKIE, shellDict, type Locale } from "@/lib/i18n";

/**
 * Tombol ganti bahasa ID ⇄ EN di topbar. Menyimpan pilihan ke cookie
 * (terbaca server → SSR konsisten) lalu router.refresh() agar seluruh
 * halaman dirender ulang dalam bahasa baru.
 */
export function LanguageToggle({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const next: Locale = locale === "id" ? "en" : "id";

  function toggle() {
    setBusy(true);
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
    // refresh() tidak punya promise — lepas indikator sesaat setelahnya.
    setTimeout(() => setBusy(false), 800);
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={shellDict(locale).switchLanguage}
      aria-label={shellDict(locale).switchLanguage}
      className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl px-2.5 text-muted transition-colors hover:bg-sand disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Languages className="h-5 w-5" />}
      <span className="text-xs font-semibold uppercase tracking-wide">{locale}</span>
    </button>
  );
}
