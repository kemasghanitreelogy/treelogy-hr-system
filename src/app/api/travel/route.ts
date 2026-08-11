import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapTravelRequest } from "@/lib/data";
import { notifyPermissionHolders, pushNotifications } from "@/lib/notify";
import { formatDate } from "@/lib/utils";
import { applyApproval, type ApprovalAction } from "@/lib/approval";
import { TRANSPORTS, travelDuration, travelTotal } from "@/lib/travel";
import { can, getSessionUser } from "@/lib/auth";
import { isValidUploadedPath } from "@/lib/storage-path";
import type { RequestStatus, TravelTransport } from "@/lib/types";

export const runtime = "nodejs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Batas kewarasan: satu perjalanan dinas maksimal ~3 bulan. */
const MAX_DURATION_DAYS = 92;
const MAX_RUPIAH = 1_000_000_000;
/** Ekstensi bukti persetujuan atasan — sama dengan lampiran pengajuan pembayaran. */
const FILE_EXTS = ["jpg", "jpeg", "png", "webp", "heic", "pdf"];

interface CreatePayload {
  employeeId?: string;
  purpose?: string;
  destination?: string;
  departureDate?: string;
  returnDate?: string;
  transport?: TravelTransport;
  transportOther?: string;
  accommodationRequired?: boolean;
  accommodationDetails?: string;
  costTransport?: number;
  costAccommodation?: number;
  costPerDiem?: number;
  costOther?: number;
  advanceRequired?: boolean;
  advanceAmount?: number;
  remarks?: string;
  approvalPath?: string;
  confirmed?: boolean;
}

/**
 * Bukti persetujuan atasan WAJIB untuk pengajuan/revisi baru. Path harus
 * berbentuk `<employeeId>/<uuid>.<ext>` — folder milik karyawan yang diajukan,
 * bukan folder orang lain.
 */
function validasiBukti(path: string | undefined, employeeId: string): string | null {
  if (!path) return "approval_required";
  if (!isValidUploadedPath(path, employeeId, FILE_EXTS)) return "invalid_path";
  return null;
}

type TravelAction = ApprovalAction | "revise";

interface UpdatePayload {
  id?: string;
  action?: TravelAction;
  /** Wajib untuk "reject" (alasan) dan "revise" (apa yang harus diperbaiki). */
  reason?: string;
}

async function auth() {
  const supabase = await createClient();
  if (!supabase) return { error: NextResponse.json({ error: "unavailable" }, { status: 503 }) };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  return { supabase };
}

/** Rupiah non-negatif dan masuk akal; selain itu ditolak, bukan diam-diam di-nol-kan. */
function money(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > MAX_RUPIAH) return null;
  return Math.round(n);
}

/**
 * Validasi + hitung ulang nilai turunan. Dipakai POST (pengajuan baru) DAN PUT
 * (revisi oleh pengaju) supaya aturannya tidak pernah bercabang.
 * Mengembalikan kode error, atau kolom siap simpan (tanpa employee_id/job_title).
 */
