import { NextResponse } from "next/server";
import { can, getSessionUser } from "@/lib/auth";
import { matchAll, warmPool, type MatchInput } from "@/lib/receipt/shopify";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Satu-satunya endpoint yang menyentuh token Admin Shopify.
 *
 * OCR-nya jalan di browser; route ini hanya mencocokkan penerima hasil OCR ke
 * order Shopify untuk menarik nomor HP-nya. Permintaan & jawabannya kecil
 * (beberapa KB), jadi ringan di serverless — berkas resinya tidak pernah lewat
 * sini. Endpoint ini bisa memunculkan nomor telepon pelanggan, jadi dipagari
 * izin `receipt.view` seperti menunya.
 */
export async function POST(req: Request) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(me, "receipt.view")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: { inputs?: MatchInput[]; warm?: boolean; shipDate?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Pemanasan: klien memanggilnya begitu tanggal kirim halaman pertama
  // terbaca, lalu lanjut membaca sisa halaman. Saat hasil pembacaan siap,
  // ongkos jaringan ke Shopify sudah habis di belakang layar.
  if (body?.warm && typeof body.shipDate === "string") {
    const size = await warmPool(body.shipDate);
    return NextResponse.json({ warmed: size });
  }

  const inputs = Array.isArray(body?.inputs) ? body.inputs : [];
  if (!inputs.length) return NextResponse.json({ matches: {} });
  if (inputs.length > 300) return NextResponse.json({ error: "too_many_pages" }, { status: 400 });

  if (!process.env.STORE_NAME || !process.env.ADMIN_API_KEY) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  try {
    const map = await matchAll(inputs);
    const matches: Record<number, unknown> = {};
    for (const [page, m] of map) matches[page] = m;
    return NextResponse.json({ matches });
  } catch {
    return NextResponse.json({ error: "shopify_failed" }, { status: 502 });
  }
}
