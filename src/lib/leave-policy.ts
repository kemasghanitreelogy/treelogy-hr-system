/**
 * Annual-leave entitlement policy (Indonesian labour law / UU Ketenagakerjaan):
 * an employee earns NO annual leave during their first 12 months of continuous
 * service, then 12 days per year. Tenure is counted from the employee's earliest
 * contract start date (falling back to their join date).
 */

import type { Employee, EmployeeContract, LeaveBalance, LeaveRequest } from "@/lib/types";

export const ANNUAL_QUOTA = 12;

/** Whole months of service completed between `startISO` and `asOf`. */
function completedMonths(startISO: string, asOf: Date): number {
  const start = new Date(startISO);
  if (isNaN(start.getTime())) return 0;
  let m = (asOf.getFullYear() - start.getFullYear()) * 12 + (asOf.getMonth() - start.getMonth());
  if (asOf.getDate() < start.getDate()) m -= 1; // not a full month yet
  return m;
}

/** Entitlement: 0 in the first year of service, then `ANNUAL_QUOTA`. */
export function annualQuotaFor(startISO: string | null | undefined, asOf: Date = new Date()): number {
  if (!startISO) return 0;
  return completedMonths(startISO, asOf) >= 12 ? ANNUAL_QUOTA : 0;
}

// --- Per-period leave history (one entry per 12-month service year) ----------

export interface LeavePeriod {
  /** 1-based service year (year 1 = first year, no entitlement). */
  index: number;
  /** Inclusive ISO start (the service-year anniversary). */
  startISO: string;
  /** Inclusive ISO end (the day before the next anniversary). */
  endISO: string;
  /** Annual-leave entitlement for this period (0 in year 1, then ANNUAL_QUOTA). */
  quota: number;
  /** Approved annual-leave days taken within this period. */
  used: number;
  /** True for the period that contains `asOf`. */
  current: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Anniversary ISO for the start date shifted by `years`. */
function shiftYearISO(startISO: string, years: number): string {
  const [y, m, d] = startISO.split("-").map(Number);
  return `${y + years}-${pad(m)}-${pad(d)}`;
}
/** Day before an ISO date (UTC-based to avoid timezone drift). */
function dayBeforeISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/**
 * Annual-leave history split into 12-month service-year periods from the
 * (earliest contract) start date. `used` is the sum of approved annual-leave
 * days whose start date falls inside each window. Newest period first.
 */
export function leaveHistory(
  startISO: string | null | undefined,
  requests: LeaveRequest[],
  asOf: Date = new Date(),
): LeavePeriod[] {
  if (!startISO || isNaN(new Date(startISO).getTime())) return [];
  const asOfISO = `${asOf.getFullYear()}-${pad(asOf.getMonth() + 1)}-${pad(asOf.getDate())}`;
  const annual = requests.filter((r) => r.type === "annual" && r.status === "approved");

  const periods: LeavePeriod[] = [];
  for (let k = 0; ; k++) {
    const ws = shiftYearISO(startISO, k);
    if (ws > asOfISO) break; // period hasn't begun yet
    const we = shiftYearISO(startISO, k + 1); // exclusive upper bound
    const used = annual
      .filter((r) => r.startDate >= ws && r.startDate < we)
      .reduce((s, r) => s + r.days, 0);
    periods.push({
      index: k + 1,
      startISO: ws,
      endISO: dayBeforeISO(we),
      quota: k === 0 ? 0 : ANNUAL_QUOTA,
      used,
      current: asOfISO >= ws && asOfISO < we,
    });
  }
  return periods.reverse();
}

/** Earliest contract start date per employee id. */
export function earliestContractStart(contracts: EmployeeContract[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of contracts) {
    const cur = m.get(c.employeeId);
    if (!cur || c.startDate < cur) m.set(c.employeeId, c.startDate);
  }
  return m;
}

/**
 * Re-derive each balance's annual quota from tenure. First-year employees get 0;
 * `annualUsed` is clamped to the quota so "remaining" never reads negative.
 */
export function applyTenureQuota(
  balances: LeaveBalance[],
  employees: Pick<Employee, "id" | "joinDate">[],
  contracts: EmployeeContract[],
  asOf: Date = new Date(),
): LeaveBalance[] {
  const starts = earliestContractStart(contracts);
  const joinById = new Map(employees.map((e) => [e.id, e.joinDate]));
  return balances.map((b) => {
    const start = starts.get(b.employeeId) ?? joinById.get(b.employeeId) ?? null;
    const annualQuota = annualQuotaFor(start, asOf);
    return { ...b, annualQuota, annualUsed: Math.min(b.annualUsed, annualQuota) };
  });
}
