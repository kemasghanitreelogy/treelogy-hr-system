import { NextResponse } from "next/server";
import type { PushSubscription as WebPushSubscription } from "web-push";
import { isPushConfigured } from "@/lib/push/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

/** Persist the device's push subscription, tied to the signed-in user/employee. */
export async function POST(req: Request) {
  if (!isPushConfigured) {
    return NextResponse.json({ error: "push_not_configured" }, { status: 503 });
  }
  let body: { subscription?: WebPushSubscription };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const sub = body.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: "missing_subscription" }, { status: 400 });
  }

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const { error } = await admin.from("push_subscriptions").upsert(
    {
      employee_id: user.employeeId,
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_agent: req.headers.get("user-agent"),
    },
    { onConflict: "endpoint" },
  );
  if (error) return NextResponse.json({ error: "save_failed" }, { status: 500 });

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: Request) {
  let body: { endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.endpoint) {
    return NextResponse.json({ error: "missing_endpoint" }, { status: 400 });
  }
  const admin = createAdminClient();
  if (admin) await admin.from("push_subscriptions").delete().eq("endpoint", body.endpoint);
  return NextResponse.json({ ok: true });
}
