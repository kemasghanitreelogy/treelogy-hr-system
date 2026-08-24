import { NextResponse } from "next/server";
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
const ID_RE = /^\d{6,25}$/;
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
  const { supabase, error } = await guard("reviews.manage");
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as {
    productId?: string; shopifyHandle?: string; name?: string;
  };
  const productId = (body.productId ?? "").trim();
  const handle = (body.shopifyHandle ?? "").trim().toLowerCase();
  const name = (body.name ?? "").trim();

  if (!ID_RE.test(productId)) return NextResponse.json({ error: "invalid_product_id" }, { status: 400 });
  if (!HANDLE_RE.test(handle)) return NextResponse.json({ error: "invalid_handle" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });

  const { error: dbError } = await supabase!
    .from("tokopedia_products")
    .upsert({ product_id: productId, shopify_handle: handle, name, active: true }, { onConflict: "product_id" });
  if (dbError) return NextResponse.json({ error: "save_failed" }, { status: 500 });

  return NextResponse.json({ state: await readState() }, { status: 201 });
}

export async function PATCH(req: Request) {
  const { supabase, error } = await guard("reviews.manage");
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as {
    productId?: string; shopifyHandle?: string; name?: string; active?: boolean;
  };
  const productId = (body.productId ?? "").trim();
  if (!ID_RE.test(productId)) return NextResponse.json({ error: "invalid_product_id" }, { status: 400 });

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
    .from("tokopedia_products").update(patch).eq("product_id", productId);
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
  const { supabase, error } = await guard("reviews.manage");
  if (error) return error;

  const productId = new URL(req.url).searchParams.get("productId")?.trim() ?? "";
  if (!ID_RE.test(productId)) return NextResponse.json({ error: "invalid_product_id" }, { status: 400 });

  const { count, error: countError } = await supabase!
    .from("tokopedia_reviews")
    .select("feedback_id", { count: "exact", head: true })
    .eq("product_id", productId);
  // `count` null berarti pertanyaannya tidak terjawab — bukan berarti nol.
  // Menganggapnya nol akan menghapus produk BESERTA seluruh ledger-nya.
  if (countError || count === null || count > 0) {
    return NextResponse.json({ error: countError ? "query_failed" : "has_reviews" }, { status: countError ? 500 : 409 });
  }

  const { error: dbError } = await supabase!
    .from("tokopedia_products").delete().eq("product_id", productId);
  if (dbError) return NextResponse.json({ error: "remove_failed" }, { status: 500 });

  return NextResponse.json({ state: await readState() });
}
