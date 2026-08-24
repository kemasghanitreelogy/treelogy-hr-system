import { NextResponse } from "next/server";
import { can, getSessionUser } from "@/lib/auth";
import { readState } from "./state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Muat ulang isi layar (dipanggil sesudah tarik / sesudah ubah peta produk). */
export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(me, "reviews.view")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await readState());
}
