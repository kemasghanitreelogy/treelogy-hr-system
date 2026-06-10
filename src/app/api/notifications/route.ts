import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Mark all of the caller's notifications as read. RLS scopes this to the user. */
export async function PATCH() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ ok: true });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await supabase.from("notifications").update({ read: true }).eq("read", false);
  return NextResponse.json({ ok: true });
}
