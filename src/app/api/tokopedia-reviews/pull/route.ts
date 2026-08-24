import { NextResponse } from "next/server";
import { can, getSessionUser } from "@/lib/auth";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  TokopediaRejected, TokopediaSchemaError, TokopediaUnreachable, picturesExpireAt, pullReviews,
  type PullTarget, type PulledReview,
} from "@/lib/tokopedia/gql";
import { mapRun } from "@/lib/tokopedia/map";
import { pullGate } from "@/lib/tokopedia/schedule";
import type { TokopediaRunStatus } from "@/lib/tokopedia/types";
import { readState } from "../state";

export const runtime = "nodejs";
/**
 * Run rutin selesai dalam ±20 detik (4 permintaan + 3 jeda). Batas panjang ini
 * untuk run PERTAMA sebuah produk, yang menyapu semua halamannya; anggaran di
 * bawah berhenti lebih dulu supaya prosesnya tidak pernah dipotong di tengah.
 */
export const maxDuration = 300;

/** Sisakan ruang untuk menulis hasil & menutup baris run sebelum batas platform. */
const BUDGET_MS = 240_000;

/**
 * Tarik review baru dari Tokopedia.
 *
 * Ini satu-satunya tempat di seluruh aplikasi yang menghubungi tokopedia.com.
 * Semua perilaku "seperti pengunjung biasa" ada di lib/tokopedia/gql.ts; yang
 * di sini adalah pagar di sekitarnya: izin, jeda antar-run, dan pencatatan.
 */
