import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listChannels, listTemplates } from "./client";
import { normalizeWaPhone, PHONE_PROBLEM_TEXT } from "./phone";
import { buildDirectParameters, humanTemplateName, missingSlots } from "./template";

/** Batas per kampanye — 5.000 pesan via direct ≈ 1,5 jam; lebih dari itu
 *  seharusnya lewat bulk, bukan antrean ini. */
export const MAX_RECIPIENTS = 5000;
/** Resi yang sudah dikirimi dalam jendela ini otomatis dilewati. */
const RESEND_GUARD_DAYS = 14;

export interface RecipientInput {
  phone: string;
  name: string;
  awb?: string;
  /** Nilai per slot: "body:1" → "…", "button:0" → "…". */
  vals: Record<string, string>;
}

export interface CreateInput {
  source: "receipt" | "upload";
  templateId: string;
  name?: string;
  media?: { url: string; filename: string } | null;
  recipients: RecipientInput[];
}

export type CreateError =
  | "invalid_input" | "template_not_found" | "template_unsupported" | "media_required"
  | "no_channel" | "too_many_recipients" | "no_valid_recipients";

export interface Rejected {
  index: number;
  name: string;
  phone: string;
  reason: string;
}

export interface CreateResult {
  id: string;
  queued: number;
  skipped: number;
  rejected: Rejected[];
}

function witaDate(): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", day: "numeric", month: "long", year: "numeric" }).format(new Date());
}

export function parseCreateInput(body: unknown): CreateInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.source !== "receipt" && b.source !== "upload") return null;
  if (typeof b.templateId !== "string" || !b.templateId) return null;
  if (!Array.isArray(b.recipients)) return null;
  const recipients: RecipientInput[] = [];
  for (const r of b.recipients) {
    if (!r || typeof r !== "object") return null;
    const x = r as Record<string, unknown>;
    const vals: Record<string, string> = {};
    if (x.vals && typeof x.vals === "object") {
      for (const [k, v] of Object.entries(x.vals as Record<string, unknown>)) {
        if (/^(body|button):\d+$/.test(k)) vals[k] = String(v ?? "").slice(0, 1000);
      }
    }
    recipients.push({
      phone: String(x.phone ?? "").slice(0, 40),
      name: String(x.name ?? "").trim().slice(0, 120),
      awb: x.awb ? String(x.awb).trim().toUpperCase().slice(0, 60) : "",
      vals,
    });
  }
  let media: CreateInput["media"] = null;
  if (b.media && typeof b.media === "object") {
    const m = b.media as Record<string, unknown>;
    if (typeof m.url === "string" && /^https:\/\//.test(m.url)) {
      media = { url: m.url.slice(0, 1000), filename: String(m.filename ?? "").slice(0, 200) };
    }
  }
  return {
    source: b.source,
    templateId: b.templateId,
    name: typeof b.name === "string" ? b.name.trim().slice(0, 120) : undefined,
    media,
    recipients,
  };
}

/**
 * Buat kampanye DRAFT. Belum ada yang terkirim — pratinjau di layar dibaca
 * dari baris yang tersimpan di sini, jadi yang dilihat = yang akan dikirim.
 */
