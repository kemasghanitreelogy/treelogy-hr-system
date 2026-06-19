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
}

interface SubRow {
  endpoint: string;
  p256dh: string;
  auth: string;
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

  let sent = 0;
  let failed = 0;
  const dead: string[] = [];
  await Promise.all(
    (subs as SubRow[]).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
        sent++;
      } catch (err) {
        failed++;
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.endpoint);
      }
    }),
  );
  if (dead.length) await admin.from("push_subscriptions").delete().in("endpoint", dead);

  return { sent, failed };
}