export async function POST(req: Request) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(me, "reviews.pull")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Menulis ke ledger melewati RLS dengan sengaja: tidak ada policy insert untuk
  // pengguna, supaya review karangan tidak bisa disisipkan dari klien.
  if (!isAdminConfigured) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const admin = createAdminClient()!;
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { force?: boolean };

  const { data: userRes } = await supabase.auth.getUser();
  const authUserId = userRes?.user?.id ?? null;

  // ---- pagar jeda ------------------------------------------------
  const { data: runRows } = await admin
    .from("tokopedia_review_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(5);
  const gate = pullGate((runRows ?? []).map(mapRun));

  if (!gate.allowed) {
    const mayOverride = body.force === true && gate.overridable && can(me, "reviews.manage");
    if (!mayOverride) {
      return NextResponse.json(
        { error: gate.reason ?? "cooldown", nextPullAt: gate.nextPullAt, overridable: gate.overridable },
        { status: 429 },
      );
    }
  }

  // ---- target ----------------------------------------------------
  const { data: productRows } = await admin
    .from("tokopedia_products")
    .select("product_id, shopify_handle, name, sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true });

  const targets: PullTarget[] = (productRows ?? []).map((p) => ({
    productId: String(p.product_id),
    shopifyHandle: String(p.shopify_handle),
    name: String(p.name),
  }));
  if (!targets.length) return NextResponse.json({ error: "no_products" }, { status: 400 });

  // ---- ledger yang sudah dimiliki (kunci berhenti-awal) ----------
  const seen = new Set<string>();
  {
    // Dipaginasi: batas bawaan PostgREST 1000 baris akan diam-diam memotong
    // ledger, dan ledger yang terpotong membuat review lama terlihat "baru".
    for (let from = 0; ; from += 1000) {
      const { data } = await admin
        .from("tokopedia_reviews")
        .select("feedback_id")
        .range(from, from + 999);
      if (!data?.length) break;
      for (const row of data) seen.add(String(row.feedback_id));
      if (data.length < 1000) break;
    }
  }

  // ---- buka baris run --------------------------------------------
  const { data: runRow, error: runErr } = await admin
    .from("tokopedia_review_runs")
    .insert({ status: "running", started_by: authUserId, started_by_name: me.name })
    .select("*")
    .single();
  if (runErr || !runRow) return NextResponse.json({ error: "run_start_failed" }, { status: 500 });
  const runId = String(runRow.id);

  const closeRun = async (patch: Record<string, unknown>) => {
    await admin
      .from("tokopedia_review_runs")
      .update({ finished_at: new Date().toISOString(), ...patch })
      .eq("id", runId);
  };

  // ---- tarik ------------------------------------------------------
  let pulled: Awaited<ReturnType<typeof pullReviews>>;
  try {
    pulled = await pullReviews(targets, seen, { budgetMs: BUDGET_MS });
  } catch (e) {
    // Tidak pernah sampai ke Tokopedia = bukan penolakan Tokopedia. Dicatat
    // sebagai `failed` (jeda 1 jam, bisa ditembus), bukan `rejected` (24 jam,
    // tidak bisa ditembus siapa pun) — supaya gangguan jaringan tidak mengunci
    // siapa pun sehari penuh atas sesuatu yang bukan salah mereka.
    if (e instanceof TokopediaUnreachable) {
      await closeRun({ status: "failed" satisfies TokopediaRunStatus, error: `tidak tersambung — ${e.detail}` });
      return NextResponse.json({ outcome: "failed", detail: e.detail, state: await readState() });
    }
    if (e instanceof TokopediaRejected) {
      await closeRun({
        status: "rejected" satisfies TokopediaRunStatus,
        error: e.httpStatus ? `HTTP ${e.httpStatus}` : "network",
      });
      // 200, bukan 5xx: penolakan adalah hasil yang SAH dari run ini dan sudah
      // tercatat. Layar perlu menampilkannya sebagai keadaan, bukan kegagalan
      // aplikasi yang mengundang orang menekan tombolnya lagi.
      return NextResponse.json({ outcome: "rejected", httpStatus: e.httpStatus, state: await readState() });
    }
    const detail = e instanceof TokopediaSchemaError ? e.detail : "unknown";
    await closeRun({ status: "failed" satisfies TokopediaRunStatus, error: detail });
    return NextResponse.json({ outcome: "failed", detail, state: await readState() });
  }

  // ---- simpan -----------------------------------------------------
  const fresh = new Map<string, PulledReview>();
  for (const r of pulled.reviews) if (!fresh.has(r.feedbackID)) fresh.set(r.feedbackID, r);

  const pulledAt = new Date().toISOString();

  /**
   * Bintangnya sah? Review tanpa rating yang jelas TIDAK diberi nilai bawaan.
   *
   * Menganggapnya bintang 5 akan menaikkan rating agregat toko dengan angka
   * yang tidak pernah diberikan siapa pun — dan sekali terimport, Judge.me
   * hanya bisa membatalkannya sebatch, bukan sebaris.
   */
  const validRating = (r: PulledReview) => {
    const n = Number(r.productRating);
    return Number.isInteger(n) && n >= 1 && n <= 5;
  };

  const toRow = (r: PulledReview) => {
    const urls = (r.imageAttachments ?? []).map((a) => a?.imageUrl).filter((u): u is string => Boolean(u));
    const expires = picturesExpireAt(urls);
    const ts = Number(r.reviewCreateTime ?? 0);
    return {
      feedback_id: r.feedbackID,
      product_id: r._productId,
      shopify_handle: r._shopifyHandle,
      rating: Number(r.productRating),
      body: (r.message ?? "").trim(),
      // Tanpa stempel waktu yang sah, dipakai waktu penarikan — BUKAN epoch.
      // `review_date` adalah satu-satunya jalur Judge.me yang bisa backdate,
      // jadi tanggal 01/01/1970 akan benar-benar terpasang di review itu.
      review_at: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : pulledAt,
      reviewer_name: (r.user?.fullName ?? "").trim(),
      is_anonymous: r.isAnonymous === true,
      variant_name: r.variantName || null,
      reply: (r.reviewResponse?.message ?? "").trim() || null,
      picture_urls: urls,
      pictures_expire_at: expires ? expires.toISOString() : null,
    };
  };

  // Baris tanpa bintang yang sah dibuang di sini — bukan diperbaiki diam-diam.
  // Jumlahnya ikut tercatat lewat selisih `reviews_seen` vs `reviews_new`.
  const usable = [...fresh.values()].filter(validRating);
  const newOnes = usable.filter((r) => !seen.has(r.feedbackID));
  const revisited = usable.filter((r) => seen.has(r.feedbackID));

  if (newOnes.length) {
    const rows = newOnes.map((r) => ({ ...toRow(r), first_run_id: runId }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await admin
        .from("tokopedia_reviews")
        .upsert(rows.slice(i, i + 200), { onConflict: "feedback_id" });
      if (error) {
        await closeRun({ status: "failed" satisfies TokopediaRunStatus, error: error.message.slice(0, 300) });
        return NextResponse.json({ outcome: "failed", detail: error.message, state: await readState() });
      }
    }
  }

  // Halaman pertama tiap produk hampir selalu berisi review yang sudah dimiliki.
  // Tautan fotonya yang baru ikut disimpan — gratis, dan itulah yang membuat
  // ekspor ulang batch lama tetap membawa foto yang hidup.
  if (revisited.length) {
    const rows = revisited
      .map(toRow)
      .filter((r) => r.picture_urls.length > 0);
    for (let i = 0; i < rows.length; i += 200) {
      await admin
        .from("tokopedia_reviews")
        .upsert(rows.slice(i, i + 200), { onConflict: "feedback_id" });
    }
  }

  const withBody = newOnes.filter((r) => (r.message ?? "").trim()).length;
  const status: TokopediaRunStatus = pulled.partial ? "partial" : "ok";
  await closeRun({
    status,
    requests: pulled.requests,
    reviews_seen: fresh.size,
    reviews_new: newOnes.length,
    with_body: withBody,
    no_body: newOnes.length - withBody,
  });

  return NextResponse.json({
    outcome: status,
    requests: pulled.requests,
    newCount: newOnes.length,
    withBody,
    noBody: newOnes.length - withBody,
    perProduct: pulled.perProduct,
    state: await readState(),
  });
}
