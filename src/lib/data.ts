import {
  CURRENT_PERIOD,
  TODAY,
  attendance as seedAttendance,
  dayOffInLieu as seedDayOff,
  employees as seedEmployees,
  kpis as seedKpis,
  leaveBalances as seedBalances,
  leaveRequests as seedLeave,
  payrollRuns as seedRuns,
  shifts as seedShifts,
} from "./seed";
import { roles, systemUsers } from "./rbac";
import { bpjsEmployeeTotal, calcBpjs, calcOvertimePay, calcPph21 } from "./payroll";
import { isSupabaseConfigured } from "./supabase/config";
import { createClient } from "./supabase/server";
import type {
  AttendanceRecord,
  AttendanceSettings,
  DayOffInLieu,
  Employee,
  Kpi,
  LeaveBalance,
  LeaveRequest,
  PayrollRun,
  Payslip,
  Shift,
} from "./types";

export { TODAY, CURRENT_PERIOD };
export { roles as _roles } from "./rbac";

/* ============================================================
   Data API — reads from Supabase when configured, else seed.
   Every fetcher falls back to seed data on error so the app
   never hard-fails.
   ============================================================ */

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);
const hhmm = (t: unknown) => String(t ?? "").slice(0, 5);

async function fetchTable<T>(
  table: string,
  map: (r: Row) => T,
  fallback: T[],
): Promise<T[]> {
  if (!isSupabaseConfigured) return fallback;
  try {
    const supabase = await createClient();
    if (!supabase) return fallback;
    const { data, error } = await supabase.from(table).select("*");
    if (error || !data || data.length === 0) return fallback;
    return (data as Row[]).map(map);
  } catch {
    return fallback;
  }
}

// ---- Mappers (snake_case → domain types) ----
export const mapEmployee = (r: Row): Employee => ({
  id: String(r.id),
  nik: String(r.nik),
  name: String(r.name),
  email: String(r.email ?? ""),
  phone: String(r.phone ?? ""),
  team: r.team as Employee["team"],
  position: String(r.position ?? ""),
  status: r.status as Employee["status"],
  joinDate: String(r.join_date),
  endDate: (r.end_date as string) ?? null,
  baseSalary: n(r.base_salary),
  allowance: n(r.allowance),
  ptkp: r.ptkp as Employee["ptkp"],
  npwp: (r.npwp as string) ?? null,
  bpjsKes: Boolean(r.bpjs_kes),
  bpjsTk: Boolean(r.bpjs_tk),
  bankName: String(r.bank_name ?? ""),
  bankAccount: String(r.bank_account ?? ""),
  location: r.location as Employee["location"],
  workStart: r.work_start ? hhmm(r.work_start) : "08:00",
  workEnd: r.work_end ? hhmm(r.work_end) : "17:00",
});

const numOrNull = (v: unknown) => (v == null ? null : Number(v));

const mapAttendance = (r: Row): AttendanceRecord => ({
  id: String(r.id),
  employeeId: String(r.employee_id),
  date: String(r.date),
  shiftId: (r.shift_id as string) ?? null,
  clockIn: (r.clock_in as string) ?? null,
  clockOut: (r.clock_out as string) ?? null,
  status: r.status as AttendanceRecord["status"],
  lateMinutes: n(r.late_minutes),
  overtimeMinutes: n(r.overtime_minutes),
  source: r.source as AttendanceRecord["source"],
  clockInLat: numOrNull(r.clock_in_lat),
  clockInLng: numOrNull(r.clock_in_lng),
  clockInDistanceM: numOrNull(r.clock_in_distance_m),
  clockInPhoto: (r.clock_in_photo as string) ?? null,
  clockOutLat: numOrNull(r.clock_out_lat),
  clockOutLng: numOrNull(r.clock_out_lng),
  clockOutDistanceM: numOrNull(r.clock_out_distance_m),
  clockOutPhoto: (r.clock_out_photo as string) ?? null,
});

const mapShift = (r: Row): Shift => ({
  id: String(r.id),
  name: String(r.name),
  team: r.team as Shift["team"],
  startTime: hhmm(r.start_time),
  endTime: hhmm(r.end_time),
  breakMinutes: n(r.break_minutes),
  overtimeAfter: hhmm(r.overtime_after),
  color: String(r.color ?? "#3d5a2e"),
});

const mapLeave = (r: Row): LeaveRequest => ({
  id: String(r.id),
  employeeId: String(r.employee_id),
  type: r.type as LeaveRequest["type"],
  startDate: String(r.start_date),
  endDate: String(r.end_date),
  days: n(r.days),
  reason: String(r.reason ?? ""),
  status: r.status as LeaveRequest["status"],
  approver: (r.approver as string) ?? null,
  requestedAt: String(r.requested_at),
});

const mapBalance = (r: Row): LeaveBalance => ({
  employeeId: String(r.employee_id),
  annualQuota: n(r.annual_quota),
  annualUsed: n(r.annual_used),
  sickUsed: n(r.sick_used),
  tabunganLibur: n(r.tabungan_libur),
});

