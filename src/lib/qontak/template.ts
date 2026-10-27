/**
 * Model template WhatsApp Qontak — dipakai browser (pratinjau) DAN server
 * (membangun payload). Satu `renderPreview` untuk kedua sisi: yang dilihat
 * orang sebelum menekan "Kirim" harus persis yang diterima pelanggan.
 */

export type SlotMeaning = "name" | "awb" | "custom";

export interface TemplateSlot {
  /** Nomor variabel apa adanya: "1", "2", … */
  key: string;
  part: "body" | "button";
  /** Indeks tombol (hanya part=button). */
  buttonIndex?: number;
  /** Tebakan makna dari teks di sekitarnya — dasar pemetaan otomatis. */
  meaning: SlotMeaning;
  /** Potongan teks sebelum variabel, untuk label di formulir ("No. resi:"). */
  context: string;
}

export interface WaTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  body: string;
  header: { format: string; text: string | null } | null;
  footer: string | null;
  buttons: { type: string; text: string; url: string | null }[];
  slots: TemplateSlot[];
  /** Header berupa media (IMAGE/VIDEO/DOCUMENT) → butuh URL berkas. */
  mediaHeader: "IMAGE" | "VIDEO" | "DOCUMENT" | null;
  /** Alasan template tidak bisa dikirim dari sini; null = bisa. */
  unsupported: string | null;
}

const VAR_RE = /\{\{\s*(\d+)\s*\}\}/g;
/** Versi tanpa flag g untuk .test() — regex global menyimpan lastIndex. */
const HAS_VAR = /\{\{\s*\d+\s*\}\}/;

/**
 * Tebak makna satu variabel dari teks tepat sebelumnya pada baris yang sama.
 *
 * Inilah yang membuat urutan variabel per template tidak pernah tertukar:
 * blast_resi_lion memakai {{1}}=resi, {{2}}=nama, sedangkan blast_resi_jnt
 * kebalikannya. Menebak dari URUTAN akan salah di salah satunya; menebak dari
 * KALIMATNYA ("No. resi: {{1}}", "Halo Kak {{2}}") benar di keduanya.
 */
