/**
 * Bagian murni jalur bulk (tanpa jaringan / database) — diuji di
 * scripts/qa-wa-bulk.mts.
 *
 * Jalur bulk Qontak = unggah contact list (CSV), lalu SATU broadcast yang
 * memetakan variabel template ke NAMA KOLOM CSV: body [{key:"1", value:"resi"}].
 * Nama kolomnya sudah ada di `params` tiap penerima (buildDirectParameters
 * mengisi `value` = slotColumnName), jadi CSV dan pemetaan dibangun dari sana.
 */

export interface BulkRow {
  id: string;
  phone: string;
  name: string;
  params: unknown;
}

interface BodyParam { key: string; value: string; value_text: string }
interface DirectParams {
  body?: BodyParam[];
  buttons?: unknown[];
  header?: { format: string; params: { key: string; value: string }[] };
}

const asParams = (p: unknown): DirectParams => (p && typeof p === "object" ? (p as DirectParams) : {});

/** Template bertombol URL dinamis tetap lewat direct — pemetaan tombol ke
 *  kolom CSV di broadcast bulk belum terverifikasi dengan pengiriman nyata. */
export function bulkEligible(params: unknown[]): boolean {
  return params.every((p) => !asParams(p).buttons?.length);
}

/**
 * Satu nomor hanya boleh muncul SEKALI per contact list — dua resi untuk
 * pembeli yang sama dikirim di putaran berikutnya, tidak digabung/dibuang.
 */
export function pickRound<T extends { phone: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.phone) ? false : (seen.add(r.phone), true)));
}

function cell(v: string): string {
  const s = String(v ?? "").replace(/[\r\n]+/g, " ").trim();
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV contact list: phone_number, full_name, lalu satu kolom per variabel body. */
export function buildCsv(rows: BulkRow[]): string {
  const cols = (asParams(rows[0]?.params).body ?? []).map((b) => b.value);
  const lines = [["phone_number", "full_name", ...cols].join(",")];
  for (const r of rows) {
    const byCol = new Map((asParams(r.params).body ?? []).map((b) => [b.value, b.value_text]));
    lines.push([r.phone, cell(r.name || r.phone), ...cols.map((c) => cell(byCol.get(c) ?? ""))].join(","));
  }
  return lines.join("\n") + "\n";
}

/** `parameters` broadcast bulk: variabel → nama kolom; header media sama untuk semua. */
export function bulkParameters(rows: BulkRow[]) {
  const first = asParams(rows[0]?.params);
  const out: { body: { key: string; value: string; value_text: string }[]; header?: DirectParams["header"] } = {
    body: (first.body ?? []).map((b) => ({ key: b.key, value: b.value, value_text: b.value_text })),
  };
  if (first.header) out.header = first.header;
  return out;
}
