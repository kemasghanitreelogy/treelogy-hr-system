import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { VAPID_PRIVATE, VAPID_PUBLIC, VAPID_SUBJECT, isPushConfigured } from "./config";

if (isPushConfigured) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  /** Time-to-live (detik). Pendek untuk reminder, panjang untuk approval. */
  ttl?: number;
}

interface SubRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

const DEFAULT_TTL = 60 * 60 * 24; // 1 hari (approval/umum)
// Kode yang layak dicoba ulang (sesaat); 404/410 = langganan mati (jangan retry).
const TRANSIENT = new Set([429, 500, 502, 503, 504]);

/** Kirim 1 push dengan retry untuk kegagalan sesaat (429/5xx/jaringan). */
async function sendWithRetry(
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  body: string,
  options: { TTL: number; urgency: "high" },
  attempts = 3,
): Promise<{ ok: boolean; code?: number }> {
  for (let i = 0; i < attempts; i++) {
    try {
      await webpush.sendNotification(sub, body, options);
      return { ok: true };
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) return { ok: false, code }; // mati → tak usah retry
      const transient = code == null || TRANSIENT.has(code);
      if (!transient || i === attempts - 1) return { ok: false, code };
      await new Promise((r) => setTimeout(r, 300 * 3 ** i)); // 300ms, 900ms
    }
  }
  return { ok: false };
}

/**
 * Send a web push to every registered device of the given employees, reading
 * the persisted `push_subscriptions` table (works from cron / any invocation).
 * Expired endpoints (404/410) are pruned. Pass an admin (service-role) client.
 */
export async function sendPushToEmployees(
  admin: SupabaseClient,
  employeeIds: string[],
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  const targets = [...new Set(employeeIds.filter(Boolean))];
  if (!isPushConfigured || targets.length === 0) return { sent: 0, failed: 0 };

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("employee_id", targets);
  if (!subs?.length) return { sent: 0, failed: 0 };

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/dashboard",
    tag: payload.tag || "treelogy-hr",
    icon: "/icons/icon-192.png",
    badge: "/icons/favicon-48.png",
  });

  // urgency "high" → FCM/APNs mengirim segera & membangunkan device meski layar
  // mati / app tertutup (tanpa ini, Android Doze men-batch pesan sampai app dibuka).
  const options = { TTL: payload.ttl ?? DEFAULT_TTL, urgency: "high" as const };

  let sent = 0;
  let failed = 0;
  let lastCode: number | undefined;
  const dead: string[] = [];
  await Promise.all(
    (subs as SubRow[]).map(async (s) => {
      const res = await sendWithRetry({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, options);
      if (res.ok) {
        sent++;
      } else {
        failed++;
        lastCode = res.code ?? lastCode;
        if (res.code === 404 || res.code === 410) dead.push(s.endpoint);
      }
    }),
  );
  if (dead.length) await admin.from("push_subscriptions").delete().in("endpoint", dead);

  // Observability: jejak durable (push_log) + log Vercel saat ada kegagalan.
  if (failed > 0) console.warn(`[push] tag=${payload.tag ?? "-"} sent=${sent} failed=${failed} code=${lastCode ?? "-"}`);
  try {
    await admin.from("push_log").insert({
      employee_id: targets.length === 1 ? targets[0] : null,
      tag: payload.tag ?? null,
      title: payload.title,
      sent,
      failed,
      error: lastCode != null ? String(lastCode) : null,
    });
  } catch {
    /* logging tidak boleh mengganggu pengiriman */
  }

  return { sent, failed };
}
