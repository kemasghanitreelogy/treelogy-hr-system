import { NextResponse } from "next/server";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import type { PulledReview } from "@/lib/tokopedia/gql";
import { mapRun } from "@/lib/tokopedia/map";
import { pullGate } from "@/lib/tokopedia/schedule";
import { readSeen, storeReviews } from "@/lib/tokopedia/store";
import { isSource, type MarketplaceSource } from "@/lib/marketplace/sources";
import type { TokopediaRunStatus } from "@/lib/tokopedia/types";

export const runtime = "nodejs";
// Menyalin ratusan foto butuh waktu, dan run yang jatuh di detik terakhir
// berarti review barunya ikut hilang — bukan cuma fotonya.
export const maxDuration = 300;

/* ============================================================
   Jalur masuk untuk penarik yang berjalan di LUAR Vercel.

   Tokopedia mem-blackhole IP datacenter: dari Vercel, koneksinya menggantung
   30 detik lalu mati tanpa satu byte pun balasan — sementara panggilan ke
   Shopify dan Jubelio dari server yang sama berjalan normal, dan endpoint yang
   sama menjawab seketika dari IP rumahan. Jadi yang dipindahkan hanya SIAPA
   yang menelepon Tokopedia; sisanya tetap di sini.

   Yang TIDAK ikut pindah ke skrip, dan itu disengaja:
     • penjaga jeda antar-run   — skrip di laptop gampang dijalankan dua kali
     • dedup & ledger           — dijamin primary key, bukan berkas di disk
     • pembuangan rating tak sah — aturan yang mengarang data harus satu tempat
     • pencatatan riwayat run   — jejaknya harus tetap terlihat satu tim

   Skripnya sengaja bodoh: ia hanya melakukan HTTP dan menunggu.
   ============================================================ */

