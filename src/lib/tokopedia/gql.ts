import "server-only";

/* ============================================================
   Penarik review publik Tokopedia — mode "seperti satu pengunjung biasa".

   Yang dipanggil adalah endpoint yang persis dipakai halaman produk publik
   tokopedia.com: tanpa login, tanpa cookie, tanpa kunci API. Tidak ada benang
   teknis apa pun yang menghubungkan permintaan ini ke akun penjual, dan
   session Seller Center tidak pernah disentuh.

   Empat perilaku di bawah ini yang membuat jejaknya lebih kecil daripada satu
   pembeli yang men-scroll review semenit — jangan dilonggarkan:

     1. urut TERBARU DULU + berhenti-awal → run rutin = 1 permintaan/produk.
     2. jeda acak 3–7 detik antar permintaan → pola waktu manusia, bukan mesin.
     3. ditolak (4xx/5xx) = BERHENTI TOTAL, tanpa retry. Review yang terlewat
        otomatis terambil di run berikutnya; memaksa hari itu justru yang
        mengubah "pengunjung" jadi "bot".
     4. anggaran waktu → run yang kepanjangan diakhiri sebagai `partial`,
        bukan dipotong di tengah tulis.
   ============================================================ */

const GQL_URL = "https://gql.tokopedia.com/graphql/productReviewList";
const PAGE_LIMIT = 50;
const PAUSE_MIN_MS = 3_000;
const PAUSE_MAX_MS = 7_000;

/**
 * Batas halaman per produk dalam SATU run.
 *
 * Bukan pembatas cakupan: apa yang tidak sempat terambil tetap tertinggal di
 * Tokopedia dan ikut terambil run berikutnya, karena urutannya terbaru-dulu
 * dan yang sudah dikenal akan memicu berhenti-awal. Ini semata penjaga agar
 * satu run tidak pernah berubah jadi penyapuan ratusan permintaan.
 */
const MAX_PAGES_PER_PRODUCT = 12;

/**
 * ⚠️ Jebakan schema: field `shopName` RUSAK di endpoint ini — memintanya
 * membuat SELURUH query ditolak dengan galat generik "Invalid request schema
 * received". Kalau galat itu muncul lagi, bisect field satu per satu; jangan
 * menebak. Daftar di bawah terverifikasi jalan (terakhir 24 Agu 2026).
 */
const QUERY = `
query productReviewList($productID: String!, $page: Int!, $limit: Int!, $sortBy: String, $filterBy: String) {
  productrevGetProductReviewList(productID: $productID, page: $page, limit: $limit, sortBy: $sortBy, filterBy: $filterBy) {
    totalReviews
    hasNext
    list {
      feedbackID
      message
      productRating
      reviewCreateTime
      variantName
      isAnonymous
      user { fullName }
      reviewResponse { message }
      imageAttachments { imageUrl }
    }
  }
}`;

export interface RawReview {
  feedbackID: string;
  message: string | null;
  productRating: number | null;
  /** Unix detik — datang sebagai STRING dari Tokopedia, bukan angka. */
  reviewCreateTime: string | number | null;
  variantName: string | null;
  isAnonymous: boolean | null;
  user: { fullName: string | null } | null;
  reviewResponse: { message: string | null } | null;
  imageAttachments: { imageUrl: string | null }[] | null;
}

/** Endpoint menolak permintaan kita — sinyal untuk berhenti hari itu. */
export class TokopediaRejected extends Error {
  constructor(readonly httpStatus: number) {
    super(`tokopedia_rejected_${httpStatus}`);
    this.name = "TokopediaRejected";
  }
}

