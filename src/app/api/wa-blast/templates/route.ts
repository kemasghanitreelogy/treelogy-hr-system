import { NextResponse } from "next/server";
import { bulkAvailable, listChannels, listTemplates } from "@/lib/qontak/client";
import { guard, qontakFailure } from "../guard";

export const runtime = "nodejs";

/** Template APPROVED + slot & makna tebakannya, channel aktif, dan apakah
 *  jalur bulk (cepat) sudah terbuka untuk kredensial ini. */
export async function GET(req: Request) {
  const g = await guard();
  if (!g.ok) return g.res;
  const force = new URL(req.url).searchParams.get("refresh") === "1";
  try {
    const [templates, channels, bulk] = await Promise.all([listTemplates(force), listChannels(), bulkAvailable()]);
    return NextResponse.json({ templates, channel: channels[0] ?? null, bulk });
  } catch (e) {
    return qontakFailure(e);
  }
}
