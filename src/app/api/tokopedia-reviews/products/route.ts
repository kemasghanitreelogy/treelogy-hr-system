import { NextResponse } from "next/server";
import { isSource, validProductId, type MarketplaceSource } from "@/lib/marketplace/sources";
import { can, getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { readState } from "../state";

export const runtime = "nodejs";

/**
 * Peta produk Tokopedia → handle Shopify.
 *
 * Ditaruh di database, bukan di dict dalam kode, supaya menambah produk baru
 * di Tokopedia tidak menuntut deploy. Handle-nya WAJIB milik vendor Treelogy —
 * memetakan ke handle vendor uji coba (`…-1`) akan menempelkan review nyata ke
 * produk yang salah, dan Judge.me tidak punya cara membatalkannya per-baris.
 */

/** ID produk Tokopedia: deretan angka (19 digit gaya TikTok, atau ID klasik). */
/** Handle Shopify: huruf kecil, angka, tanda hubung. */
const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,120}$/;

async function guard(perm: string) {
  const me = await getSessionUser();
  if (!me) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (!can(me, perm)) return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  const supabase = await createClient();
  if (!supabase) return { error: NextResponse.json({ error: "unavailable" }, { status: 503 }) };
  return { supabase };
}

export async function POST(req: Request) {
  // Sumber menyertai setiap operasi: ID produk Shopee dan Tokopedia sama-sama
  // angka, jadi tanpa ini satu bisa menimpa peta milik yang lain.
  const { supabase, error } = await guard("reviews.manage");
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as {
    productId?: string; shopifyHandle?: string; name?: string; source?: string;
  };
  const source: MarketplaceSource = isSource(body.source) ? body.source : "tokopedia";
  const productId = (body.productId ?? "").trim();
  const handle = (body.shopifyHandle ?? "").trim().toLowerCase();
  const name = (body.name ?? "").trim();

  // Bentuk ID diperiksa MENURUT SUMBERNYA — Shopee butuh "shopid_itemid".
  // Kalau tidak, salah bentuk baru ketahuan berjam-jam kemudian saat penarik
  // di laptop gagal, dan saat itu orangnya sudah pergi.
  if (!validProductId(source, productId)) return NextResponse.json({ error: "invalid_product_id" }, { status: 400 });
  if (!HANDLE_RE.test(handle)) return NextResponse.json({ error: "invalid_handle" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });

  const { error: dbError } = await supabase!
    .from("marketplace_products")
    .upsert({ source, product_id: productId, shopify_handle: handle, name, active: true }, { onConflict: "source,product_id" });
  if (dbError) return NextResponse.json({ error: "save_failed" }, { status: 500 });

  return NextResponse.json({ state: await readState() }, { status: 201 });
}

export async function PATCH(req: Request) {
  // Sumber menyertai setiap operasi: ID produk Shopee dan Tokopedia sama-sama
  // angka, jadi tanpa ini satu bisa menimpa peta milik yang lain.
  const { supabase, error } = await guard("reviews.manage");
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as { source?: string;
    productId?: string; shopifyHandle?: string; name?: string; active?: boolean;
  };
  const source: MarketplaceSource = isSource(body.source) ? body.source : "tokopedia";
  const productId = (body.productId ?? "").trim();
  if (!validProductId(source, productId)) return NextResponse.json({ error: "invalid_product_id" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body.shopifyHandle === "string") {
    const handle = body.shopifyHandle.trim().toLowerCase();
    if (!HANDLE_RE.test(handle)) return NextResponse.json({ error: "invalid_handle" }, { status: 400 });
    patch.shopify_handle = handle;
  }
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });
    patch.name = name;
  }
  if (typeof body.active === "boolean") patch.active = body.active;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });

  const { error: dbError } = await supabase!
    .from("marketplace_products").update(patch).eq("source", source).eq("product_id", productId);
  if (dbError) return NextResponse.json({ error: "save_failed" }, { status: 500 });

  return NextResponse.json({ state: await readState() });
}

/**
 * Menghapus produk ikut menghapus review-nya dari ledger (cascade) — dan itu
 * berarti review yang SUDAH diimport ke Judge.me akan terlihat "baru" lagi di
 * run berikutnya, lalu masuk dobel karena Judge.me tidak punya dedup bawaan.
 * Karena itu penghapusan ditolak selama masih ada review; yang benar adalah
 * menonaktifkannya (`active: false`) — berhenti ditarik, riwayatnya tetap ada.
 */
export async function DELETE(req: Request) {
  // Sumber menyertai setiap operasi: ID produk Shopee dan Tokopedia sama-sama
  // angka, jadi tanpa ini satu bisa menimpa peta milik yang lain.
  const { supabase, error } = await guard("reviews.manage");
  if (error) return error;

  const q = new URL(req.url).searchParams;
  const sumberMentah = q.get("source");
  const source: MarketplaceSource = isSource(sumberMentah) ? sumberMentah : "tokopedia";
  const productId = q.get("productId")?.trim() ?? "";
  if (!validProductId(source, productId)) return NextResponse.json({ error: "invalid_product_id" }, { status: 400 });

  const { count, error: countError } = await supabase!
    .from("marketplace_reviews")
    .select("feedback_id", { count: "exact", head: true })
    .eq("source", source)
    .eq("product_id", productId);
  // `count` null berarti pertanyaannya tidak terjawab — bukan berarti nol.
  // Menganggapnya nol akan menghapus produk BESERTA seluruh ledger-nya.
  if (countError || count === null || count > 0) {
    return NextResponse.json({ error: countError ? "query_failed" : "has_reviews" }, { status: countError ? 500 : 409 });
  }

  const { error: dbError } = await supabase!
    .from("marketplace_products").delete().eq("source", source).eq("product_id", productId);
  if (dbError) return NextResponse.json({ error: "remove_failed" }, { status: 500 });

  return NextResponse.json({ state: await readState() });
}
