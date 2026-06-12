export type Team = "factory" | "farm" | "office";
export type EmployeeStatus = "active" | "inactive";
export type Role = "admin" | "hr" | "manager" | "employee";
export type PTKP = "TK/0" | "TK/1" | "TK/2" | "TK/3" | "K/0" | "K/1" | "K/2" | "K/3";
export type Religion = "islam" | "kristen" | "katolik" | "hindu" | "buddha" | "konghucu";

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
  religion?: Religion | null;
  npwp?: string | null;
  bpjsKes: boolean;
  bpjsTk: boolean;
  bankName: string;
  bankAccount: string;
  location: "Factory · Bali" | "Farm · Bali" | "Office · Bali" | "Field";
  workStart?: string; // "HH:MM" — scheduled clock-in (WITA), set by HR
  workEnd?: string; // "HH:MM" — scheduled clock-out (WITA)
  /** Hari kerja (0=Min..6=Sab). Default Senin–Jumat. Menentukan hadir/alpa & hari libur. */
  workDays: number[];
  /** Template jadwal yang sedang diikuti (null = jadwal kustom). */
  scheduleTemplateId?: string | null;
  /** Direct supervisor (employee id); null = top of their division. Drives the org tree. */
  managerId?: string | null;
}

/** Hari libur: 'public' = semua off; 'religious' = hanya karyawan seagama off. */
export interface Holiday {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  type: "public" | "religious";
  religion?: Religion | null; // diisi saat type='religious'
}

/** Satu kontrak kerja dalam riwayat karyawan. */
export interface EmployeeContract {
  id: string;
  employeeId: string;
  type: "probation" | "pkwt" | "pkwtt" | "magang" | "harian";
  startDate: string;
  endDate?: string | null; // null = berkelanjutan
  status: "active" | "ended";
  note?: string | null;
}

/** Pola jadwal kerja yang bisa diterapkan ke banyak karyawan sekaligus. */
export interface ScheduleTemplate {
  id: string;
  name: string;
  workDays: number[]; // 0=Min..6=Sab
  workStart: string; // "HH:MM"
  workEnd: string; // "HH:MM"
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
  // Geofence + selfie evidence (mobile self clock-in/out)
  clockInLat?: number | null;
  clockInLng?: number | null;
  clockInDistanceM?: number | null;
  clockInPhoto?: string | null; // storage path in `attendance-selfies`
  clockOutLat?: number | null;
  clockOutLng?: number | null;
  clockOutDistanceM?: number | null;
  clockOutPhoto?: string | null;
  /** Saat clock-in di hari libur: 'swap' (tukar→tabungan) / 'overtime' (lembur). */
  offDayChoice?: "swap" | "overtime" | null;
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

export type LeaveType = "annual" | "sick" | "unpaid" | "tukar-libur";
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
  /** Storage path of the optional proof file (image/PDF); null when none. */
  proofPath?: string | null;
}

export interface OvertimeRequest {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  hours: number; // duration in hours (decimal)
  reason: string;
  ratePerHour: number; // baseSalary / 20 / 8, snapshotted at request time
  amount: number; // ratePerHour * hours
  status: RequestStatus; // approval flow
  approver?: string | null;
  paid: boolean; // payment is settled SEPARATELY from payroll
  paidAt?: string | null;
  proofPath?: string | null;
  requestedAt: string;
}

/**
 * Pengajuan clock-in/out di LUAR area kantor — butuh konfirmasi HR.
 * Saat disetujui, absensi ditulis memakai requested_at (momen clock asli).
 */
export interface ClockApprovalRequest {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  direction: "in" | "out";
  requestedAt: string; // ISO — momen clock sebenarnya
  lat?: number | null;
  lng?: number | null;
  distanceM?: number | null;
  photoPath?: string | null;
  note?: string | null; // catatan opsional dari karyawan untuk HR
  status: RequestStatus;
  approver?: string | null;
  decidedAt?: string | null;
  /** 'out_of_area' = clock di luar geofence; 'off_day' = kerja di hari libur. */
  kind: "out_of_area" | "off_day";
  /** Untuk off_day: 'swap' (→tabungan) / 'overtime' (→lembur). */
  offDayChoice?: "swap" | "overtime" | null;
  /** Jam pulang yang dikirim selagi pengajuan off_day masih menunggu. */
  clockOutAt?: string | null;
}

export type NotifTone = "approved" | "rejected" | "paid" | "pending";

export interface AppNotification {
  id: string;
  employeeId: string;
  type: string;
  tone: NotifTone;
  title: string;
  body: string;
  href: string;
  read: boolean;
  createdAt: string;
}

export interface LeaveBalance {
  employeeId: string;
  annualQuota: number;
  annualUsed: number;
  sickUsed: number;
  /** Tabungan libur — saved leave/day-off bank (in days). */
  tabunganLibur: number;
}

/** Day-off in lieu / swap day for the factory. @deprecated — superseded by TabunganEntry. */
export interface DayOffInLieu {
  id: string;
  employeeId: string;
  workedDate: string; // worked on a rest day / holiday
  offDate: string; // taking the day off instead
  reason: string;
  status: RequestStatus;
}

/** Direction of a tabungan libur ledger entry. */
export type TabunganKind = "deposit" | "withdrawal";

/**
 * One movement in an employee's tabungan libur (saved day-off bank).
 * `deposit` adds days (earned by working a rest day / outside hours),
 * `withdrawal` spends them (taking a saved day off). The cached balance on
 * LeaveBalance.tabunganLibur is the sum of all approved entries.
 */
export interface TabunganEntry {
  id: string;
  employeeId: string;
  kind: TabunganKind;
  days: number; // magnitude in days (always > 0)
  eventDate: string; // worked_date (deposit) or off_date (withdrawal)
  reason: string;
  source: "manual" | "attendance"; // 'attendance' = auto-created from a rest-day clock-in
  sourceId?: string | null; // attendance record id when source='attendance'
  status: RequestStatus;
  approver?: string | null;
  proofPath?: string | null;
  requestedAt: string;
  decidedAt?: string | null;
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

// Payroll sederhana: net = pokok + tunjangan + lembur − potongan absen.
// Lembur (dari modul Lembur yang disetujui) DISATUKAN ke gaji. Tanpa BPJS/PPh.
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
  absenceDeduction: number;
  grossPay: number; // pokok + tunjangan + lembur
  netPay: number; // grossPay − potongan absen
}

/** A clock-in geofence for one division (team). */
export interface TeamGeofence {
  label: string;
  lat: number;
  lng: number;
  radiusM: number;
}

export interface AttendanceSettings {
  requirePhoto: boolean;
  requireLocation: boolean;
  /** Per-division geofences — clock-in/out is validated against the employee's team. */
  geofences: Record<Team, TeamGeofence>;
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
