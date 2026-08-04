import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapTravelRequest } from "@/lib/data";
import { notifyApprovers, pushNotifications } from "@/lib/notify";
import { formatDate } from "@/lib/utils";
import { applyApproval, type ApprovalAction } from "@/lib/approval";
import { TRANSPORTS, travelDuration, travelTotal } from "@/lib/travel";
import { can, getSessionUser } from "@/lib/auth";
import type { RequestStatus, TravelTransport } from "@/lib/types";

export const runtime = "nodejs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Batas kewarasan: satu perjalanan dinas maksimal ~3 bulan. */
const MAX_DURATION_DAYS = 92;
const MAX_RUPIAH = 1_000_000_000;

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
  confirmed?: boolean;
}

interface UpdatePayload {
  id?: string;
  action?: ApprovalAction;
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

// ---- Ajukan perjalanan dinas ----
export async function POST(req: Request) {
  let body: CreatePayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.employeeId) return NextResponse.json({ error: "employee_required" }, { status: 400 });
  if (!body.purpose?.trim()) return NextResponse.json({ error: "purpose_required" }, { status: 400 });
  if (!body.destination?.trim()) return NextResponse.json({ error: "destination_required" }, { status: 400 });
  if (!body.departureDate || !ISO_DATE.test(body.departureDate) || !body.returnDate || !ISO_DATE.test(body.returnDate)) {
    return NextResponse.json({ error: "invalid_dates" }, { status: 400 });
  }
  if (body.returnDate < body.departureDate) {
    return NextResponse.json({ error: "end_before_start" }, { status: 400 });
  }
  const transport: TravelTransport = body.transport ?? "company_vehicle";
  if (!TRANSPORTS.includes(transport)) {
    return NextResponse.json({ error: "invalid_transport" }, { status: 400 });
  }
  // Pernyataan karyawan pada form asli — wajib, dan diperiksa di server juga
  // supaya tidak bisa dilewati dengan memanggil API langsung.
  if (body.confirmed !== true) {
    return NextResponse.json({ error: "confirmation_required" }, { status: 400 });
  }

  const durationDays = travelDuration(body.departureDate, body.returnDate);
  if (durationDays < 1 || durationDays > MAX_DURATION_DAYS) {
    return NextResponse.json({ error: "out_of_range" }, { status: 400 });
  }

  const costs = {
    costTransport: money(body.costTransport),
    costAccommodation: money(body.costAccommodation),
    costPerDiem: money(body.costPerDiem),
    costOther: money(body.costOther),
  };
  if (Object.values(costs).some((v) => v === null)) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  }
  const parts = costs as { [K in keyof typeof costs]: number };
  const costTotal = travelTotal(parts);

  const advanceRequired = body.advanceRequired === true;
  const advanceRaw = money(body.advanceAmount);
  if (advanceRaw === null) return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
  // Tidak minta uang muka → nominalnya dipaksa 0, apa pun isi form.
  const advanceAmount = advanceRequired ? advanceRaw : 0;
  if (advanceRequired && advanceAmount <= 0) {
    return NextResponse.json({ error: "advance_amount_required" }, { status: 400 });
  }
  if (advanceAmount > costTotal) {
    return NextResponse.json({ error: "advance_exceeds_total" }, { status: 400 });
  }

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

  const row = {
    employee_id: body.employeeId,
    job_title: (emp.position as string)?.trim() || "—",
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
    status: "pending",
  };

  const { data, error } = await supabase!.from("travel_requests").insert(row).select("*").single();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });

  await notifyApprovers(body.employeeId, {
    type: "travel",
    title: `${emp.name ?? "Karyawan"} mengajukan perjalanan dinas`,
    body: `${row.destination} · ${formatDate(row.departure_date)} · ${durationDays} hari · perlu persetujuan Anda`,
    href: "/travel",
  });

  return NextResponse.json({ ok: true, request: mapTravelRequest(data) });
}

// ---- Persetujuan ganda: atasan dulu, lalu HR. RLS menentukan siapa boleh menulis. ----
export async function PATCH(req: Request) {
  let body: UpdatePayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  if (!body.action || !["approve", "reject", "reset"].includes(body.action)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  if (body.action === "reject" && !body.reason?.trim()) {
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

  const isHR = can(user, "employees.manage");
  let isManager = false;
  if (!isHR) {
    const { data: mgr } = await supabase!.rpc("is_manager_of", { target_employee: prev.employee_id });
    isManager = mgr === true;
  }
  if (body.action === "reset" && !isHR) {
    return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  }
  if (body.action !== "reset" && !isHR && !isManager) {
    return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  }

  // Langkah atasan hanya wajib bila pengaju punya atasan langsung.
  const { data: needMgr } = await supabase!.rpc("employee_requires_manager", { emp: prev.employee_id });
  const managerRequired = needMgr === true;

  const result = applyApproval({
    action: body.action,
    role: isHR ? "hr" : "manager",
    actorName: user.name,
    managerRequired,
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
    .update(result.update)
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
