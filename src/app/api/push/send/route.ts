import { NextResponse } from "next/server";
import { isPushConfigured } from "@/lib/push/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth";
import { sendPushToEmployees } from "@/lib/push/send";

export const runtime = "nodejs";

/** Send a test push to the signed-in user's own registered devices. */
export async function POST(req: Request) {
  if (!isPushConfigured) {
    return NextResponse.json({ error: "push_not_configured" }, { status: 503 });
  }

  const user = await getSessionUser();
  if (!user?.employeeId) {
    return NextResponse.json({ sent: 0, failed: 0, message: "no_subscriptions" });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  let body: { title?: string; body?: string; url?: string; tag?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const result = await sendPushToEmployees(admin, [user.employeeId], {
    title: body.title || "Treelogy HR",
    body: body.body || "Anda punya notifikasi baru.",
    url: body.url || "/dashboard",
    tag: body.tag || "treelogy-hr",
  });

  return NextResponse.json(result);
}
