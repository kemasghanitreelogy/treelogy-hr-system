import "server-only";
import { createAdminClient } from "./supabase/admin";
import type { LeaveType } from "./types";

/**
 * Cached-balance mutations on leave_balances. These run through the service-role
 * client because approving a request (which a division manager may do) must be
 * able to write the balance even though balance writes are otherwise HR-only.
 * Best-effort: a null return means the balance could not be updated (no admin
 * client / no row), and the caller should surface that rather than silently lie.
 */

/** Current tabungan libur balance (days), or null when unavailable. */
export async function readTabunganBalance(employeeId: string): Promise<number | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("leave_balances")
    .select("tabungan_libur")
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (error) return null;
  return Number(data?.tabungan_libur ?? 0);
}

/** Adjust tabungan libur by `delta` days (clamped at 0). Returns the new balance or null. */
export async function adjustTabungan(employeeId: string, delta: number): Promise<number | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("leave_balances")
    .select("tabungan_libur")
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (!data) {
    const init = Math.max(0, delta);
    const { error } = await admin
      .from("leave_balances")
      .insert({ employee_id: employeeId, tabungan_libur: init });
    return error ? null : init;
  }
  const next = Math.max(0, Number(data.tabungan_libur ?? 0) + delta);
  const { error } = await admin
    .from("leave_balances")
    .update({ tabungan_libur: next })
    .eq("employee_id", employeeId);
  return error ? null : next;
}

/** Adjust the used-days counter for an approved/reversed leave (annual/sick only). */
export async function adjustLeaveUsage(
  employeeId: string,
  type: LeaveType,
  deltaDays: number,
): Promise<void> {
  const column = type === "annual" ? "annual_used" : type === "sick" ? "sick_used" : null;
  if (!column) return; // unpaid / tukar-libur don't draw from the annual or sick counters
  const admin = createAdminClient();
  if (!admin) return;
  const { data } = await admin
    .from("leave_balances")
    .select(column)
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (!data) {
    if (deltaDays > 0) {
      await admin.from("leave_balances").insert({ employee_id: employeeId, [column]: deltaDays });
    }
    return;
  }
  const next = Math.max(0, Number((data as Record<string, unknown>)[column] ?? 0) + deltaDays);
  await admin.from("leave_balances").update({ [column]: next }).eq("employee_id", employeeId);
}
