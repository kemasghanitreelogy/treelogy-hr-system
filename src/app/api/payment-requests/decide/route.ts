import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapPaymentRequest } from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";
import { salinKeSheet } from "../sheet-sync";

export const runtime = "nodejs";

/**
 * Keputusan persetujuan dua tahap.
 *
 * Tahap ditentukan STATUS baris, bukan pilihan client — pemegang kedua izin
 * sekalipun tidak bisa melompati antrean:
 *  - waiting_ops     → butuh payment.approve_ops (Admin Operasional); Finance/HR
 *                      boleh sebagai cadangan bila approver ops berhalangan.
 *  - waiting_finance → butuh payment.manage (Finance/HR).
 *
 * Setuju di tahap 1 sekaligus menyalin baris ke Google Sheet keuangan — inilah
 * momen pengajuan "sampai ke Finance". Kegagalan penyalinan TIDAK membatalkan
 * persetujuan; barisnya bisa dikirim ulang seperti biasa.
 */
export async function POST(request: Request) {
  let body: { id?: string; action?: "approve" | "reject"; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  if (body.action !== "approve" && body.action !== "reject") {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }
  if (body.action === "reject" && !body.reason?.trim()) {
    return NextResponse.json({ error: "reason_required" }, { status: 400 });
  }

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const { data: row } = await supabase.from("payment_requests").select("*").eq("id", body.id).maybeSingle();
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const current = mapPaymentRequest(row);

  const isFinance = can(user, "payment.manage") || can(user, "employees.manage");
  const isOps = can(user, "payment.approve_ops") || isFinance;

  const now = new Date().toISOString();
  let patch: Record<string, unknown>;

  if (current.approvalStatus === "waiting_ops") {
    if (!isOps) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
    patch =
      body.action === "approve"
        ? { approval_status: "waiting_finance", ops_approver: user.name, ops_approved_at: now }
        : {
            approval_status: "rejected",
            rejected_by: user.name,
            rejected_at: now,
            rejection_reason: body.reason!.trim(),
          };
  } else if (current.approvalStatus === "waiting_finance") {
    if (!isFinance) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
    patch =
      body.action === "approve"
        ? { approval_status: "approved", finance_approver: user.name, finance_approved_at: now }
        : {
            approval_status: "rejected",
            rejected_by: user.name,
            rejected_at: now,
            rejection_reason: body.reason!.trim(),
          };
  } else {
    return NextResponse.json({ error: "already_decided" }, { status: 400 });
  }

  // Update lewat sesi pengguna → RLS (approve_ops/manage/HR) tetap jadi pagar kedua.
  const { data, error } = await supabase
    .from("payment_requests")
    .update(patch)
    .eq("id", body.id)
    .eq("approval_status", current.approvalStatus) // tolak keputusan ganda yang balapan
    .select("*")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });

  let saved = mapPaymentRequest(data);

  // Lolos tahap 1 → sekarang barisnya "berangkat" ke Finance (Google Sheet).
  let sheet: { ok: boolean; reason?: string } = { ok: true };
  if (current.approvalStatus === "waiting_ops" && body.action === "approve") {
    const result = await salinKeSheet(saved, new URL(request.url).origin);
    sheet = result.ok ? { ok: true } : { ok: false, reason: result.reason };
    saved = {
      ...saved,
      sheetStatus: result.ok ? "synced" : "failed",
      sheetError: result.ok ? null : result.reason,
      sheetSyncedAt: result.ok ? now : null,
    };
  }

  return NextResponse.json({ ok: true, request: saved, sheet });
}
