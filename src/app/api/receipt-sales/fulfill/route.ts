import { NextResponse } from "next/server";
import { can, getSessionUser } from "@/lib/auth";
import { fulfillMany, type FulfillInput } from "@/lib/receipt/fulfill";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Tandai order Shopify terkirim + isi nomor resi & tautan lacak.
 *
 * Ini menulis ke pesanan SUNGGUHAN dan — bila diminta — mengirim email ke
 * pembeli. Dipagari izinnya SENDIRI (`receipt.fulfill`), bukan menumpang
 * `receipt.sync` yang berarti menulis ke Jubelio — dua sistem yang berbeda,
 * dan menyatukannya membuat tim resi tidak bisa memakai fitur yang justru
 * jadi pekerjaan mereka sehari-hari.
 */
export async function POST(req: Request) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(me, "receipt.fulfill")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!process.env.STORE_NAME || !process.env.ADMIN_API_KEY) {
    return NextResponse.json({ error: "shopify_not_configured" }, { status: 503 });
  }

  let body: { items?: FulfillInput[]; notifyCustomer?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  // Batas kewarasan: satu berkas label biasanya puluhan halaman. Angka jauh di
  // atas itu berarti ada yang salah di sisi klien, dan ini operasi yang
  // mengirim email ke pembeli — lebih baik ditolak daripada dijalankan.
  if (items.length > 100) return NextResponse.json({ error: "too_many_pages" }, { status: 400 });

  // Bawaannya TIDAK memberi tahu pembeli. Mengirim email ke puluhan orang
  // adalah tindakan yang tidak bisa ditarik kembali, jadi ia harus diminta
  // secara sadar, bukan terjadi karena nilai bawaan.
  const notifyCustomer = body.notifyCustomer === true;

  const results = await fulfillMany(items, notifyCustomer);
  return NextResponse.json({
    results,
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  });
}
