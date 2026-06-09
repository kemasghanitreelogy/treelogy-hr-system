import { NextResponse } from "next/server";
import type { PushSubscription as WebPushSubscription } from "web-push";
import { isPushConfigured } from "@/lib/push/config";
import { removeSubscription, saveSubscription } from "@/lib/push/store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isPushConfigured) {
    return NextResponse.json({ error: "push_not_configured" }, { status: 503 });
  }
  let body: { subscription?: WebPushSubscription; userId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.subscription?.endpoint) {
    return NextResponse.json({ error: "missing_subscription" }, { status: 400 });
  }
  saveSubscription(body.subscription, body.userId ?? null);
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
  removeSubscription(body.endpoint);
  return NextResponse.json({ ok: true });
}