const mapDayOff = (r: Row): DayOffInLieu => ({
  id: String(r.id),
  employeeId: String(r.employee_id),
  workedDate: String(r.worked_date),
  offDate: String(r.off_date),
  reason: String(r.reason ?? ""),
  status: r.status as DayOffInLieu["status"],
});

const mapRun = (r: Row): PayrollRun => ({
  id: String(r.id),
  period: String(r.period),
  status: r.status as PayrollRun["status"],
  createdAt: String(r.created_at),
  paidAt: (r.paid_at as string) ?? null,
  employeeCount: n(r.employee_count),
});

const mapKpi = (r: Row): Kpi => ({
  id: String(r.id),
  employeeId: String(r.employee_id),
  metric: String(r.metric),
  period: String(r.period),
  target: n(r.target),
  actual: n(r.actual),
  unit: String(r.unit ?? ""),
  weight: n(r.weight),
});

// ---- Fetchers ----
export const getEmployees = () => fetchTable("employees", mapEmployee, seedEmployees);
export const getShifts = () => fetchTable("shifts", mapShift, seedShifts);
export const getAttendance = () => fetchTable("attendance", mapAttendance, seedAttendance);
export const getLeaveRequestsRaw = () => fetchTable("leave_requests", mapLeave, seedLeave);
export const getLeaveBalances = () => fetchTable("leave_balances", mapBalance, seedBalances);
export const getDayOffInLieu = () => fetchTable("day_off_in_lieu", mapDayOff, seedDayOff);
export const getKpis = () => fetchTable("kpis", mapKpi, seedKpis);

