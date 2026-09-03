import { NextResponse } from "next/server";
import type { MarketplaceSource } from "@/lib/marketplace/sources";

/**
 * Tombol tarik di layar hanya melayani Tokopedia.
 *
 * Shopee menjawab 403 untuk permintaan dari IP pusat data (diuji langsung:
 * error 90309999), jadi menawarkan tombolnya di server hanya akan menghasilkan
 * kegagalan yang membingungkan. Shopee ditarik dari laptop lewat /ingest.
 */
const SUMBER: MarketplaceSource = "tokopedia";
import { can, getSessionUser } from "@/lib/auth";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  TokopediaRejected, TokopediaSchemaError, TokopediaUnreachable, pullReviews,
  type PullTarget,
} from "@/lib/tokopedia/gql";
import { readSeen, storeReviews } from "@/lib/tokopedia/store";
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
    .from("marketplace_review_runs")
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
    .from("marketplace_products")
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
  const seen = await readSeen(admin, SUMBER);

  // ---- buka baris run --------------------------------------------
  const { data: runRow, error: runErr } = await admin
    .from("marketplace_review_runs")
    .insert({ status: "running", started_by: authUserId, started_by_name: me.name })
    .select("*")
    .single();
  if (runErr || !runRow) return NextResponse.json({ error: "run_start_failed" }, { status: 500 });
  const runId = String(runRow.id);

  const closeRun = async (patch: Record<string, unknown>) => {
    await admin
      .from("marketplace_review_runs")
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
      await closeRun({ status: "unreachable" satisfies TokopediaRunStatus, error: e.detail });
      return NextResponse.json({ outcome: "unreachable", detail: e.detail, state: await readState() });
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
  let stored;
  try {
    stored = await storeReviews(admin, SUMBER, runId, pulled.reviews, seen);
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unknown";
    await closeRun({ status: "failed" satisfies TokopediaRunStatus, error: detail.slice(0, 300) });
    return NextResponse.json({ outcome: "failed", detail, state: await readState() });
  }

  const status: TokopediaRunStatus = pulled.partial ? "partial" : "ok";
  await closeRun({
    status,
    requests: pulled.requests,
    reviews_seen: stored.seenCount,
    reviews_new: stored.newCount,
    with_body: stored.withBody,
    no_body: stored.noBody,
  });

  return NextResponse.json({
    outcome: status,
    requests: pulled.requests,
    newCount: stored.newCount,
    withBody: stored.withBody,
    noBody: stored.noBody,
    perProduct: pulled.perProduct,
    state: await readState(),
  });
}