export function guessMeaning(before: string): SlotMeaning {
  // Tanda format WhatsApp (*tebal*, _miring_, ~coret~) dibuang dulu —
  // "*Hey **{{1}}**" tetap sapaan.
  const s = before.toLowerCase().replace(/[*_~]/g, "").slice(-40);
  if (/(resi|awb|tracking|lacak|no\.?\s*pengiriman)\s*[:#-]?\s*$/.test(s)) return "awb";
  if (/(halo|hallo|hai|hi|hey|hello|dear|kak|kakak|bapak|ibu|bpk|sdr|mas|mbak|nama)\s*[,:]?\s*$/.test(s)) return "name";
  return "custom";
}

function slotsFromText(text: string, part: "body"): TemplateSlot[] {
  const out: TemplateSlot[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(VAR_RE)) {
    const key = m[1];
    if (seen.has(key)) continue;
    seen.add(key);
    const start = m.index ?? 0;
    const line = text.slice(text.lastIndexOf("\n", start - 1) + 1, start);
    out.push({ key, part, meaning: guessMeaning(line), context: line.trim().slice(-40) });
  }
  return out.sort((a, b) => Number(a.key) - Number(b.key));
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Bentuk mentah dari GET /templates/whatsapp → model kita. */
export function toWaTemplate(raw: any): WaTemplate {
  const body = String(raw?.body ?? "");
  const header = raw?.header
    ? { format: String(raw.header.format ?? "TEXT").toUpperCase(), text: raw.header.text ?? null }
    : null;
  const buttons = Array.isArray(raw?.buttons)
    ? raw.buttons.map((b: any) => ({ type: String(b?.type ?? ""), text: String(b?.text ?? ""), url: b?.url ?? null }))
    : [];

  const slots = slotsFromText(body, "body");
  buttons.forEach((b: { type: string; url: string | null }, i: number) => {
    if (b.type.toUpperCase() === "URL" && b.url && HAS_VAR.test(b.url)) {
      slots.push({ key: "1", part: "button", buttonIndex: i, meaning: "custom", context: b.url.replace(VAR_RE, "").slice(-40) });
    }
  });

  const fmt = header?.format ?? null;
  const mediaHeader = fmt === "IMAGE" || fmt === "VIDEO" || fmt === "DOCUMENT" ? fmt : null;

  let unsupported: string | null = null;
  // Skema direct Qontak hanya menerima header media; header TEKS yang
  // bervariabel tidak punya tempat di payload — lebih baik ditolak terang-
  // terangan daripada terkirim dengan "{{1}}" mentah di judul pesan.
  if (fmt === "TEXT" && header?.text && HAS_VAR.test(header.text)) unsupported = "header_text_variable";
  if (!["en", "id"].includes(String(raw?.language ?? ""))) unsupported = unsupported ?? "language";

  return {
    id: String(raw?.id ?? ""),
    name: String(raw?.name ?? ""),
    language: String(raw?.language ?? "id"),
    category: String(raw?.category ?? ""),
    body,
    header,
    footer: raw?.footer ?? null,
    buttons,
    slots,
    mediaHeader,
    unsupported,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** "blast_resi_lion" → "Blast resi lion" */
export function humanTemplateName(name: string): string {
  const s = name.replace(/_hsm_chat_expired$/, "").replace(/_+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Kunci nilai per slot: "body:1", "button:0". */
export const slotId = (s: TemplateSlot) => (s.part === "button" ? `button:${s.buttonIndex}` : `body:${s.key}`);

/** Isi variabel → teks pesan jadi. Variabel kosong dibiarkan terlihat ⟨…⟩
 *  supaya kekurangan langsung tampak di pratinjau, bukan terkirim kosong. */
export function renderPreview(tpl: Pick<WaTemplate, "body">, values: Record<string, string>): string {
  return tpl.body.replace(VAR_RE, (_, k: string) => {
    const v = (values[`body:${k}`] ?? "").trim();
    return v || `⟨${k}⟩`;
  });
}

/** Slot yang kosong untuk satu penerima — penerima seperti ini tidak dikirim. */
export function missingSlots(tpl: Pick<WaTemplate, "slots">, values: Record<string, string>): TemplateSlot[] {
  return tpl.slots.filter((s) => !(values[slotId(s)] ?? "").trim());
}

/** Label kolom yang dikirim sebagai `value` di parameter body (dipakai Qontak
 *  untuk laporan) — makna slot dalam bahasa manusia. */
export function slotColumnName(s: TemplateSlot): string {
  if (s.meaning === "name") return "customer_name";
  if (s.meaning === "awb") return "resi";
  return s.part === "button" ? `button_${s.buttonIndex}` : `var_${s.key}`;
}

/** Payload `parameters` untuk POST /broadcasts/whatsapp/direct. */
export function buildDirectParameters(
  tpl: WaTemplate,
  values: Record<string, string>,
  media?: { url: string; filename: string } | null,
) {
  const params: {
    body?: { key: string; value_text: string; value: string }[];
    buttons?: { index: string; type: string; value: string }[];
    header?: { format: string; params: { key: string; value: string }[] };
  } = {};
  const body = tpl.slots.filter((s) => s.part === "body");
  if (body.length) {
    params.body = body.map((s) => ({ key: s.key, value_text: (values[slotId(s)] ?? "").trim(), value: slotColumnName(s) }));
  }
  const btn = tpl.slots.filter((s) => s.part === "button");
  if (btn.length) {
    params.buttons = btn.map((s) => ({ index: String(s.buttonIndex), type: "url", value: (values[slotId(s)] ?? "").trim() }));
  }
  if (tpl.mediaHeader && media?.url) {
    params.header = {
      format: tpl.mediaHeader,
      params: [
        { key: "url", value: media.url },
        { key: "filename", value: media.filename || media.url.split("/").pop() || "file" },
      ],
    };
  }
  return params;
}

/** Template resi per kurir — nama di Qontak, dicari berdasarkan nama supaya
 *  tidak bergantung pada id yang berubah bila template dibuat ulang. */
export const RESI_TEMPLATE_BY_COURIER: Record<string, string> = {
  JNT: "blast_resi_jnt",
  LION: "blast_resi_lion",
  JNE: "blast_resi_jne",
};

/** Nama kurir hasil baca label → kunci RESI_TEMPLATE_BY_COURIER. */
export function courierKey(courier: string | null | undefined): string | null {
  const c = (courier ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!c) return null;
  if (c.includes("JT") || c.includes("JNT") || c.includes("JET")) return "JNT";
  if (c.includes("LION")) return "LION";
  if (c.includes("JNE")) return "JNE";
  return null;
}
