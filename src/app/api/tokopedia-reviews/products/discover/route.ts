import { NextResponse } from "next/server";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { isSource, validProductId, type MarketplaceSource } from "@/lib/marketplace/sources";

export const runtime = "nodejs";
export const maxDuration = 60;

/* ============================================================
   Pendaftaran produk hasil penemuan.

   Penarik di laptop yang menemukan produk sebuah toko (endpoint daftar produk
   Shopee menolak IP pusat data), lalu mengirim daftarnya ke sini. Server yang
   mencocokkannya ke produk Shopify — bukan skrip, karena token Admin Shopify
   tidak boleh keluar dari server.
   ============================================================ */

function authorized(req: Request): boolean {
  const secret = process.env.TOKOPEDIA_INGEST_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/** Judul → bentuk banding: huruf & angka saja, supaya "270's" = "270s". */
function norm(s: string): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function tokens(s: string): Set<string> {
  return new Set(norm(s).split(" ").filter((w) => w.length >= 3));
}

/**
 * Seberapa yakin dua judul menunjuk produk yang sama.
 *
 * Judul marketplace penuh bumbu promosi ("BPOM ✅ GRATIS ONGKIR") yang tidak
 * ada di judul Shopify, jadi yang dihitung adalah berapa banyak kata Shopify
 * yang MUNCUL di judul marketplace — bukan kemiripan dua arah, yang akan
 * menghukum judul panjang justru karena panjangnya.
 */
function skor(judulShopify: string, judulMarket: string): number {
  const a = tokens(judulShopify);
  const b = tokens(judulMarket);
  if (!a.size) return 0;
  let sama = 0;
  for (const t of a) if (b.has(t)) sama++;
  return sama / a.size;
}

const SHOPIFY_PRODUCTS = `query Produk($c: String) {
  products(first: 100, after: $c) {
    pageInfo { hasNextPage endCursor }
    edges { node { title handle status } }
  }
}`;

async function daftarProdukShopify(): Promise<{ title: string; handle: string }[]> {
  const store = process.env.STORE_NAME;
  const token = process.env.ADMIN_API_KEY;
  if (!store || !token) throw new Error("shopify_not_configured");
  const out: { title: string; handle: string }[] = [];
  let cursor: string | null = null;
  for (let halaman = 0; halaman < 10; halaman++) {
    const res: Response = await fetch(`https://${store}/admin/api/2026-07/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query: SHOPIFY_PRODUCTS, variables: { c: cursor } }),
      signal: AbortSignal.timeout(20_000),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || json?.errors) throw new Error("shopify_failed");
    const conn = json?.data?.products;
    for (const e of conn?.edges ?? []) {
      if (e?.node?.status === "ACTIVE") out.push({ title: String(e.node.title), handle: String(e.node.handle) });
    }
    if (!conn?.pageInfo?.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return out;
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdminConfigured) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const admin = createAdminClient()!;

  const body = (await req.json().catch(() => ({}))) as {
    source?: string;
    products?: { productId?: string; name?: string }[];
  };
  const source: MarketplaceSource = isSource(body.source) ? body.source : "shopee";
  const masuk = (body.products ?? [])
    .map((p) => ({ productId: String(p.productId ?? "").trim(), name: String(p.name ?? "").trim() }))
    .filter((p) => p.productId && p.name && validProductId(source, p.productId));
  if (!masuk.length) return NextResponse.json({ error: "no_products" }, { status: 400 });
  if (masuk.length > 300) return NextResponse.json({ error: "too_many" }, { status: 400 });

  let katalog: { title: string; handle: string }[];
  try {
    katalog = await daftarProdukShopify();
  } catch (e) {
    const pesan = e instanceof Error ? e.message : "shopify_failed";
    return NextResponse.json({ error: pesan }, { status: pesan === "shopify_not_configured" ? 503 : 502 });
  }

  // Produk yang SUDAH dipetakan tidak diusik: handle yang pernah diperbaiki
  // orang tidak boleh ditimpa tebakan mesin.
  const { data: adaRows } = await admin
    .from("marketplace_products")
    .select("product_id")
    .eq("source", source);
  const sudahAda = new Set((adaRows ?? []).map((r) => String(r.product_id)));

  const AMBANG = 0.6;
  const hasil: { productId: string; name: string; handle: string; skor: number; status: string }[] = [];
  const rows: Record<string, unknown>[] = [];

  for (const p of masuk) {
    if (sudahAda.has(p.productId)) {
      hasil.push({ ...p, handle: "", skor: 0, status: "sudah ada" });
      continue;
    }
    let terbaik = { handle: "", nilai: 0 };
    for (const s of katalog) {
      const n = skor(s.title, p.name);
      if (n > terbaik.nilai) terbaik = { handle: s.handle, nilai: n };
    }
    // Di bawah ambang, produk tetap DICATAT tapi non-aktif: penarik hanya
    // mengambil yang aktif, jadi handle tebakan tidak akan pernah dipakai
    // sampai orang memeriksanya. Membuangnya diam-diam justru membuat produk
    // itu hilang tanpa jejak dan tidak ada yang tahu harus memperbaiki apa.
    const yakin = terbaik.nilai >= AMBANG;
    rows.push({
      source,
      product_id: p.productId,
      name: p.name,
      shopify_handle: yakin ? terbaik.handle : "",
      active: yakin,
    });
    hasil.push({ ...p, handle: terbaik.handle, skor: Math.round(terbaik.nilai * 100) / 100, status: yakin ? "cocok" : "perlu diperiksa" });
  }

  if (rows.length) {
    const { error } = await admin
      .from("marketplace_products")
      .upsert(rows, { onConflict: "source,product_id" });
    if (error) return NextResponse.json({ error: "save_failed", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({
    katalog: katalog.length,
    ditambahkan: rows.length,
    aktif: rows.filter((r) => r.active).length,
    hasil,
  });
}