export async function createCampaign(
  db: SupabaseClient,
  input: CreateInput,
  me: { id: string; name: string },
): Promise<{ ok: true; result: CreateResult } | { ok: false; error: CreateError }> {
  if (input.recipients.length > MAX_RECIPIENTS) return { ok: false, error: "too_many_recipients" };

  const tpl = (await listTemplates()).find((t) => t.id === input.templateId || t.name === input.templateId);
  if (!tpl) return { ok: false, error: "template_not_found" };
  if (tpl.unsupported) return { ok: false, error: "template_unsupported" };
  if (tpl.mediaHeader && !input.media?.url) return { ok: false, error: "media_required" };
  const channel = (await listChannels())[0];
  if (!channel) return { ok: false, error: "no_channel" };

  const rejected: Rejected[] = [];
  const seen = new Set<string>();
  const rows: { phone: string; name: string; awb: string; vals: Record<string, string>; params: unknown }[] = [];

  input.recipients.forEach((r, index) => {
    const p = normalizeWaPhone(r.phone);
    if (!p.ok) {
      rejected.push({ index, name: r.name, phone: r.phone, reason: PHONE_PROBLEM_TEXT[p.problem].id });
      return;
    }
    const kosong = missingSlots(tpl, r.vals);
    if (kosong.length) {
      rejected.push({ index, name: r.name, phone: r.phone, reason: `variabel kosong: ${kosong.map((s) => s.context || `{{${s.key}}}`).join(", ")}` });
      return;
    }
    const key = `${p.phone}|${r.awb ?? ""}`;
    if (seen.has(key)) {
      rejected.push({ index, name: r.name, phone: r.phone, reason: "duplikat di daftar ini" });
      return;
    }
    seen.add(key);
    rows.push({ phone: p.phone, name: r.name, awb: r.awb ?? "", vals: r.vals, params: buildDirectParameters(tpl, r.vals, input.media) });
  });
  if (!rows.length) return { ok: false, error: "no_valid_recipients" };

  // Anti blast ganda: resi yang SUDAH terkirim dalam 14 hari dilewati —
  // melindungi dari klik dua kali dan batch label yang dibaca ulang. Pesan
  // yang DITOLAK WhatsApp tidak dihitung terkirim: resinya boleh dikirim lagi.
  const awbs = [...new Set(rows.map((r) => r.awb).filter(Boolean))];
  const sentBefore = new Map<string, string>();
  const since = new Date(Date.now() - RESEND_GUARD_DAYS * 86400_000).toISOString();
  for (let i = 0; i < awbs.length; i += 200) {
    const { data } = await db
      .from("wa_campaign_recipients")
      .select("awb, sent_at, delivery_status")
      .eq("status", "sent")
      .gte("sent_at", since)
      .in("awb", awbs.slice(i, i + 200));
    for (const d of data ?? []) if (d.delivery_status !== "failed") sentBefore.set(d.awb as string, d.sent_at as string);
  }

  const { data: camp, error } = await db
    .from("wa_campaigns")
    .insert({
      name: input.name || `${humanTemplateName(tpl.name)} — ${witaDate()}`,
      source: input.source,
      template_id: tpl.id,
      template_name: tpl.name,
      language: tpl.language,
      channel_integration_id: channel.id,
      channel_phone: channel.phone,
      template_body: tpl.body,
      engine: "direct",
      status: "draft",
      created_by: me.id,
      created_by_name: me.name,
    })
    .select("id")
    .single();
  if (error || !camp) throw new Error(error?.message ?? "insert_failed");

  let skipped = 0;
  const payload = rows.map((r, seq) => {
    const dulu = r.awb ? sentBefore.get(r.awb) : undefined;
    if (dulu) skipped++;
    return {
      campaign_id: camp.id,
      seq,
      phone: r.phone,
      name: r.name,
      awb: r.awb,
      vals: r.vals,
      params: r.params,
      status: dulu ? "skipped" : "queued",
      last_error: dulu ? `already_sent:${dulu}` : null,
    };
  });
  for (let i = 0; i < payload.length; i += 500) {
    const { error: e } = await db.from("wa_campaign_recipients").insert(payload.slice(i, i + 500));
    if (e) {
      await db.from("wa_campaigns").delete().eq("id", camp.id);
      throw new Error(e.message);
    }
  }

  // Draft yang ditinggal (tidak pernah dikirim) dibersihkan setelah sehari.
  await db.from("wa_campaigns").delete().eq("status", "draft").lt("created_at", new Date(Date.now() - 86400_000).toISOString());

  return { ok: true, result: { id: camp.id, queued: payload.length - skipped, skipped, rejected } };
}
