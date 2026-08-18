import { NextResponse } from "next/server";
import { can, getSessionUser } from "@/lib/auth";
import { findJubelioOrder, jubelioLogin, writeJubelioAwb } from "@/lib/receipt/jubelio";

export const runtime = "nodejs";
// Satu permintaan bisa memanggil banyak endpoint Jubelio berurutan
// (kandidat × halaman). Default Vercel sekarang 300 s, jadi 120 aman di semua plan.
export const maxDuration = 120;

interface Row {
  page: number;
  name: string;
  legacyId: string;
  zip: string;
  awb: string;
  courier: string;
}

/**
 * `mode=preview` → uji coba: cari order Jubelio-nya dan laporkan apa yang AKAN
 * ditulis, tanpa menulis apa pun. `mode=push` → menulis, tetapi mengulang
 * pencarian & konfirmasi dari nol lebih dulu, sehingga `salesorder_id` basi dari
 * klien tidak mungkin menyebabkan tulisan ke order yang salah.
 *
 * Order yang SUDAH punya resi tidak pernah ditimpa.
 */
export async function POST(req: Request) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { mode?: string; rows?: Row[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const mode = body.mode === "push" ? "push" : "preview";
  // Melihat pratinjau cukup dengan izin lihat; menulis ke ERP butuh izin sinkron.
  const perm = mode === "push" ? "receipt.sync" : "receipt.view";
  if (!can(me, perm)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return NextResponse.json({ results: [] });

  let token: string;
  try {
    token = await jubelioLogin();
  } catch (e) {
    const code = e instanceof Error && e.message === "jubelio_not_configured" ? "not_configured" : "jubelio_login_failed";
    return NextResponse.json({ error: code }, { status: code === "not_configured" ? 503 : 502 });
  }

  if (mode === "preview") {
    const results = [];
    for (const r of rows) {
      try {
        const f = await findJubelioOrder(token, { name: r.name, legacyId: r.legacyId, zip: r.zip });
        const writable = f.found && f.refMatch && !f.currentTracking && f.picklistExist;
        let status: string;
        if (!f.found) status = f.note;
        else if (f.currentTracking) status = `sudah ada resi ${f.currentTracking}`;
        else if (!f.refMatch) status = "ketemu lewat nama, ref_no belum terkonfirmasi — cek manual";
        else if (!f.picklistExist) status = "belum diproses di Jubelio (belum ada picklist)";
        else status = "siap ditulis";
        results.push({
          page: r.page,
          found: f.found,
          salesorderId: f.salesorderId,
          salesorderNo: f.salesorderNo,
          currentTracking: f.currentTracking,
          currentShipper: f.currentShipper,
          refMatch: f.refMatch,
          writable,
          awb: r.awb,
          courier: r.courier,
          status,
        });
      } catch {
        results.push({ page: r.page, found: false, writable: false, status: "gagal memeriksa" });
      }
    }
    return NextResponse.json({ mode, results });
  }

  // push — konfirmasi ulang tiap order sesaat sebelum menulis.
  const results = [];
  for (const r of rows) {
    try {
      const f = await findJubelioOrder(token, { name: r.name, legacyId: r.legacyId, zip: r.zip });
      if (!f.found || !f.refMatch || !f.salesorderId) {
        results.push({ page: r.page, ok: false, error: "tidak terkonfirmasi saat akan ditulis — dilewati" });
        continue;
      }
      if (f.currentTracking) {
        results.push({ page: r.page, ok: false, error: `sudah ada resi ${f.currentTracking} — dilewati` });
        continue;
      }
      if (!f.picklistExist) {
        results.push({ page: r.page, ok: false, error: "belum diproses di Jubelio (belum ada picklist) — dilewati" });
        continue;
      }
      if (!r.awb) {
        results.push({ page: r.page, ok: false, error: "tidak ada AWB untuk ditulis" });
        continue;
      }
      const w = await writeJubelioAwb(token, f.salesorderId, r.awb, r.courier || "");
      results.push({ page: r.page, ok: w.ok, error: w.error, salesorderNo: f.salesorderNo });
    } catch {
      results.push({ page: r.page, ok: false, error: "gagal menulis" });
    }
  }
  return NextResponse.json({ mode, results });
}