function buildTravelRow(body: CreatePayload): { error: string } | { row: Record<string, unknown> } {
  if (!body.purpose?.trim()) return { error: "purpose_required" };
  if (!body.destination?.trim()) return { error: "destination_required" };
  if (!body.departureDate || !ISO_DATE.test(body.departureDate) || !body.returnDate || !ISO_DATE.test(body.returnDate)) {
    return { error: "invalid_dates" };
  }
  if (body.returnDate < body.departureDate) return { error: "end_before_start" };

  const transport: TravelTransport = body.transport ?? "company_vehicle";
  if (!TRANSPORTS.includes(transport)) return { error: "invalid_transport" };

  // Pernyataan karyawan pada form asli — diperiksa di server juga supaya tidak
  // bisa dilewati dengan memanggil API langsung.
  if (body.confirmed !== true) return { error: "confirmation_required" };

  const durationDays = travelDuration(body.departureDate, body.returnDate);
  if (durationDays < 1 || durationDays > MAX_DURATION_DAYS) return { error: "out_of_range" };

  const costs = {
    costTransport: money(body.costTransport),
    costAccommodation: money(body.costAccommodation),
    costPerDiem: money(body.costPerDiem),
    costOther: money(body.costOther),
  };
  if (Object.values(costs).some((v) => v === null)) return { error: "invalid_amount" };
  const parts = costs as { [K in keyof typeof costs]: number };
  const costTotal = travelTotal(parts);

  const advanceRequired = body.advanceRequired === true;
  const advanceRaw = money(body.advanceAmount);
  if (advanceRaw === null) return { error: "invalid_amount" };
  // Tidak minta uang muka → nominalnya dipaksa 0, apa pun isi form.
  const advanceAmount = advanceRequired ? advanceRaw : 0;
  if (advanceRequired && advanceAmount <= 0) return { error: "advance_amount_required" };
  if (advanceAmount > costTotal) return { error: "advance_exceeds_total" };

  return {
    row: {
      purpose: body.purpose.trim(),
      destination: body.destination.trim(),
      departure_date: body.departureDate,
      return_date: body.returnDate,
      duration_days: durationDays,
      transport,
      transport_other: transport === "other" ? body.transportOther?.trim() || null : null,
      accommodation_required: body.accommodationRequired === true,
      accommodation_details:
        body.accommodationRequired === true ? body.accommodationDetails?.trim() || null : null,
      cost_transport: parts.costTransport,
      cost_accommodation: parts.costAccommodation,
      cost_per_diem: parts.costPerDiem,
      cost_other: parts.costOther,
      cost_total: costTotal,
      advance_required: advanceRequired,
      advance_amount: advanceAmount,
      remarks: body.remarks?.trim() || null,
      confirmed: true,
    },
  };
}

// ---- Ajukan perjalanan dinas ----
export async function POST(req: Request) {
  let body: CreatePayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.employeeId) return NextResponse.json({ error: "employee_required" }, { status: 400 });
  const built = buildTravelRow(body);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });
  const buktiErr = validasiBukti(body.approvalPath, body.employeeId);
  if (buktiErr) return NextResponse.json({ error: buktiErr }, { status: 400 });

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;

  // Nama & jabatan TIDAK diketik pengaju — diambil dari data karyawan. Jabatan
  // di-snapshot agar riwayat tetap akurat kalau nanti ada promosi.
  const { data: emp } = await supabase!
    .from("employees")
    .select("name, position, team")
    .eq("id", body.employeeId)
    .maybeSingle();
  if (!emp) return NextResponse.json({ error: "unknown_employee" }, { status: 400 });

  const row: Record<string, unknown> = {
    ...built.row,
    employee_id: body.employeeId,
    job_title: (emp.position as string)?.trim() || "—",
    approval_path: body.approvalPath,
    status: "pending",
  };

  const { data, error } = await supabase!.from("travel_requests").insert(row).select("*").single();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });

  // Penyetuju ditentukan permission, bukan hierarki atasan.
  await notifyPermissionHolders(
    "travel.approve",
    {
      type: "travel",
      title: `${emp.name ?? "Karyawan"} mengajukan perjalanan dinas`,
      body: `${String(row.destination)} · ${formatDate(String(row.departure_date))} · ${String(row.duration_days)} hari · perlu persetujuan Anda`,
      href: "/travel",
    },
    { excludeEmployeeId: body.employeeId },
  );

  return NextResponse.json({ ok: true, request: mapTravelRequest(data) });
}