/** Query ditolak isinya (mis. schema drift) — bukan penolakan rate-limit. */
export class TokopediaSchemaError extends Error {
  constructor(readonly detail: string) {
    super("tokopedia_schema_error");
    this.name = "TokopediaSchemaError";
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Jeda acak ala manusia, bukan interval mesin yang presisi. */
function politePause(): Promise<void> {
  return sleep(PAUSE_MIN_MS + Math.random() * (PAUSE_MAX_MS - PAUSE_MIN_MS));
}

async function fetchPage(productId: string, page: number): Promise<{
  totalReviews: number;
  hasNext: boolean;
  list: RawReview[];
}> {
  let res: Response;
  try {
    res = await fetch(GQL_URL, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://www.tokopedia.com",
        Referer: "https://www.tokopedia.com/",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      },
      body: JSON.stringify({
        operationName: "productReviewList",
        variables: {
          productID: productId,
          page,
          limit: PAGE_LIMIT,
          sortBy: "create_time desc",
          filterBy: "",
        },
        query: QUERY,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    // Jaringan putus / timeout — diperlakukan sama seperti penolakan: berhenti,
    // jangan diulang. Yang belum terambil bukan hilang, hanya tertunda.
    throw new TokopediaRejected(0);
  }

  if (!res.ok) throw new TokopediaRejected(res.status);

  const data = (await res.json().catch(() => null)) as {
    data?: { productrevGetProductReviewList?: { totalReviews: number; hasNext: boolean; list: RawReview[] } };
    errors?: { message?: string }[];
  } | null;

  if (data?.errors?.length) {
    throw new TokopediaSchemaError(data.errors.map((e) => e?.message ?? "?").join("; ").slice(0, 300));
  }
  const result = data?.data?.productrevGetProductReviewList;
  if (!result) throw new TokopediaSchemaError("empty_payload");

  return {
    totalReviews: result.totalReviews ?? 0,
    hasNext: Boolean(result.hasNext),
    list: Array.isArray(result.list) ? result.list : [],
  };
}

export interface PullTarget {
  productId: string;
  shopifyHandle: string;
  name: string;
}

export interface PulledReview extends RawReview {
  _productId: string;
  _shopifyHandle: string;
  _productName: string;
}

export interface PullOutcome {
  reviews: PulledReview[];
  requests: number;
  /** True bila anggaran waktu habis sebelum semua produk selesai disapu. */
  partial: boolean;
  /** Produk yang sempat tersentuh — untuk pesan di layar. */
  perProduct: { productId: string; name: string; total: number; fetched: number; pages: number }[];
}

/**
 * Sapu semua produk sekali jalan.
 *
 * `seen` adalah kumpulan feedbackID yang SUDAH ada di ledger. Begitu satu
 * halaman penuh tidak menghasilkan satu pun ID baru, sisa halaman produk itu
 * pasti sudah dimiliki — karena urutannya terbaru-dulu — jadi penyapuannya
 * dihentikan di situ. Ledger kosong (run pertama) berarti semua halaman disapu.
 */
export async function pullReviews(
  targets: PullTarget[],
  seen: Set<string>,
  opts: { budgetMs: number } = { budgetMs: 240_000 },
): Promise<PullOutcome> {
  const startedAt = Date.now();
  const reviews: PulledReview[] = [];
  const perProduct: PullOutcome["perProduct"] = [];
  let requests = 0;
  let firstRequest = true;
  let partial = false;

  for (const target of targets) {
    if (partial) break;
    let page = 1;
    let fetched = 0;
    let total = 0;

    while (page <= MAX_PAGES_PER_PRODUCT) {
      // Anggaran dicek SEBELUM jeda + permintaan, bukan sesudah: jangan mulai
      // sesuatu yang sudah pasti tidak akan sempat selesai.
      const spent = Date.now() - startedAt;
      const worstCase = (firstRequest ? 0 : PAUSE_MAX_MS) + 30_000;
      if (spent + worstCase > opts.budgetMs) {
        partial = true;
        break;
      }

      if (!firstRequest) await politePause();
      firstRequest = false;

      const result = await fetchPage(target.productId, page);
      requests += 1;
      total = result.totalReviews;

      let pageNew = 0;
      for (const r of result.list) {
        reviews.push({
          ...r,
          _productId: target.productId,
          _shopifyHandle: target.shopifyHandle,
          _productName: target.name,
        });
        fetched += 1;
        if (!seen.has(r.feedbackID)) pageNew += 1;
      }

      if (!result.hasNext || result.list.length === 0) break;
      if (seen.size > 0 && pageNew === 0) break; // berhenti-awal
      page += 1;
    }

    perProduct.push({
      productId: target.productId,
      name: target.name,
      total,
      fetched,
      pages: page > MAX_PAGES_PER_PRODUCT ? MAX_PAGES_PER_PRODUCT : page,
    });
  }

  return { reviews, requests, partial, perProduct };
}

/**
 * Kapan tautan foto ini mati.
 *
 * Foto review disajikan lewat URL bertanda tangan; masa hidupnya ada di
 * parameter `x-expires` (unix detik) — sekitar tiga jam sejak ditarik. Yang
 * diambil adalah yang PALING CEPAT mati di antara semua foto satu review,
 * karena satu tautan mati sudah cukup membuat barisnya tidak utuh.
 */
export function picturesExpireAt(urls: string[]): Date | null {
  let earliest: number | null = null;
  for (const url of urls) {
    const m = /[?&]x-expires=(\d+)/.exec(url);
    if (!m) continue;
    const at = Number(m[1]);
    if (!Number.isFinite(at) || at <= 0) continue;
    if (earliest === null || at < earliest) earliest = at;
  }
  return earliest === null ? null : new Date(earliest * 1000);
}
