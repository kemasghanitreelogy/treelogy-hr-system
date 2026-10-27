import { NextResponse } from "next/server";
import { can, getSessionUser } from "@/lib/auth";
import { matchAll, matchManual, searchOrders, suggestOrders, warmPool, type MatchInput } from "@/lib/receipt/shopify";

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

  let body: {
    inputs?: MatchInput[];
    warm?: boolean;
    shipDate?: string;
    manual?: { input?: MatchInput; claimed?: unknown; poolDate?: unknown };
    suggest?: { input?: MatchInput; poolDate?: unknown };
    search?: { q?: unknown };
  };
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

  // Kode khusus, bukan `not_configured` yang umum: keadaan ini punya satu
  // penyebab yang sangat spesifik dan satu tindakan yang jelas, dan pesan
  // samar membuatnya tertukar dengan "ordernya memang tidak ada".
  const configured = Boolean(process.env.STORE_NAME && process.env.ADMIN_API_KEY);

  const gagal = (e: unknown) => {
    const forbidden = e instanceof Error && e.message === "shopify_forbidden";
    return NextResponse.json(
      { error: forbidden ? "shopify_forbidden" : "shopify_failed" },
      { status: forbidden ? 403 : 502 },
    );
  };

  // Rekomendasi order untuk kartu yang DINYATAKAN order Shopify oleh pemakai,
  // walau data labelnya tidak lolos penjaga ketat. Hanya mengurutkan — yang
  // memasang tetap manusia.
  if (body?.suggest) {
    const inp = body.suggest.input;
    if (!inp || !Number.isInteger(inp.page)) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    if (!configured) return NextResponse.json({ error: "shopify_not_configured" }, { status: 503 });
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    const input: MatchInput = {
      page: inp.page,
      name: str(inp.name),
      zip: str(inp.zip),
      phoneLast4: /^\d{3,4}$/.test(str(inp.phoneLast4)) ? str(inp.phoneLast4) : "",
      shipDate: str(inp.shipDate),
      destCity: str(inp.destCity),
      labelDate: str(inp.labelDate),
    };
    try {
      return NextResponse.json({ orders: await suggestOrders(input, str(body.suggest.poolDate)) });
    } catch (e) {
      return gagal(e);
    }
  }

  // Cari order menurut kodenya — jalan terakhir bila rekomendasi meleset.
  if (body?.search) {
    const q = typeof body.search.q === "string" ? body.search.q.trim().slice(0, 40) : "";
    if (!q) return NextResponse.json({ orders: [] });
    if (!configured) return NextResponse.json({ error: "shopify_not_configured" }, { status: 503 });
    try {
      return NextResponse.json({ orders: await searchOrders(q) });
    } catch (e) {
      return gagal(e);
    }
  }

  // Pencocokan ulang SATU halaman dari nomor HP yang diketik di kartunya.
  if (body?.manual) {
    const inp = body.manual.input;
    const ok =
      inp &&
      Number.isInteger(inp.page) &&
      typeof inp.name === "string" &&
      typeof inp.zip === "string" &&
      typeof inp.shipDate === "string" &&
      typeof inp.phoneLast4 === "string" &&
      /^\d{4}$/.test(inp.phoneLast4);
    if (!ok) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    if (!configured) return NextResponse.json({ error: "shopify_not_configured" }, { status: 503 });
    const claimed = Array.isArray(body.manual.claimed)
      ? body.manual.claimed.filter((x): x is string => typeof x === "string").slice(0, 300)
      : [];
    const poolDate = typeof body.manual.poolDate === "string" ? body.manual.poolDate : "";
    const input: MatchInput = {
      page: inp.page,
      name: inp.name,
      zip: inp.zip,
      phoneLast4: inp.phoneLast4,
      shipDate: inp.shipDate,
      destCity: typeof inp.destCity === "string" ? inp.destCity : "",
      labelDate: typeof inp.labelDate === "string" ? inp.labelDate : "",
    };
    try {
      return NextResponse.json({ match: await matchManual(input, claimed, poolDate) });
    } catch (e) {
      const forbidden = e instanceof Error && e.message === "shopify_forbidden";
      return NextResponse.json(
        { error: forbidden ? "shopify_forbidden" : "shopify_failed" },
        { status: forbidden ? 403 : 502 },
      );
    }
  }

  const inputs = Array.isArray(body?.inputs) ? body.inputs : [];
  if (!inputs.length) return NextResponse.json({ matches: {} });
  if (inputs.length > 300) return NextResponse.json({ error: "too_many_pages" }, { status: 400 });

  if (!configured) {
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
