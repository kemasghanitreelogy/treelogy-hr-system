import "server-only";
import { createAdminClient } from "./supabase/admin";
import type { NotifTone } from "./types";

export interface NewNotification {
  employeeId: string;
  type: string;
  tone: NotifTone;
  title: string;
  body?: string;
  href?: string;
}

/** Insert notifications using the service-role client (bypasses RLS). Best-effort. */
export async function pushNotifications(rows: NewNotification[]): Promise<void> {
  if (rows.length === 0) return;
  const admin = createAdminClient();
  if (!admin) return;
  try {
    await admin.from("notifications").insert(
      rows.map((r) => ({
        employee_id: r.employeeId,
        type: r.type,
        tone: r.tone,
        title: r.title,
        body: r.body ?? null,
        href: r.href ?? null,
      })),
    );
  } catch {
    /* notifications are non-critical — never fail the main request */
  }
}

/** Notify the people who can act on a request: HR/admin + the requester's division manager. */
export async function notifyApprovers(
  requesterEmployeeId: string,
  team: string,
  content: { type: string; title: string; body?: string; href?: string },
): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  try {
    const { data } = await admin.rpc("approver_employees", {
      req_team: team,
      exclude_emp: requesterEmployeeId,
    });
    const ids: string[] = (data ?? []).map((r: { employee_id: string }) => r.employee_id);
    await pushNotifications(
      ids.map((id) => ({ employeeId: id, tone: "pending" as const, ...content })),
    );
  } catch {
    /* best-effort */
  }
}
