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

  // Kode khusus, bukan `not_configured` yang umum: keadaan ini punya satu
  // penyebab yang sangat spesifik dan satu tindakan yang jelas, dan pesan
  // samar membuatnya tertukar dengan "ordernya memang tidak ada".
  if (!process.env.STORE_NAME || !process.env.ADMIN_API_KEY) {
    return NextResponse.json({ error: "shopify_not_configured" }, { status: 503 });
  }

  try {
    const map = await matchAll(inputs);
    const matches: Record<number, unknown> = {};
    for (const [page, m] of map) matches[page] = m;
    return NextResponse.json({ matches });
  } catch (e) {
    // Diteruskan apa adanya: "izin token tidak cukup" adalah masalah yang bisa
    // dibereskan orang, sedangkan "Shopify sedang bermasalah" hanya bisa
    // ditunggu. Menyamakan keduanya membuat yang pertama tak pernah ketahuan.
    const forbidden = e instanceof Error && e.message === "shopify_forbidden";
    return NextResponse.json(
      { error: forbidden ? "shopify_forbidden" : "shopify_failed" },
      { status: forbidden ? 403 : 502 },
    );
  }
}