export async function getLeaveRequests(): Promise<LeaveRequest[]> {
  const rows = await getLeaveRequestsRaw();
  return rows.slice().sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

export async function getPayrollRuns(): Promise<PayrollRun[]> {
  const rows = await fetchTable("payroll_runs", mapRun, seedRuns);
  return rows.slice().sort((a, b) => b.period.localeCompare(a.period));
}

export async function getEmployee(id: string): Promise<Employee | undefined> {
  return (await getEmployees()).find((e) => e.id === id);
}

export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettings = {
  officeLabel: "Treelogy Office · Bali",
  officeLat: -8.409518,
  officeLng: 115.188919,
  maxRadiusM: 50,
  requirePhoto: true,
  requireLocation: true,
};

export async function getAttendanceSettings(): Promise<AttendanceSettings> {
  if (!isSupabaseConfigured) return DEFAULT_ATTENDANCE_SETTINGS;
  try {
    const supabase = await createClient();
    if (!supabase) return DEFAULT_ATTENDANCE_SETTINGS;
    const { data, error } = await supabase
      .from("attendance_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return DEFAULT_ATTENDANCE_SETTINGS;
    return {
      officeLabel: String(data.office_label),
      officeLat: n(data.office_lat),
      officeLng: n(data.office_lng),
      maxRadiusM: n(data.max_radius_m),
      requirePhoto: Boolean(data.require_photo),
      requireLocation: Boolean(data.require_location),
    };
  } catch {
    return DEFAULT_ATTENDANCE_SETTINGS;
  }
}

// Roles & users stay seed-backed (admin-config UI; real users created via Auth).
export function getRoles() {
  return roles;
}
export function getSystemUsers() {
  return systemUsers;
}

// ---- Pure compute helpers ----
export interface AttendanceRecap {
  employeeId: string;
  workingDays: number;
  presentDays: number;
  lateDays: number;
  absentDays: number;
  leaveDays: number;
  sickDays: number;
  totalLateMinutes: number;
  totalOvertimeMinutes: number;
}

export function computeRecap(
  rows: AttendanceRecord[],
  employeeId: string,
  period: string,
): AttendanceRecap {
  const recap: AttendanceRecap = {
    employeeId, workingDays: 0, presentDays: 0, lateDays: 0, absentDays: 0,
    leaveDays: 0, sickDays: 0, totalLateMinutes: 0, totalOvertimeMinutes: 0,
  };
  for (const r of rows) {
    if (r.employeeId !== employeeId || !r.date.startsWith(period)) continue;
    if (r.status === "off" || r.status === "holiday") continue;
    recap.workingDays++;
    recap.totalLateMinutes += r.lateMinutes;
    recap.totalOvertimeMinutes += r.overtimeMinutes;
    switch (r.status) {
      case "present": recap.presentDays++; break;
      case "late": recap.presentDays++; recap.lateDays++; break;
      case "absent": recap.absentDays++; break;
      case "leave": recap.leaveDays++; break;
      case "sick": recap.sickDays++; break;
    }
  }
  return recap;
}

export function buildPayslip(
  employee: Employee,
  period: string,
  runId: string,
  periodRows: AttendanceRecord[],
): Payslip {
  const recap = computeRecap(periodRows, employee.id, period);
  const monthlyWage = employee.baseSalary + employee.allowance;
  const overtimeHours = recap.totalOvertimeMinutes / 60;
  const overtimePay = calcOvertimePay(recap.totalOvertimeMinutes, monthlyWage);
  const dailyRate = recap.workingDays > 0 ? employee.baseSalary / recap.workingDays : 0;
  const absenceDeduction = Math.round(dailyRate * recap.absentDays);
  const grossPay = employee.baseSalary + employee.allowance + overtimePay - absenceDeduction;
  const bpjs = calcBpjs(employee, grossPay);
  const bpjsEmp = bpjsEmployeeTotal(bpjs);
  const pph21 = calcPph21(employee.ptkp, grossPay);
  const deductions = bpjsEmp + pph21 + absenceDeduction;
  const netPay =
    employee.baseSalary + employee.allowance + overtimePay - bpjsEmp - pph21 - absenceDeduction;
  return {
    id: `${runId}-${employee.id}`, runId, employeeId: employee.id, period,
    workingDays: recap.workingDays, presentDays: recap.presentDays,
    baseSalary: employee.baseSalary, allowance: employee.allowance,
    overtimePay, overtimeHours: Math.round(overtimeHours * 10) / 10,
    grossPay, bpjs, bpjsEmployeeTotal: bpjsEmp, pph21, deductions, netPay,
  };
}

export async function getPayslipsForRun(runId: string, period: string): Promise<Payslip[]> {
  const [emps, att] = await Promise.all([getEmployees(), getAttendance()]);
  const periodRows = att.filter((a) => a.date.startsWith(period));
  return emps.filter((e) => e.status === "active").map((e) => buildPayslip(e, period, runId, periodRows));
}

// ---- Dashboard aggregate ----
export interface DashboardStats {
  totalEmployees: number;
  activeEmployees: number;
  presentToday: number;
  lateToday: number;
  onLeaveToday: number;
  absentToday: number;
  pendingLeave: number;
  pendingSwap: number;
  attendanceRate: number;
  overtimeHoursMonth: number;
  payrollNetMonth: number;
  byTeam: { team: string; count: number }[];
}

export interface DashboardData {
  stats: DashboardStats;
  trend: { date: string; present: number; late: number; absent: number }[];
  today: { record: AttendanceRecord; employee: Employee }[];
  pending: { request: LeaveRequest; employee?: Employee }[];
}

export async function getDashboardData(): Promise<DashboardData> {
  const [employees, attendanceRows, leave, dayOff] = await Promise.all([
    getEmployees(),
    getAttendance(),
    getLeaveRequests(),
    getDayOffInLieu(),
  ]);
  const empMap = new Map(employees.map((e) => [e.id, e]));
  const active = employees.filter((e) => e.status === "active");
  const todayRows = attendanceRows.filter((r) => r.date === TODAY);
  const monthRows = attendanceRows.filter((r) => r.date.startsWith(CURRENT_PERIOD));

  const presentToday = todayRows.filter((r) => r.status === "present" || r.status === "late").length;
  const lateToday = todayRows.filter((r) => r.status === "late").length;
  const onLeaveToday = todayRows.filter((r) => r.status === "leave" || r.status === "sick").length;
  const absentToday = todayRows.filter((r) => r.status === "absent").length;
  const scheduledToday = todayRows.filter((r) => r.status !== "off" && r.status !== "holiday").length;
  const overtimeMin = monthRows.reduce((s, r) => s + r.overtimeMinutes, 0);

  const periodRows = monthRows;
  const payrollNet = active.reduce(
    (s, e) => s + buildPayslip(e, CURRENT_PERIOD, "pr-" + CURRENT_PERIOD, periodRows).netPay,
    0,
  );

  const teams = ["factory", "farm", "sales", "office"] as const;
  const byTeam = teams.map((t) => ({ team: t, count: active.filter((e) => e.team === t).length }));

  const stats: DashboardStats = {
    totalEmployees: employees.length,
    activeEmployees: active.length,
    presentToday, lateToday, onLeaveToday, absentToday,
    pendingLeave: leave.filter((l) => l.status === "pending").length,
    pendingSwap: dayOff.filter((d) => d.status === "pending").length,
    attendanceRate: scheduledToday > 0 ? Math.round((presentToday / scheduledToday) * 100) : 0,
    overtimeHoursMonth: Math.round(overtimeMin / 60),
    payrollNetMonth: payrollNet,
    byTeam,
  };

  // 14-day trend
  const map = new Map<string, { present: number; late: number; absent: number }>();
  for (const r of attendanceRows) {
    if (r.status === "off") continue;
    const cur = map.get(r.date) ?? { present: 0, late: 0, absent: 0 };
    if (r.status === "present") cur.present++;
    else if (r.status === "late") { cur.present++; cur.late++; }
    else if (r.status === "absent") cur.absent++;
    map.set(r.date, cur);
  }
  const trend = Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14)
    .map(([date, v]) => ({ date, ...v }));

  const today = todayRows
    .filter((r) => r.status !== "off" && empMap.has(r.employeeId))
    .slice(0, 6)
    .map((record) => ({ record, employee: empMap.get(record.employeeId)! }));

  const pending = leave
    .filter((l) => l.status === "pending")
    .slice(0, 4)
    .map((request) => ({ request, employee: empMap.get(request.employeeId) }));

  return { stats, trend, today, pending };
}
