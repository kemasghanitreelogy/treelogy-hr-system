/**
 * Klien Jubelio — mencari sales order yang bersesuaian dengan sebuah resi lalu
 * menuliskan No. Resi (AWB) + kurirnya. Server-side saja (memakai kredensial API).
 *
 * Pencocokannya EKSAK, bukan fuzzy: order Jubelio yang tersinkron dari Shopify
 * menyimpan `ref_no` == `legacyResourceId` order Shopify dan `source_name` ==
 * "SHOPIFY". Jadi kita pakai hasil pencocokan resi→Shopify, lalu konfirmasi
 * order Jubelio-nya lewat ref_no. Tidak ada endpoint pencarian ref_no, sehingga
 * kandidat dimunculkan lewat nama penerima di daftar WMS dan dikonfirmasi satu
 * per satu via GET /sales/orders/{id}.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const BASE = "https://api2.jubelio.com";

export interface JubelioFind {
  found: boolean;
  salesorderId: number | null;
  salesorderNo: string | null;
  currentTracking: string | null;
  currentShipper: string | null;
  refMatch: boolean;
  zipMatch: boolean;
  /** save-airwaybill baru bisa jalan setelah order punya picklist. */
  picklistExist: boolean;
  note: string;
}

async function jfetch(token: string, path: string, init?: RequestInit): Promise<Response> {
  // Satu kali ulang saat 429 (batas Jubelio: 600 permintaan/menit).
  const headers = { Authorization: token, "Content-Type": "application/json", ...(init?.headers || {}) };
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(BASE + path, { ...init, headers });
    if (res.status !== 429) return res;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return fetch(BASE + path, { ...init, headers });
}

export async function jubelioLogin(): Promise<string> {
  const email = process.env.JUBELIO_API_USERNAME;
  const password = process.env.JUBELIO_API_PASSWORD;
  if (!email || !password) throw new Error("jubelio_not_configured");
  const res = await fetch(BASE + "/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json?.token) throw new Error("jubelio_login_failed");
  return json.token as string;
}

const digits = (s: any) => String(s ?? "").replace(/\D/g, "");
const norm = (s: any) =>
  String(s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Daftar (berurutan) tempat order yang menunggu resi biasanya berada. */
const CANDIDATE_LISTS = [
  "/wms/sales/orders/ready-to-process/",
  "/wms/sales/orders/ready-to-pick/",
  "/wms/sales/order/ready-to-ship",
  "/sales/orders/completed/",
];

function notFound(note: string): JubelioFind {
  return {
    found: false, salesorderId: null, salesorderNo: null, currentTracking: null,
    currentShipper: null, refMatch: false, zipMatch: false, picklistExist: false, note,
  };
}

/** Cari order Jubelio untuk sebuah legacyId Shopify, kandidat dimunculkan by nama. */
export async function findJubelioOrder(
  token: string,
  opts: { name: string; legacyId: string; zip: string },
): Promise<JubelioFind> {
  const seen = new Set<number>();
  const candidateIds: number[] = [];
  const nameQ = opts.name.trim();

  if (nameQ) {
    for (const list of CANDIDATE_LISTS) {
      try {
        const res = await jfetch(token, `${list}?q=${encodeURIComponent(nameQ)}&pageSize=20`);
        if (!res.ok) continue;
        const j: any = await res.json();
        for (const it of j.data || j.rows || []) {
          const id = Number(it.salesorder_id);
          if (id && !seen.has(id)) {
            seen.add(id);
            candidateIds.push(id);
          }
        }
      } catch {
        /* coba daftar berikutnya */
      }
      if (candidateIds.length >= 15) break;
    }
  }

  if (!candidateIds.length) {
    return notFound("tidak ada kandidat di Jubelio (nama tidak ada di order terbuka)");
  }

  // Konfirmasi tiap kandidat: ref_no == legacyId (eksak) + sumbernya SHOPIFY.
  for (const id of candidateIds) {
    try {
      const res = await jfetch(token, `/sales/orders/${id}`);
      if (!res.ok) continue;
      const o: any = await res.json();
      const refMatch = !!opts.legacyId && String(o.ref_no) === String(opts.legacyId);
      const isShopify = String(o.source_name || "").toUpperCase() === "SHOPIFY";
      if (refMatch && isShopify) {
        return {
          found: true,
          salesorderId: id,
          salesorderNo: o.salesorder_no ?? null,
          currentTracking: o.tracking_no || o.tracking_number || null,
          currentShipper: o.shipper || null,
          refMatch: true,
          zipMatch: !!opts.zip && digits(o.shipping_post_code) === digits(opts.zip),
          picklistExist: !!o.picklist_exist,
          note: "cocok lewat ref_no",
        };
      }
    } catch {
      /* kandidat berikutnya */
    }
  }

  // Cadangan: tepat satu kandidat yang namanya cocok kuat dan kodeposnya sama —
  // diterima tetapi ditandai ref belum terkonfirmasi (panel menolak menulisnya).
  if (candidateIds.length === 1) {
    try {
      const res = await jfetch(token, `/sales/orders/${candidateIds[0]}`);
      if (res.ok) {
        const o: any = await res.json();
        const nm = norm(o.shipping_full_name) || norm(o.customer_name);
        const target = norm(opts.name);
        const sameName = !!nm && !!target && (nm.includes(target) || target.includes(nm));
        const zipMatch = !!opts.zip && digits(o.shipping_post_code) === digits(opts.zip);
        if (sameName && zipMatch) {
          return {
            found: true,
            salesorderId: candidateIds[0],
            salesorderNo: o.salesorder_no ?? null,
            currentTracking: o.tracking_no || o.tracking_number || null,
            currentShipper: o.shipper || null,
            refMatch: false,
            zipMatch: true,
            picklistExist: !!o.picklist_exist,
            note: "cocok lewat nama + kodepos (ref_no belum terkonfirmasi)",
          };
        }
      }
    } catch {
      /* abaikan */
    }
  }

  return notFound("ada kandidat tapi tidak ada yang cocok ref_no/kodepos");
}

/** Tulis AWB + kurir ke satu sales order Jubelio. */
export async function writeJubelioAwb(
  token: string,
  salesorderId: number,
  trackingNo: string,
  shipper: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await jfetch(token, "/sales/orders/save-airwaybill/", {
    method: "POST",
    body: JSON.stringify({ salesorder_id: salesorderId, tracking_no: trackingNo, shipper }),
  });
  if (res.ok) return { ok: true };
  const j: any = await res.json().catch(() => ({}));
  const msg = j?.message || `HTTP ${res.status}`;
  if (/picklist/i.test(msg)) return { ok: false, error: "order belum diproses di Jubelio (belum ada picklist)" };
  return { ok: false, error: msg };
}
