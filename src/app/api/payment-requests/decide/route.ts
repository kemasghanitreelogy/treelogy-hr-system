import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapPaymentRequest } from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";
import { notifyPermissionHolders, pushNotifications } from "@/lib/notify";
import { rupiah } from "@/lib/utils";
import { composeInvoiceLine } from "@/lib/payment-request";
import { salinKeSheet } from "../sheet-sync";

export const runtime = "nodejs";

/**
 * Keputusan persetujuan dua tahap — HANYA untuk pengajuan jalur "dinas".
 *
 * Tahap ditentukan STATUS baris, bukan pilihan client:
 *  · waiting_ops     → butuh payment.approve_ops (Admin Operasional/GA).
 *  · waiting_finance → butuh payment.manage (Finance).
 *
 * Persetujuan AKHIR sekaligus menyalin baris ke Google Sheet keuangan — itulah
 * momen pengajuan dinas "sampai ke Finance". Kegagalan penyalinan tidak
 * membatalkan persetujuan; barisnya bisa dikirim ulang seperti biasa.
 *
 * Empat mata: tidak ada yang boleh memutus pengajuannya sendiri, dan kedua
 * tahap wajib ditandatangani orang yang berbeda.
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

  // Jalur biasa tidak punya antrean persetujuan sama sekali.
  if (current.flow !== "dinas") return NextResponse.json({ error: "already_decided" }, { status: 400 });
  if (current.employeeId === user.employeeId) {
    return NextResponse.json({ error: "self_approval" }, { status: 403 });
  }

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
    // Empat mata: tahap akhir wajib orang yang berbeda dari tahap 1.
    if (body.action === "approve" && current.opsApprover === user.name) {
      return NextResponse.json({ error: "distinct_approver" }, { status: 400 });
    }
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

  const { data, error } = await supabase
    .from("payment_requests")
    .update(patch)
    .eq("id", body.id)
    .eq("approval_status", current.approvalStatus) // tolak keputusan ganda yang balapan
    .select("*")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });

  let saved = mapPaymentRequest(data);
  const ringkas = `${composeInvoiceLine(saved)} · ${rupiah(saved.totalAmount)}`;
  let sheet: { ok: boolean; reason?: string } = { ok: true };

  if (saved.approvalStatus === "waiting_finance") {
    // Lolos tahap 1 → giliran Finance beraksi; pengaju diberi kabar kemajuan.
    await notifyPermissionHolders(
      "payment.manage",
      {
        type: "payment",
        title: "Reimburse dinas menunggu persetujuan Finance",
        body: `${ringkas} · lolos tahap 1 (${user.name}) · perlu keputusan Anda`,
        href: "/payment-requests",
      },
      { excludeEmployeeId: user.employeeId },
    );
    if (saved.employeeId) {
      await pushNotifications([
        {
          employeeId: saved.employeeId,
          type: "payment",
          tone: "approved",
          title: "Reimburse dinas lolos tahap 1",
          body: `${ringkas} · disetujui ${user.name} · menunggu Finance`,
          href: "/payment-requests",
        },
      ]);
    }
  } else if (saved.approvalStatus === "approved") {
    // Persetujuan AKHIR → baru sekarang barisnya masuk Google Sheet keuangan.
    const result = await salinKeSheet(saved, new URL(request.url).origin);
    sheet = result.ok ? { ok: true } : { ok: false, reason: result.reason };
    saved = {
      ...saved,
      sheetStatus: result.ok ? "synced" : "failed",
      sheetError: result.ok ? null : result.reason,
      sheetSyncedAt: result.ok ? now : null,
    };
    if (saved.employeeId) {
      await pushNotifications([
        {
          employeeId: saved.employeeId,
          type: "payment",
          tone: "paid",
          title: "Reimburse dinas disetujui",
          body: `${ringkas} · diproses ${user.name}`,
          href: "/payment-requests",
        },
      ]);
    }
  } else if (saved.approvalStatus === "rejected" && saved.employeeId) {
    await pushNotifications([
      {
        employeeId: saved.employeeId,
        type: "payment",
        tone: "rejected",
        title: "Reimburse dinas ditolak",
        body: `${ringkas} · oleh ${user.name}: "${saved.rejectionReason ?? ""}" · Buka untuk perbaiki & kirim ulang`,
        href: "/payment-requests",
      },
    ]);
  }

  return NextResponse.json({ ok: true, request: saved, sheet });
}
