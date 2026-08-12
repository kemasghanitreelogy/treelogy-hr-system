import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapPaymentRequest } from "@/lib/data";
import { getSessionUser } from "@/lib/auth";
import { notifyPermissionHolders } from "@/lib/notify";
import { isValidUploadedPath } from "@/lib/storage-path";
import { rupiah } from "@/lib/utils";
import { can } from "@/lib/auth";
import { sheetsMode } from "@/lib/sheets";
import { DEPARTMENTS, KINDS, MAX_INVOICE_FILES, composeInvoiceLine } from "@/lib/payment-request";
import { salinKeSheet } from "./sheet-sync";
import type { PaymentDept, PaymentKind } from "@/lib/types";

export const runtime = "nodejs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FILE_EXTS = ["jpg", "jpeg", "png", "webp", "heic", "pdf"];
const MAX_RUPIAH = 10_000_000_000;

interface Payload {
  department?: PaymentDept;
  kind?: PaymentKind;
  kindOther?: string;
  invoiceDate?: string;
  description?: string;
  vendorName?: string;
  totalAmount?: number;
  invoicePaths?: string[];
  approvalPath?: string;
  dueDate?: string | null;
  moreDetails?: string;
}

export async function POST(request: Request) {
  let body: Payload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.department || !DEPARTMENTS.includes(body.department)) {
    return NextResponse.json({ error: "department_required" }, { status: 400 });
  }
  if (!body.kind || !KINDS.includes(body.kind)) {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }
  if (body.kind === "other" && !body.kindOther?.trim()) {
    return NextResponse.json({ error: "invalid_kind_other" }, { status: 400 });
  }
  if (!body.description?.trim()) {
    return NextResponse.json({ error: "description_required" }, { status: 400 });
  }
  if (!body.invoiceDate || !ISO_DATE.test(body.invoiceDate)) {
    return NextResponse.json({ error: "invoice_date_required" }, { status: 400 });
  }
  if (!body.vendorName?.trim()) {
    return NextResponse.json({ error: "vendor_required" }, { status: 400 });
  }
  const amount = Number(body.totalAmount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_RUPIAH) {
    return NextResponse.json({ error: "amount_required" }, { status: 400 });
  }
  if (body.dueDate && !ISO_DATE.test(body.dueDate)) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!user.employeeId) return NextResponse.json({ error: "no_employee" }, { status: 400 });

  // Berkas diunggah klien langsung ke bucket privat; di sini hanya bentuk
  // path-nya yang diperiksa (RLS storage sudah menjaga hak tulisnya).
  const invoicePaths = (body.invoicePaths ?? []).filter(Boolean);
  if (invoicePaths.length === 0) {
    return NextResponse.json({ error: "invoice_required" }, { status: 400 });
  }
  if (invoicePaths.length > MAX_INVOICE_FILES) {
    return NextResponse.json({ error: "too_many_files" }, { status: 400 });
  }
  if (!body.approvalPath) {
    return NextResponse.json({ error: "approval_required" }, { status: 400 });
  }
  for (const path of [...invoicePaths, body.approvalPath]) {
    if (!isValidUploadedPath(path, user.employeeId, FILE_EXTS)) {
      return NextResponse.json({ error: "invalid_path" }, { status: 400 });
    }
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const { data, error } = await supabase
    .from("payment_requests")
    .insert({
      employee_id: user.employeeId,
      department: body.department,
      requester_name: user.name,
      email: user.email,
      kind: body.kind,
      kind_other: body.kind === "other" ? body.kindOther!.trim() : null,
      invoice_date: body.invoiceDate,
      description: body.description.trim(),
      vendor_name: body.vendorName.trim(),
      total_amount: Math.round(amount),
      invoice_paths: invoicePaths,
      approval_path: body.approvalPath,
      due_date: body.dueDate || null,
      more_details: body.moreDetails?.trim() || null,
      // Modul ini TIDAK memakai antrean persetujuan: begitu dikirim, baris
      // langsung tercatat DAN disalin ke Google Sheet keuangan.
      approval_status: "approved",
      sheet_status: "pending",
    })
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });

  const saved = mapPaymentRequest(data);

  // Salin ke Google Sheet keuangan SEKARANG — tidak ada tahap persetujuan yang
  // menahan. Kegagalan di sini tidak membatalkan pengajuan: barisnya sudah aman
  // di database dan bisa dikirim ulang dari detail.
  const result = await salinKeSheet(saved, new URL(request.url).origin);

  // Finance diberi tahu ada pengajuan baru (pemberitahuan, bukan permintaan approval).
  await notifyPermissionHolders(
    "payment.manage",
    {
      type: "payment",
      title: `${user.name} mengajukan pembayaran`,
      body: `${composeInvoiceLine(saved)} · ${rupiah(saved.totalAmount)}`,
      href: "/payment-requests",
    },
    { excludeEmployeeId: user.employeeId },
  );

  return NextResponse.json({
    ok: true,
    request: {
      ...saved,
      sheetStatus: result.ok ? "synced" : "failed",
      sheetError: result.ok ? null : result.reason,
      sheetSyncedAt: result.ok ? new Date().toISOString() : null,
    },
    sheet: result.ok ? { ok: true } : { ok: false, reason: result.reason, mode: sheetsMode() },
  });
}

// ---- Kirim ulang baris yang gagal masuk sheet (Finance/HR) ----
export async function PATCH(request: Request) {
  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  // Wajib diperiksa di sini: status ditulis memakai service role, jadi RLS tidak
  // menjaga endpoint ini. Tanpa pemeriksaan, siapa pun bisa menambah baris sheet.
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user, "payment.manage") && !can(user, "employees.manage")) {
    return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  }

  const { data: row } = await supabase.from("payment_requests").select("*").eq("id", body.id).maybeSingle();
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Penjaga anti-duplikat: baris yang sudah masuk sheet tidak dikirim lagi.
  if (row.sheet_status === "synced") {
    return NextResponse.json({ error: "already_synced" }, { status: 400 });
  }

  const result = await salinKeSheet(mapPaymentRequest(row), new URL(request.url).origin);
  const { data } = await supabase.from("payment_requests").select("*").eq("id", body.id).maybeSingle();
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({
    ok: result.ok,
    request: mapPaymentRequest(data),
    reason: result.ok ? null : result.reason,
  });
}
