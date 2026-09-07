import { NextResponse } from "next/server";
import { can, getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { grantOne } from "@/lib/eligible-customers/grant";
import type { GrantInput } from "@/lib/eligible-customers/types";
import { readState } from "./state";

export const runtime = "nodejs";
export const maxDuration = 60;

async function guard(perm: string) {
  const me = await getSessionUser();
  if (!me) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (!can(me, perm)) return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  const supabase = await createClient();
  if (!supabase) return { error: NextResponse.json({ error: "unavailable" }, { status: 503 }) };
  return { me, supabase };
}

export async function GET() {
  const { error } = await guard("customers.view");
  if (error) return error;
  return NextResponse.json({ state: await readState() });
}

/** Status HTTP untuk kegagalan langkah Shopify — seeding yang gagal BUKAN
 *  kegagalan permintaan (customer-nya jadi), ia dibawa di customer.seedStatus. */
function statusFor(code: string): number {
  switch (code) {
    case "email_required":
    case "invalid_email":
    case "invalid_date":
      return 400;
    case "shopify_user_error":
      return 422;
    case "shopify_not_configured":
      return 503;
    case "shopify_forbidden_customers":
      return 502;
    case "save_failed":
      return 500;
    default:
      return 502;
  }
}

/** Grant satu pelanggan (formulir satuan / tombol ulangi). */
export async function POST(req: Request) {
  const { me, supabase, error } = await guard("customers.grant");
  if (error) return error;

  const body = (await req.json().catch(() => null)) as GrantInput | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid_json" }, { status: 400 });

  const result = await grantOne(supabase!, me!, body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, detail: result.detail }, { status: statusFor(result.error ?? "") });
  }
  return NextResponse.json({ customer: result.customer, state: await readState() }, { status: 201 });
}
