/**
 * Dual-approval state machine for leave & overtime requests.
 *
 * Rules (per product decision):
 *  - The employee's team manager (atasan) approves FIRST, then HR finalises.
 *  - If the team has no manager, HR alone can approve.
 *  - A reject by either side immediately → rejected.
 *  - HR/admin may "reset" a decided request back to pending (correction).
 *
 * Pure function: given the current per-side state and the acting role, it returns
 * the snake_case column updates to persist. Both tables share these columns.
 */

import type { RequestStatus } from "@/lib/types";

export type ApprovalAction = "approve" | "reject" | "reset";
export type ApprovalRole = "manager" | "hr";

export interface ApprovalCurrent {
  status: RequestStatus;
  managerApprover: string | null;
  hrApprover: string | null;
}

export interface ApprovalResult {
  /** Error code when the action isn't allowed (maps via apiErrorMessage). */
  error?: string;
  /** snake_case columns to write (undefined when error). */
  update?: Record<string, unknown>;
  /** Resulting status (for balance/notification decisions). */
  status: RequestStatus;
}

export function applyApproval(opts: {
  action: ApprovalAction;
  role: ApprovalRole;
  actorName: string;
  managerRequired: boolean;
  current: ApprovalCurrent;
  nowIso: string;
  /** Required when action === "reject": the approver's reason, shown to the requester. */
  reason?: string | null;
}): ApprovalResult {
  const { action, role, actorName, managerRequired, current, nowIso, reason } = opts;

  // Reset: HR/admin only (enforced by the caller) → clear back to pending.
  if (action === "reset") {
    return {
      status: "pending",
      update: {
        status: "pending",
        approver: null,
        rejection_reason: null,
        manager_approver: null,
        manager_approved_at: null,
        hr_approver: null,
        hr_approved_at: null,
      },
    };
  }

  // Once decided, only a reset can change it.
  if (current.status !== "pending") {
    return { error: "already_decided", status: current.status };
  }

  if (action === "reject") {
    const trimmed = (reason ?? "").trim();
    if (!trimmed) return { error: "reason_required", status: "pending" };
    return {
      status: "rejected",
      update: { status: "rejected", approver: actorName, rejection_reason: trimmed },
    };
  }

  // --- approve ---
  if (role === "manager") {
    if (current.managerApprover) return { error: "already_decided", status: "pending" };
    // Manager approval never completes on its own — HR must still finalise.
    return {
      status: "pending",
      update: { manager_approver: actorName, manager_approved_at: nowIso },
    };
  }

  // role === "hr": enforce manager-first ordering.
  if (managerRequired && !current.managerApprover) {
    return { error: "awaiting_manager", status: "pending" };
  }
  return {
    status: "approved",
    update: { hr_approver: actorName, hr_approved_at: nowIso, status: "approved", approver: actorName },
  };
}
