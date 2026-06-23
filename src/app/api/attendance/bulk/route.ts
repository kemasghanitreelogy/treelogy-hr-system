import { NextResponse } from "next/server";
import { can, getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Status yang menciptakan baris absensi; "off" berarti TIDAK ada baris → dihapus.
const RECORD = new Set(["present", "late", "sick", "leave", "absent"]);
const VALID = new Set([...RECORD, "off"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface Change {
  employeeId?: string;
  date?: string;
  status?: string;
}

/**
 * Bulk-edit absensi (HR/superadmin). Terima daftar perubahan sel grid:
 *  - status record (present/late/sick/leave/absent) → upsert (employee_id,date)
 *  - "off" → hapus baris (konvensi: hari libur tidak menyimpan baris)
 * Permission `attendance.manage` diverifikasi di sini; tulis pakai service-role
 * agar upsert & delete massal tidak terganjal cakupan policy RLS per-baris.
 */
export async function POST(req: Request) {
  let body: { changes?: Change[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const changes = body?.changes;
  if (!Array.isArray(changes) || changes.length === 0) {
    return NextResponse.json({ error: "no_changes" }, { status: 400 });
  }
  if (changes.length > 3000) {
    return NextResponse.json({ error: "too_many" }, { status: 400 });
  }

  const user = await getSessionUser();
  if (!can(user, "attendance.manage")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const upserts: Record<string, unknown>[] = [];
  const delByEmp = new Map<string, string[]>();
  for (const c of changes) {
    if (
      !c ||
      typeof c.employeeId !== "string" ||
      typeof c.date !== "string" ||
      !DATE_RE.test(c.date) ||
      typeof c.status !== "string" ||
      !VALID.has(c.status)
    ) {
      return NextResponse.json({ error: "invalid_change" }, { status: 400 });
    }
    if (c.status === "off") {
      const arr = delByEmp.get(c.employeeId) ?? [];
      arr.push(c.date);
      delByEmp.set(c.employeeId, arr);
    } else {
      // Hanya set status + source; kolom lain (clock_in/out dll) dibiarkan utuh
      // pada baris yang sudah ada, jadi jam clock-in asli tidak terhapus.
      upserts.push({ employee_id: c.employeeId, date: c.date, status: c.status, source: "manual" });
    }
  }

  try {
    if (upserts.length) {
      const { error } = await admin.from("attendance").upsert(upserts, { onConflict: "employee_id,date" });
      if (error) throw error;
    }
    for (const [employeeId, dates] of delByEmp) {
      const { error } = await admin.from("attendance").delete().eq("employee_id", employeeId).in("date", dates);
      if (error) throw error;
    }
  } catch (e) {
    return NextResponse.json({ error: "write_failed", detail: (e as Error).message }, { status: 500 });
  }

  const deleted = [...delByEmp.values()].reduce((s, a) => s + a.length, 0);
  return NextResponse.json({ ok: true, upserted: upserts.length, deleted });
}
