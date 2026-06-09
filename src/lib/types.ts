export type Team = "factory" | "farm" | "sales" | "office";
export type EmployeeStatus = "active" | "inactive";
export type Role = "admin" | "hr" | "manager" | "employee";
export type PTKP = "TK/0" | "TK/1" | "TK/2" | "TK/3" | "K/0" | "K/1" | "K/2" | "K/3";

export interface Employee {
  id: string;
  nik: string; // employee number
  name: string;
  email: string;
  phone: string;
  team: Team;
  position: string;
  status: EmployeeStatus;
  joinDate: string;
  endDate?: string | null;
  baseSalary: number; // monthly gross base
  allowance: number; // fixed monthly allowances
  ptkp: PTKP;
  npwp?: string | null;
  bpjsKes: boolean;
  bpjsTk: boolean;
  bankName: string;
  bankAccount: string;
  location: "Factory · Bali" | "Farm · Bali" | "Office · Bali" | "Field";
}

export type AttendanceStatus =
  | "present"
  | "late"
  | "absent"
  | "leave"
  | "sick"
  | "off"
  | "holiday";

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  shiftId?: string | null;
  clockIn?: string | null; // ISO
  clockOut?: string | null; // ISO
  status: AttendanceStatus;
  lateMinutes: number;
  overtimeMinutes: number;
  source: "biometric" | "mobile" | "manual" | "web";
}

export interface Shift {
  id: string;
  name: string;
  team: Team;
  startTime: string; // "07:00"
  endTime: string; // "15:00"
  breakMinutes: number;
  overtimeAfter: string; // "15:00"
  color: string;
}

export interface ShiftAssignment {
  id: string;
  employeeId: string;
  shiftId: string;
  date: string;
}

export type LeaveType = "annual" | "sick" | "unpaid" | "in-lieu";
export type RequestStatus = "pending" | "approved" | "rejected";

export interface LeaveRequest {
  id: string;
  employeeId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: RequestStatus;
  approver?: string | null;
  requestedAt: string;
}

export interface LeaveBalance {
  employeeId: string;
  annualQuota: number;
  annualUsed: number;
  sickUsed: number;
  /** Tabungan libur — saved leave/day-off bank (in days). */
  tabunganLibur: number;
}

/** Day-off in lieu / swap day for the factory. */
export interface DayOffInLieu {
  id: string;
  employeeId: string;
  workedDate: string; // worked on a rest day / holiday
  offDate: string; // taking the day off instead
  reason: string;
  status: RequestStatus;
}

export type PayrollStatus = "draft" | "processing" | "approved" | "paid";

export interface PayrollRun {
  id: string;
  period: string; // YYYY-MM
  status: PayrollStatus;
  createdAt: string;
  paidAt?: string | null;
  employeeCount: number;
}

export interface BpjsBreakdown {
  kesEmployee: number;
  kesEmployer: number;
  jhtEmployee: number;
  jhtEmployer: number;
  jpEmployee: number;
  jpEmployer: number;
  jkk: number;
  jkm: number;
}

export interface Payslip {
  id: string;
  runId: string;
  employeeId: string;
  period: string;
  workingDays: number;
  presentDays: number;
  baseSalary: number;
  allowance: number;
  overtimePay: number;
  overtimeHours: number;
  grossPay: number;
  bpjs: BpjsBreakdown;
  bpjsEmployeeTotal: number;
  pph21: number;
  deductions: number;
  netPay: number;
}

export interface AttendanceSettings {
  officeLabel: string;
  officeLat: number;
  officeLng: number;
  maxRadiusM: number;
  requirePhoto: boolean;
  requireLocation: boolean;
}

export interface Kpi {
  id: string;
  employeeId: string;
  metric: string;
  period: string;
  target: number;
  actual: number;
  unit: string;
  weight: number; // %
}