// ---- Keputusan penyetuju tunggal (pemegang travel.approve). RLS ikut menjaga. ----
export async function PATCH(req: Request) {
  let body: UpdatePayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  if (!body.action || !["approve", "reject", "reset", "revise"].includes(body.action)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  // Menolak DAN mengembalikan sama-sama wajib beralasan — pengaju harus tahu
  // apa yang salah, bukan sekadar melihat statusnya berubah.
  if ((body.action === "reject" || body.action === "revise") && !body.reason?.trim()) {
    return NextResponse.json({ error: "reason_required" }, { status: 400 });
  }

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: prev } = await supabase!
    .from("travel_requests")
    .select("status, employee_id, manager_approver, hr_approver, destination, departure_date, duration_days")
    .eq("id", body.id)
    .maybeSingle();
  if (!prev) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // SATU penyetuju: pemegang travel.approve. Tidak ada langkah atasan.
  if (!can(user, "travel.approve")) {
    return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  }

  // Kembalikan untuk revisi: status tetap/kembali 'pending', tanda tangan yang
  // sudah ada dihapus, dan catatan revisi disimpan agar pengaju tahu perbaikannya.
  if (body.action === "revise") {
    const { data: back, error: backErr } = await supabase!
      .from("travel_requests")
      .update({
        status: "pending",
        approver: null,
        rejection_reason: null,
        manager_approver: null,
        manager_approved_at: null,
        hr_approver: null,
        hr_approved_at: null,
        revision_note: body.reason!.trim(),
      })
      .eq("id", body.id)
      .select("*")
      .maybeSingle();
    if (backErr || !back) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });

    await pushNotifications([
      {
        employeeId: String(back.employee_id),
        type: "travel",
        tone: "pending",
        title: "Perjalanan dinas perlu revisi",
        body: `${back.destination} · ${user.name}: "${body.reason!.trim()}"`,
        href: "/travel",
      },
    ]);
    return NextResponse.json({ ok: true, request: mapTravelRequest(back) });
  }

  const result = applyApproval({
    action: body.action,
    role: "hr",
    actorName: user.name,
    // Tidak ada tahap atasan pada modul ini — penyetuju tunggal langsung final.
    managerRequired: false,
    current: {
      status: prev.status as RequestStatus,
      managerApprover: (prev.manager_approver as string) ?? null,
      hrApprover: (prev.hr_approver as string) ?? null,
    },
    nowIso: new Date().toISOString(),
    reason: body.reason,
  });
  if (result.error || !result.update) {
    return NextResponse.json({ error: result.error ?? "forbidden_or_failed" }, { status: 400 });
  }

  const { data, error } = await supabase!
    .from("travel_requests")
    // Keputusan final menghapus catatan revisi yang mungkin masih menempel.
    .update({ ...result.update, revision_note: null })
    .eq("id", body.id)
    .select("*")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });

  if (result.status === "approved" || result.status === "rejected") {
    const reasonNote =
      result.status === "rejected" && data.rejection_reason ? ` · "${data.rejection_reason}"` : "";
    await pushNotifications([
      {
        employeeId: String(data.employee_id),
        type: "travel",
        tone: result.status,
        title: `Perjalanan dinas ${result.status === "approved" ? "disetujui" : "ditolak"}`,
        body: `${data.destination} · ${formatDate(String(data.departure_date))}${
          data.approver ? ` · oleh ${data.approver}` : ""
        }${reasonNote}`,
        href: "/travel",
      },
    ]);
  }

  return NextResponse.json({ ok: true, request: mapTravelRequest(data) });
}

// ---- Revisi oleh PENGAJU: perbaiki datanya lalu kirim ulang ----
//
// Hanya pengajuan miliknya sendiri dan hanya selama masih 'pending' (RLS
// menegakkan hal yang sama, jadi pemeriksaan di sini bukan satu-satunya pagar).
// Nilai turunan dihitung ulang dengan fungsi yang sama seperti saat mengajukan,
// catatan revisi dibersihkan, lalu penyetuju diberi tahu ada kiriman ulang.
export async function PUT(req: Request) {
  let body: CreatePayload & { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  const built = buildTravelRow(body);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: prev } = await supabase!
    .from("travel_requests")
    .select("employee_id, status")
    .eq("id", body.id)
    .maybeSingle();
  if (!prev) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (prev.employee_id !== user.employeeId) {
    return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  }
  if (prev.status !== "pending") {
    return NextResponse.json({ error: "already_decided" }, { status: 400 });
  }
  const buktiErr = validasiBukti(body.approvalPath, String(prev.employee_id));
  if (buktiErr) return NextResponse.json({ error: buktiErr }, { status: 400 });

  const { data, error } = await supabase!
    .from("travel_requests")
    .update({ ...built.row, approval_path: body.approvalPath, revision_note: null })
    .eq("id", body.id)
    .select("*")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });

  await notifyPermissionHolders(
    "travel.approve",
    {
      type: "travel",
      title: `${user.name} memperbaiki pengajuan perjalanan dinas`,
      body: `${String(data.destination)} · ${formatDate(String(data.departure_date))} · perlu ditinjau ulang`,
      href: "/travel",
    },
    { excludeEmployeeId: user.employeeId },
  );

  return NextResponse.json({ ok: true, request: mapTravelRequest(data) });
}