/** Kunci Bearer khusus penarik. Pola sama dengan route cron. */
function authorized(req: Request): boolean {
  const secret = process.env.TOKOPEDIA_INGEST_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

type Body =
  | { action: "start" }
  | { action: "finish"; runId: string; requests: number; partial?: boolean; reviews: PulledReview[] }
  | { action: "fail"; runId: string; kind: "rejected" | "failed" | "unreachable"; detail?: string };

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdminConfigured) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const admin = createAdminClient()!;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Sumbernya menentukan produk mana yang dikerjakan, jeda mana yang berlaku,
  // dan ledger bagian mana yang dianggap "sudah punya". Ditolak kalau tidak
  // dikenali — menebaknya jadi "tokopedia" akan menulis review Shopee ke
  // bagian ledger yang salah, dan itu tidak kelihatan sampai ekspor.
  const sumberMentah = (body as unknown as { source?: unknown })?.source;
  const source: MarketplaceSource = isSource(sumberMentah) ? sumberMentah : "tokopedia";

  // ---- start: minta izin, buka run, serahkan daftar kerja --------
  if (body?.action === "start") {
    const { data: runRows } = await admin
      .from("marketplace_review_runs")
      .select("*")
      .eq("source", source)
      .order("started_at", { ascending: false })
      .limit(5);
    const gate = pullGate((runRows ?? []).map(mapRun));
    // Penyegaran foto boleh menembus JEDA, tapi tidak pernah menembus "ada run
    // yang sedang berjalan" (overridable=false di sana) — dua penarik serentak
    // akan saling melihat ledger yang belum lengkap. Wewenangnya setara tombol
    // paksa di layar: sama-sama menuntut pemegang kunci.
    const paksa = (body as unknown as { force?: unknown })?.force === true && gate.overridable;
    if (!gate.allowed && !paksa) {
      return NextResponse.json(
        { error: gate.reason ?? "cooldown", nextPullAt: gate.nextPullAt },
        { status: 429 },
      );
    }

    const { data: productRows } = await admin
      .from("marketplace_products")
      .select("product_id, shopify_handle, name")
      .eq("source", source)
      .eq("active", true)
      .order("sort_order", { ascending: true });
    const products = (productRows ?? []).map((p) => ({
      productId: String(p.product_id),
      shopifyHandle: String(p.shopify_handle),
      name: String(p.name),
    }));
    if (!products.length) return NextResponse.json({ error: "no_products" }, { status: 400 });

    const { data: runRow, error } = await admin
      .from("marketplace_review_runs")
      .insert({ status: "running", source, started_by_name: "penarik lokal" })
      .select("id")
      .single();
    if (error || !runRow) return NextResponse.json({ error: "run_start_failed" }, { status: 500 });

    // `seen` dikirim ke skrip supaya berhenti-awal bisa diputuskan di sana —
    // skrip harus tahu kapan berhenti membuka halaman berikutnya, dan itu tidak
    // bisa ditunda sampai hasilnya dikirim balik.
    const seen = await readSeen(admin, source);
    return NextResponse.json({ runId: String(runRow.id), products, seen: [...seen] });
  }

  // ---- finish: simpan hasil, tutup run ---------------------------
  if (body?.action === "finish") {
    if (!body.runId) return NextResponse.json({ error: "id_required" }, { status: 400 });
    const reviews = Array.isArray(body.reviews) ? body.reviews : [];
    // Batas kewarasan: run pertama toko ini ±358 review. Angka jauh di atas itu
    // berarti ada yang salah di sisi skrip, dan menyimpannya lebih buruk
    // daripada menolaknya.
    if (reviews.length > 20_000) return NextResponse.json({ error: "too_many_pages" }, { status: 400 });

    // Dibaca ULANG di sini, bukan memakai `seen` yang dikirim skrip: yang
    // menentukan sebuah review "baru" harus keadaan ledger saat menyimpan,
    // bukan potret yang bisa jadi sudah usang beberapa menit.
    const seen = await readSeen(admin, source);

    let stored;
    try {
      stored = await storeReviews(admin, source, body.runId, reviews, seen);
    } catch (e) {
      const detail = e instanceof Error ? e.message : "unknown";
      await admin
        .from("marketplace_review_runs")
        .update({ finished_at: new Date().toISOString(), status: "failed", error: detail.slice(0, 300) })
        .eq("id", body.runId);
      return NextResponse.json({ error: "save_failed", detail }, { status: 500 });
    }

    const status: TokopediaRunStatus = body.partial ? "partial" : "ok";
    await admin
      .from("marketplace_review_runs")
      .update({
        finished_at: new Date().toISOString(),
        status,
        requests: Number(body.requests) || 0,
        reviews_seen: stored.seenCount,
        reviews_new: stored.newCount,
        with_body: stored.withBody,
        no_body: stored.noBody,
        error: stored.discarded ? `${stored.discarded} review dibuang (rating tidak sah)` : null,
      })
      .eq("id", body.runId);

    return NextResponse.json({ outcome: status, ...stored });
  }

  // ---- fail: tutup run dengan jujur ------------------------------
  if (body?.action === "fail") {
    if (!body.runId) return NextResponse.json({ error: "id_required" }, { status: 400 });
    // `rejected` (jeda 24 jam, tidak bisa ditembus) hanya untuk penolakan yang
    // benar-benar datang dari Tokopedia lewat status HTTP. Gagal tersambung
    // masuk `failed` — hukuman sehari penuh untuk masalah jaringan tidak adil.
    const status: TokopediaRunStatus =
      body.kind === "rejected" ? "rejected" : body.kind === "unreachable" ? "unreachable" : "failed";
    await admin
      .from("marketplace_review_runs")
      .update({
        finished_at: new Date().toISOString(),
        status,
        error: (body.detail ?? "").slice(0, 300) || null,
      })
      .eq("id", body.runId);
    return NextResponse.json({ outcome: status });
  }

  return NextResponse.json({ error: "invalid_input" }, { status: 400 });
}
