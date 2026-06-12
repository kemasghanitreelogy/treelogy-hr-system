/**
 * Fondasi dwibahasa (ID/EN). Pilihan bahasa disimpan di cookie `locale`
 * sehingga terbaca di server (SSR konsisten, tanpa hydration mismatch);
 * tombol di topbar mengubah cookie lalu router.refresh().
 * Mulai dari shell aplikasi — kamus halaman ditambahkan bertahap di sini.
 */
export type Locale = "id" | "en";

export const LOCALE_COOKIE = "locale";

export function normalizeLocale(value: string | undefined | null): Locale {
  return value === "en" ? "en" : "id";
}

export interface ShellDict {
  menu: string;
  more: string;
  openMenu: string;
  closeMenu: string;
  notifications: string;
  profile: string;
  accountMenu: string;
  viewProfile: string;
  logout: string;
  logoutTitle: string;
  logoutMessage: string;
  logoutConfirm: string;
  logoutBusy: string;
  cancel: string;
  switchLanguage: string;
}

const SHELL: Record<Locale, ShellDict> = {
  id: {
    menu: "Menu",
    more: "Lainnya",
    openMenu: "Buka menu",
    closeMenu: "Tutup menu",
    notifications: "Notifikasi",
    profile: "Profil",
    accountMenu: "Menu akun",
    viewProfile: "Lihat Profil",
    logout: "Keluar",
    logoutTitle: "Keluar dari akun?",
    logoutMessage: "Anda akan keluar dan kembali ke halaman masuk.",
    logoutConfirm: "Ya, keluar",
    logoutBusy: "Keluar…",
    cancel: "Batal",
    switchLanguage: "Ganti bahasa ke English",
  },
  en: {
    menu: "Menu",
    more: "More",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    notifications: "Notifications",
    profile: "Profile",
    accountMenu: "Account menu",
    viewProfile: "View Profile",
    logout: "Sign Out",
    logoutTitle: "Sign out of your account?",
    logoutMessage: "You will be signed out and returned to the login page.",
    logoutConfirm: "Yes, sign out",
    logoutBusy: "Signing out…",
    cancel: "Cancel",
    switchLanguage: "Switch language to Indonesia",
  },
};

export function shellDict(locale: Locale): ShellDict {
  return SHELL[locale];
}
