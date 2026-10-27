/**
 * Normalisasi nomor WhatsApp ke bentuk yang diminta Qontak: digit saja,
 * berawalan kode negara, tanpa "+" (mis. 6281234567890).
 *
 * Dipakai di DUA sisi — browser (pratinjau, menandai baris bermasalah sebelum
 * apa pun dikirim) dan server (validasi ulang; klien tidak dipercaya). Satu
 * fungsi supaya yang dilihat di layar sama persis dengan yang dikirim.
 *
 * Nomor dari CSV/XLSX sering rusak oleh spreadsheet, bukan oleh orang yang
 * mengetiknya. Yang AMAN diperbaiki, diperbaiki otomatis dan DICATAT
 * (`fixes`) supaya terlihat di pratinjau; yang digitnya sudah hilang
 * (notasi ilmiah) ditolak — menebak digit yang hilang berarti mengirim pesan
 * ke orang lain.
 */

export type PhoneProblem = "empty" | "too_short" | "too_long" | "not_mobile" | "scientific";

/** Perbaikan otomatis yang layak diberitahukan ke pemakai. */
export type PhoneFix =
  | "excel_decimal"   // 6281234567890.0 → buntut ".0" sel angka Excel
  | "double_zero"     // +62 0812… / 620812… → nol ganda setelah 62
  | "intl_prefix"     // 0062812… → awalan internasional 00
  | "missing_zero"    // 812… → nol depan hilang (sel angka Excel)
  | "multiple"        // "0812… / 0813…" → dua nomor dalam satu sel, dipakai yang pertama
  | "junk";           // apostrof Excel, spasi tak terlihat, huruf/teks lain

export type PhoneResult =
  | { ok: true; phone: string; fixes: PhoneFix[] }
  | { ok: false; problem: PhoneProblem };

/** Nomor seluler Indonesia: 62 8xx, total 11–15 digit termasuk 62. */
const ID_MIN = 11;
const ID_MAX = 15;

const INVISIBLE = /[​-‍⁠﻿  ]/g;

export function normalizeWaPhone(raw: string | number | null | undefined): PhoneResult {
  const fixes: PhoneFix[] = [];
  let teks = String(raw ?? "").replace(INVISIBLE, " ").trim();
  if (teks.startsWith("'")) { teks = teks.slice(1); fixes.push("junk"); }
  if (!teks) return { ok: false, problem: "empty" };

  // 6.28123E+12 — Excel menyimpan nomor sebagai angka lalu menampilkannya
  // dalam notasi ilmiah; digit di belakang SUDAH HILANG dan tidak bisa
  // dipulihkan. Wajib ditolak, bukan ditebak.
  if (/^\+?\d+([.,]\d+)?e\+?\d+$/i.test(teks.replace(/\s/g, ""))) return { ok: false, problem: "scientific" };

  // Dua nomor dalam satu sel ("0812xxx / 0813xxx", "0812xxx, 0813xxx") —
  // pakai yang pertama. Pemisahnya hanya yang jelas pemisah, bukan "-"
  // (yang dipakai DI DALAM nomor: 0812-3456-7890).
  const bagian = teks.split(/\s*(?:[/,;|\n]|\batau\b|\bor\b|\bdan\b|&)\s*/i).filter((p) => /\d{6,}/.test(p.replace(/\D/g, "")));
  if (bagian.length > 1) { teks = bagian[0]; fixes.push("multiple"); }

  // 6281234567890.0 / 6281234567890,00 — buntut desimal sel angka.
  const desimal = teks.match(/^(\+?[\d\s-]+?)[.,]0+$/);
  if (desimal) { teks = desimal[1]; fixes.push("excel_decimal"); }

  if (/[^\d\s+().-]/.test(teks) && !fixes.includes("junk")) fixes.push("junk");
  const adaPlus = teks.trimStart().startsWith("+");
  let d = teks.replace(/\D/g, "");
  if (!d) return { ok: false, problem: "empty" };

  if (d.startsWith("00")) { d = d.slice(2); fixes.push("intl_prefix"); }

  // Nomor luar negeri yang ditulis lengkap dengan "+" / "00" — dibiarkan,
  // hanya panjangnya yang dijaga (E.164 maks 15 digit).
  if ((adaPlus || fixes.includes("intl_prefix")) && !d.startsWith("62")) {
    if (d.length < 8) return { ok: false, problem: "too_short" };
    if (d.length > 15) return { ok: false, problem: "too_long" };
    return { ok: true, phone: d, fixes };
  }

  if (d.startsWith("620")) { d = "62" + d.slice(3); fixes.push("double_zero"); }
  else if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) { d = "62" + d; fixes.push("missing_zero"); }

  if (!d.startsWith("62")) return { ok: false, problem: "not_mobile" };
  // WhatsApp hanya untuk seluler; 62 21… (telepon rumah Jakarta) tidak akan pernah sampai.
  if (d[2] !== "8") return { ok: false, problem: "not_mobile" };
  if (d.length < ID_MIN) return { ok: false, problem: "too_short" };
  if (d.length > ID_MAX) return { ok: false, problem: "too_long" };
  return { ok: true, phone: d, fixes };
}

export const PHONE_PROBLEM_TEXT: Record<PhoneProblem, { id: string; en: string }> = {
  empty: { id: "nomor HP kosong", en: "phone number is empty" },
  too_short: { id: "nomor HP kurang digit", en: "phone number is too short" },
  too_long: { id: "nomor HP kelebihan digit", en: "phone number is too long" },
  not_mobile: { id: "bukan nomor seluler (WhatsApp butuh 08xx)", en: "not a mobile number (WhatsApp needs 08xx)" },
  scientific: { id: "nomor rusak oleh Excel (6.28E+12) — digitnya hilang; ubah kolom jadi Teks lalu ketik ulang", en: "number corrupted by Excel (6.28E+12) — digits lost; set the column to Text and re-enter" },
};

export const PHONE_FIX_TEXT: Record<PhoneFix, { id: string; en: string }> = {
  excel_decimal: { id: "buntut .0 dari Excel dibuang", en: "removed Excel's trailing .0" },
  double_zero: { id: "nol ganda setelah 62 dibuang", en: "removed the extra 0 after 62" },
  intl_prefix: { id: "awalan 00 diganti kode negara", en: "replaced the 00 prefix" },
  missing_zero: { id: "nol depan yang hilang dikembalikan", en: "restored the missing leading 0" },
  multiple: { id: "dua nomor dalam satu sel — dipakai yang pertama", en: "two numbers in one cell — used the first" },
  junk: { id: "karakter asing dibersihkan", en: "stray characters removed" },
};

/** 6281234567890 → +62 812-3456-7890 — hanya untuk tampilan. */
export function displayWaPhone(phone: string): string {
  if (!phone.startsWith("62")) return "+" + phone;
  const rest = phone.slice(2);
  const parts = [rest.slice(0, 3), rest.slice(3, 7), rest.slice(7)].filter(Boolean);
  return "+62 " + parts.join("-");
}
