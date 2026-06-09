import { NextResponse } from "next/server";
import webpush from "web-push";
import { VAPID_PRIVATE, VAPID_PUBLIC, VAPID_SUBJECT, isPushConfigured } from "@/lib/push/config";
import { listSubscriptions, removeSubscription } from "@/lib/push/store";

export const runtime = "nodejs";

if (isPushConfigured) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

export async function POST(req: Request) {
  if (!isPushConfigured) {
    return NextResponse.json({ error: "push_not_configured" }, { status: 503 });
  }

  let body: { title?: string; body?: string; url?: string; userId?: string; tag?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const payload = JSON.stringify({
    title: body.title || "Treelogy HR",
    body: body.body || "Anda punya notifikasi baru.",
    url: body.url || "/dashboard",
    tag: body.tag || "treelogy-hr",
    icon: "/icons/icon-192.png",
    badge: "/icons/favicon-48.png",
  });

  const subs = listSubscriptions(body.userId);
  if (subs.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, message: "no_subscriptions" });
  }

  let sent = 0;
  let failed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(s.subscription, payload);
        sent++;
      } catch (err) {
        failed++;
        const code = (err as { statusCode?: number }).statusCode;
        // 404/410 → subscription expired; remove it.
        if (code === 404 || code === 410) removeSubscription(s.endpoint);
      }
    }),
  );

  return NextResponse.json({ sent, failed });
}
