"use client";

import { isValidEmail, normalizeEmail, splitTags } from "./validate";

/**
 * Pengurai berkas impor (CSV / XLSX) — berjalan di browser.
 *
 * Berkasnya tidak pernah diunggah utuh: yang dikirim ke server adalah baris
 * yang sudah bersih, per potongan. Jadi pratinjau di layar = persis apa yang
 * akan dikirim, dan baris bermasalah ditandai SEBELUM satu pun customer
 * dibuat di Shopify.
 */

export interface ImportRow {
  /** Nomor baris di berkas (1-based, termasuk judul) — untuk ditunjuk balik. */
  line: number;
  email: string;
  firstName: string;
  lastName: string;
  tags: string[];
  /** Kode masalah; baris dengan masalah tidak dikirim. */
  problem: "invalid_email" | "duplicate" | null;
}

export interface ParsedImport {
  rows: ImportRow[];
  /** Kolom yang berhasil dikenali dari baris judul. */
  columns: { email: number; firstName: number | null; lastName: number | null; fullName: number | null; tags: number | null };
  hadHeader: boolean;
}

export type ImportParseCode = "empty" | "no_email_column" | "unsupported";

export class ImportParseError extends Error {
  code: ImportParseCode;
  constructor(code: ImportParseCode) {
    super(code);
    this.code = code;
  }
}

/** Contoh berkas yang bisa diunduh — judul kolom persis yang dikenali. */
export function templateCsv(): string {
  return [
    "email,nama_depan,nama_belakang",
    "budi@example.com,Budi,Santoso",
    "sari@example.com,Sari,",
  ].join("\n");
}

// ── CSV ──────────────────────────────────────────────────────────────

/** Pemisah dideteksi dari baris pertama: koma, titik-koma (Excel ID), atau tab. */
function detectDelimiter(firstLine: string): string {
  const counts = [",", ";", "\t"].map((d) => ({ d, n: firstLine.split(d).length - 1 }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ",";
}

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const delim = detectDelimiter(src.split(/\r?\n/)[0] ?? "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === delim) { row.push(cell); cell = ""; continue; }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row); row = [];
      continue;
    }
    cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// ── XLSX ─────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

function cellText(v: any): string {
  if (v == null) return "";
  if (typeof v === "object") {
    // ExcelJS: hyperlink {text, hyperlink}, rich text {richText:[{text}]}, formula {result}
    if ("richText" in v && Array.isArray(v.richText)) return v.richText.map((p: any) => p.text ?? "").join("");
    if ("text" in v) return cellText(v.text);
    if ("result" in v) return cellText(v.result);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v);
}

export async function parseXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  // ExcelJS dimuat saat dibutuhkan saja — bundel utama tidak menanggungnya.
  // Bentuk interop yang sama dengan attendance-xlsx: tergantung bundler, kelasnya
  // ada di `default` atau langsung di namespace — dan tanpa ini QA di Node
  // gagal "Workbook is not a constructor".
  const mod = await import("exceljs");
  const ExcelJS = mod.default ?? (mod as unknown as typeof mod.default);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    const vals: string[] = [];
    // row.values 1-based; kolom kosong di tengah tetap dijaga posisinya.
    const raw = row.values as any[];
    for (let c = 1; c < raw.length; c++) vals[c - 1] = cellText(raw[c]).trim();
    rows[n - 1] = vals;
  });
  // Baris kosong di tengah sheet dilewati ExcelJS dan meninggalkan lubang.
  // Lubangnya diisi [] (bukan dibuang) supaya nomor baris di pratinjau tetap
  // nomor baris yang dilihat orang di Excel.
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

// ── Pemetaan kolom ───────────────────────────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const HEADERS = {
  email: new Set(["email", "emailaddress", "surel", "alamatemail", "mail"]),
  firstName: new Set(["firstname", "namadepan", "first", "givenname", "depan"]),
  lastName: new Set(["lastname", "namabelakang", "last", "surname", "familyname", "belakang"]),
  fullName: new Set(["nama", "name", "namalengkap", "fullname", "customer", "pelanggan"]),
  tags: new Set(["tags", "tag", "label", "penanda"]),
};

function findCol(header: string[], set: Set<string>): number | null {
  const i = header.findIndex((h) => set.has(norm(h)));
  return i >= 0 ? i : null;
}

export function gridToImport(grid: string[][]): ParsedImport {
  const clean = grid.map((r) => (r ?? []).map((c) => String(c ?? "").trim()));
  const nonEmpty = clean.map((r, i) => ({ r, i })).filter(({ r }) => r.some(Boolean));
  if (!nonEmpty.length) throw new ImportParseError("empty");

  const first = nonEmpty[0].r;
  const hadHeader = !first.some((c) => c.includes("@"));
  let columns: ParsedImport["columns"];
  let startIdx = 0;

  if (hadHeader) {
    const email = findCol(first, HEADERS.email);
    if (email === null) throw new ImportParseError("no_email_column");
    columns = {
      email,
      firstName: findCol(first, HEADERS.firstName),
      lastName: findCol(first, HEADERS.lastName),
      fullName: findCol(first, HEADERS.fullName),
      tags: findCol(first, HEADERS.tags),
    };
    startIdx = 1;
  } else {
    // Tanpa judul: pakai urutan template — email, nama depan, nama belakang, tags.
    // Kalau emailnya bukan di kolom pertama, cari kolom yang berisi "@".
    const email = first.findIndex((c) => c.includes("@"));
    columns = {
      email,
      firstName: first.length > email + 1 ? email + 1 : null,
      lastName: first.length > email + 2 ? email + 2 : null,
      fullName: null,
      tags: first.length > email + 3 ? email + 3 : null,
    };
  }

  const seen = new Set<string>();
  const rows: ImportRow[] = [];
  for (const { r, i } of nonEmpty.slice(startIdx)) {
    const email = normalizeEmail(r[columns.email]);
    let firstName = columns.firstName !== null ? r[columns.firstName] ?? "" : "";
    let lastName = columns.lastName !== null ? r[columns.lastName] ?? "" : "";
    if (!firstName && !lastName && columns.fullName !== null) {
      // Satu kolom nama → kata pertama jadi nama depan, sisanya nama belakang.
      const parts = (r[columns.fullName] ?? "").split(/\s+/).filter(Boolean);
      firstName = parts[0] ?? "";
      lastName = parts.slice(1).join(" ");
    }
    const tags = columns.tags !== null ? splitTags(r[columns.tags]) : [];

    let problem: ImportRow["problem"] = null;
    if (!isValidEmail(email)) problem = "invalid_email";
    else if (seen.has(email)) problem = "duplicate";
    else seen.add(email);

    rows.push({ line: i + 1, email, firstName, lastName, tags, problem });
  }
  return { rows, columns, hadHeader };
}

export async function parseImportFile(file: File): Promise<ParsedImport> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
    return gridToImport(await parseXlsx(await file.arrayBuffer()));
  }
  if (name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".tsv")) {
    return gridToImport(parseCsv(await file.text()));
  }
  // .xls lama tidak didukung ExcelJS; minta disimpan ulang sebagai .xlsx/.csv.
  throw new ImportParseError("unsupported");
}
