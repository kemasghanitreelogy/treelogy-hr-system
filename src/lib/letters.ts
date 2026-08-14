import type { Locale } from "./i18n";
import type { LetterDept } from "./types";

/* ============================================================
   Surat Keluar — penomoran surat resmi.

       0001/HRD-TRM/VIII/2026
       └──┘ └─┘ └─┘ └──┘ └──┘
        │    │   │    │    └── tahun
        │    │   │    └─────── bulan pembuatan (angka Romawi)
        │    │   └──────────── Treelogy
        │    └──────────────── departemen tujuan
        └───────────────────── nomor urut, satu deret perusahaan per tahun

   Nomor SUNGGUHAN selalu dibuat database (trigger `letter_assign_code`) supaya
   tidak mungkin kembar. Yang di sini hanya untuk PRATINJAU di layar sebelum
   tombol ditekan — karena itu bagian nomor urutnya sengaja ditulis "0000",
   bukan menebak angka yang belum tentu jadi miliknya.
   ============================================================ */

export const LETTER_DEPTS: LetterDept[] = ["hr_ga", "sales", "finance", "farm", "factory"];

/** Singkatan yang tercetak di nomor surat. Harus sama persis dengan
 *  `letter_dept_code()` di database — di sanalah nomor asli dibentuk. */
export const DEPT_CODE: Record<LetterDept, string> = {
  hr_ga: "HRD",
  sales: "SLS",
  finance: "FIN",
  farm: "FRM",
  factory: "FCT",
};

export const DEPT_NAME: Record<Locale, Record<LetterDept, string>> = {
  id: {
    hr_ga: "HR & GA",
    sales: "Sales",
    finance: "Finance",
    farm: "Farm",
    factory: "Factory",
  },
  en: {
    hr_ga: "HR & GA",
    sales: "Sales",
    finance: "Finance",
    farm: "Farm",
    factory: "Factory",
  },
};

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

/** Bulan 1–12 → angka Romawi. */
export function romanMonth(month: number): string {
  return ROMAN[month - 1] ?? "";
}

/** Tanggal hari ini menurut WITA — penentu bulan & tahun pada nomor surat. */
export function witaNow(): { year: number; month: number } {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Makassar",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return { year: get("year"), month: get("month") };
}

/**
 * Pratinjau nomor untuk departemen tertentu. `seq` sengaja tidak diisi:
 * nomor urut baru diketahui saat database menerbitkannya.
 */
export function previewCode(dept: LetterDept, at = witaNow()): string {
  return `0000/${DEPT_CODE[dept]}-TRM/${romanMonth(at.month)}/${at.year}`;
}
