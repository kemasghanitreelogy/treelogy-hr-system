import type { ContractType } from "./types";

/** Hourly overtime base rate = monthly base salary / 20 working days / 8 hours. */
export const OVERTIME_DIVISOR = 20 * 8; // 160

/** Base hourly rate (rounded) snapshotted on each request for display. */
export function overtimeRatePerHour(baseSalary: number): number {
  return Math.round((Number(baseSalary) || 0) / OVERTIME_DIVISOR);
}

/** Narrow a raw DB value to a ContractType (unknown → 'pkwt'). */
export function parseContractType(v: unknown): ContractType {
  return v === "pkwtt" || v === "parttime" ? v : "pkwt";
}

/**
 * Hourly rate per contract type: part-timers already carry an explicit
 * hourly wage; monthly staff derive it from the base salary (÷160).
 */
export function contractRatePerHour(type: ContractType, baseSalary: number, hourlyRate: number): number {
  return type === "parttime" ? Math.round(Number(hourlyRate) || 0) : overtimeRatePerHour(baseSalary);
}

/** Apply the contract-type multipliers to an hourly rate (unrounded). */
function payFromRate(rate: number, hours: number, type: ContractType): number {
  const h = Math.max(Number(hours) || 0, 0);
  if (type === "pkwtt") {
    // 1 jam pertama 1.5×, sisanya 2× (per pengajuan lembur).
    return rate * 1.5 * Math.min(h, 1) + rate * 2 * Math.max(h - 1, 0);
  }
  // PKWT & part-time: flat 1× per jam.
  return rate * h;
}

/** Final overtime pay (rounded) from the monthly base salary. */
export function overtimePay(baseSalary: number, hours: number, type: ContractType): number {
  return Math.round(payFromRate((Number(baseSalary) || 0) / OVERTIME_DIVISOR, hours, type));
}

/** Live UI estimate from an already-rounded hourly rate. */
export function overtimePayEstimate(ratePerHour: number, hours: number, type: ContractType): number {
  return Math.round(payFromRate(Number(ratePerHour) || 0, hours, type));
}
