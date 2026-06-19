import "server-only";
import { createAdminClient } from "./supabase/admin";
import { sendPushToEmployees } from "./push/send";
import type { NotifTone } from "./types";

export interface NewNotification {
  employeeId: string;
  type: string;
  tone: NotifTone;
  title: string;
  body?: string;
  href?: string;
}

/**
 * Deliver a notification two ways (both best-effort, never fail the request):
 *  1. in-app bell row (notifications table)
 *  2. real web push to the recipient's subscribed devices (so it reaches the phone)
 * Returns the web-push send counts.
 */
export async function pushNotifications(rows: NewNotification[]): Promise<{ sent: number; failed: number }> {
  if (rows.length === 0) return { sent: 0, failed: 0 };
  const admin = createAdminClient();
  if (!admin) return { sent: 0, failed: 0 };

  // 1) In-app bell.
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
    /* non-critical */
  }

  // 2) Web push to the device(s), tailored per recipient row.
  let sent = 0;
  let failed = 0;
  try {
    const results = await Promise.all(
      rows.map((r) =>
        sendPushToEmployees(admin, [r.employeeId], { title: r.title, body: r.body, url: r.href, tag: r.type }),
      ),
    );
    for (const res of results) {
      sent += res.sent;
      failed += res.failed;
    }
  } catch {
    /* non-critical */
  }
  return { sent, failed };
}

/** Notify the people who can act on a request: HR/admin + the requester's direct atasan. */
export async function notifyApprovers(
  requesterEmployeeId: string,
  content: { type: string; title: string; body?: string; href?: string },
): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  try {
    const { data } = await admin.rpc("approver_employees", {
      req_employee: requesterEmployeeId,
    });
    const ids: string[] = (data ?? []).map((r: { employee_id: string }) => r.employee_id);
    await pushNotifications(
      ids.map((id) => ({ employeeId: id, tone: "pending" as const, ...content })),
    );
  } catch {
    /* best-effort */
  }
}
