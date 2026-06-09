import type {
  AttendanceRecord,
  DayOffInLieu,
  Employee,
  Kpi,
  LeaveBalance,
  LeaveRequest,
  PayrollRun,
  Shift,
  ShiftAssignment,
} from "./types";

/** Reference "today" for the demo dataset. */
export const TODAY = "2026-06-09";
export const CURRENT_PERIOD = "2026-06";

export const employees: Employee[] = [
  {
    id: "e01", nik: "TRL-0101", name: "Putu Ariana", email: "putu.ariana@treelogy.com",
    phone: "0812-3400-0101", team: "factory", position: "Production Operator", status: "active",
    joinDate: "2022-03-01", baseSalary: 3_600_000, allowance: 650_000, ptkp: "K/1",
    npwp: "09.123.456.7-901.000", bpjsKes: true, bpjsTk: true, bankName: "BCA",
    bankAccount: "7720113401", location: "Factory · Bali",
  },
  {
    id: "e02", nik: "TRL-0102", name: "Made Surya", email: "made.surya@treelogy.com",
    phone: "0812-3400-0102", team: "factory", position: "Production Operator", status: "active",
    joinDate: "2021-07-15", baseSalary: 3_800_000, allowance: 650_000, ptkp: "TK/0",
    npwp: null, bpjsKes: true, bpjsTk: true, bankName: "BCA",
    bankAccount: "7720113402", location: "Factory · Bali",
  },
  {
    id: "e03", nik: "TRL-0103", name: "Kadek Wirawan", email: "kadek.wirawan@treelogy.com",
    phone: "0812-3400-0103", team: "factory", position: "Production Supervisor", status: "active",
    joinDate: "2020-01-10", baseSalary: 6_800_000, allowance: 1_200_000, ptkp: "K/2",
    npwp: "09.223.456.7-901.000", bpjsKes: true, bpjsTk: true, bankName: "Mandiri",
    bankAccount: "1450099103", location: "Factory · Bali",
  },
  {
    id: "e04", nik: "TRL-0201", name: "Wayan Sukerti", email: "wayan.sukerti@treelogy.com",
    phone: "0812-3400-0201", team: "farm", position: "Field Worker", status: "active",
    joinDate: "2022-09-01", baseSalary: 3_200_000, allowance: 500_000, ptkp: "K/0",
    npwp: null, bpjsKes: true, bpjsTk: true, bankName: "BRI",
    bankAccount: "338201004401", location: "Farm · Bali",
  },
  {
    id: "e05", nik: "TRL-0202", name: "Komang Adi", email: "komang.adi@treelogy.com",
    phone: "0812-3400-0202", team: "farm", position: "Field Lead", status: "active",
    joinDate: "2019-05-20", baseSalary: 5_400_000, allowance: 900_000, ptkp: "K/3",
    npwp: "09.323.456.7-901.000", bpjsKes: true, bpjsTk: true, bankName: "BRI",
    bankAccount: "338201004402", location: "Farm · Bali",
  },
  {
    id: "e06", nik: "TRL-0301", name: "Ni Luh Sari", email: "niluh.sari@treelogy.com",
    phone: "0812-3400-0301", team: "sales", position: "Sales Executive", status: "active",
    joinDate: "2023-02-01", baseSalary: 4_500_000, allowance: 1_500_000, ptkp: "TK/0",
    npwp: "09.423.456.7-901.000", bpjsKes: true, bpjsTk: true, bankName: "BCA",
    bankAccount: "7720113406", location: "Office · Bali",
  },
  {
    id: "e07", nik: "TRL-0302", name: "I Gede Bagus", email: "gede.bagus@treelogy.com",
    phone: "0812-3400-0302", team: "sales", position: "Sales Lead", status: "active",
    joinDate: "2020-11-03", baseSalary: 7_500_000, allowance: 2_500_000, ptkp: "K/2",
    npwp: "09.523.456.7-901.000", bpjsKes: true, bpjsTk: true, bankName: "Mandiri",
    bankAccount: "1450099107", location: "Office · Bali",
  },
  {
    id: "e08", nik: "TRL-0401", name: "Dewi Lestari", email: "dewi.lestari@treelogy.com",
    phone: "0812-3400-0401", team: "office", position: "HR Officer", status: "active",
    joinDate: "2021-04-12", baseSalary: 6_200_000, allowance: 1_000_000, ptkp: "TK/1",
    npwp: "09.623.456.7-901.000", bpjsKes: true, bpjsTk: true, bankName: "BCA",
    bankAccount: "7720113408", location: "Office · Bali",
  },
  {
    id: "e09", nik: "TRL-0402", name: "Agus Pratama", email: "agus.pratama@treelogy.com",
    phone: "0812-3400-0402", team: "office", position: "Finance Officer", status: "active",
    joinDate: "2020-08-17", baseSalary: 7_800_000, allowance: 1_200_000, ptkp: "K/1",
    npwp: "09.723.456.7-901.000", bpjsKes: true, bpjsTk: true, bankName: "Mandiri",
    bankAccount: "1450099109", location: "Office · Bali",
  },
  {
    id: "e10", nik: "TRL-0104", name: "Ketut Mahendra", email: "ketut.mahendra@treelogy.com",
    phone: "0812-3400-0104", team: "factory", position: "Quality Control", status: "active",
    joinDate: "2022-06-01", baseSalary: 4_200_000, allowance: 700_000, ptkp: "K/0",
    npwp: null, bpjsKes: true, bpjsTk: true, bankName: "BCA",
    bankAccount: "7720113410", location: "Factory · Bali",
  },
  {
    id: "e11", nik: "TRL-0403", name: "Ni Made Ayu", email: "nimade.ayu@treelogy.com",
    phone: "0812-3400-0403", team: "office", position: "Admin Staff", status: "active",
    joinDate: "2023-09-04", baseSalary: 4_800_000, allowance: 700_000, ptkp: "TK/0",
    npwp: null, bpjsKes: true, bpjsTk: true, bankName: "BCA",
    bankAccount: "7720113411", location: "Office · Bali",
  },
  {
    id: "e12", nik: "TRL-0203", name: "Putu Eka", email: "putu.eka@treelogy.com",
    phone: "0812-3400-0203", team: "farm", position: "Field Worker", status: "active",
    joinDate: "2023-01-09", baseSalary: 3_300_000, allowance: 500_000, ptkp: "TK/1",
    npwp: null, bpjsKes: true, bpjsTk: true, bankName: "BRI",
    bankAccount: "338201004412", location: "Farm · Bali",
  },
  {
    id: "e13", nik: "TRL-0105", name: "Kadek Yoga", email: "kadek.yoga@treelogy.com",
    phone: "0812-3400-0105", team: "factory", position: "Packaging Operator", status: "active",
    joinDate: "2022-11-21", baseSalary: 3_500_000, allowance: 600_000, ptkp: "TK/0",
    npwp: null, bpjsKes: true, bpjsTk: true, bankName: "BCA",
    bankAccount: "7720113413", location: "Factory · Bali",
  },
  {
    id: "e14", nik: "TRL-0303", name: "Sang Ayu Putri", email: "sangayu.putri@treelogy.com",
    phone: "0812-3400-0303", team: "sales", position: "Sales Executive", status: "inactive",
    joinDate: "2021-03-15", endDate: "2026-02-28", baseSalary: 4_500_000, allowance: 1_500_000,
    ptkp: "TK/0", npwp: null, bpjsKes: false, bpjsTk: false, bankName: "BCA",
    bankAccount: "7720113414", location: "Office · Bali",
  },
];

export const shifts: Shift[] = [
  { id: "s1", name: "Factory Pagi", team: "factory", startTime: "07:00", endTime: "15:00", breakMinutes: 60, overtimeAfter: "15:00", color: "#3d5a2e" },
  { id: "s2", name: "Factory Siang", team: "factory", startTime: "15:00", endTime: "23:00", breakMinutes: 60, overtimeAfter: "23:00", color: "#6b7548" },
  { id: "s3", name: "Factory Malam", team: "factory", startTime: "23:00", endTime: "07:00", breakMinutes: 60, overtimeAfter: "07:00", color: "#26331e" },
  { id: "s4", name: "Farm Pagi", team: "farm", startTime: "06:00", endTime: "14:00", breakMinutes: 60, overtimeAfter: "14:00", color: "#8ba859" },
  { id: "s5", name: "Office Reguler", team: "office", startTime: "08:00", endTime: "17:00", breakMinutes: 60, overtimeAfter: "17:00", color: "#4a7ba6" },
];

export const leaveBalances: LeaveBalance[] = employees.map((e, i) => ({
  employeeId: e.id,
  annualQuota: 12,
  annualUsed: [3, 1, 5, 2, 4, 6, 2, 1, 3, 0, 2, 1, 4, 8][i] ?? 2,
  sickUsed: [1, 0, 2, 1, 0, 1, 0, 2, 1, 0, 1, 0, 1, 0][i] ?? 0,
  tabunganLibur: [4, 2, 6, 3, 5, 0, 1, 0, 0, 2, 0, 3, 5, 0][i] ?? 0,
}));

export const leaveRequests: LeaveRequest[] = [
  { id: "l1", employeeId: "e06", type: "annual", startDate: "2026-06-12", endDate: "2026-06-13", days: 2, reason: "Family event in Singaraja", status: "pending", requestedAt: "2026-06-05T09:12:00+08:00" },
  { id: "l2", employeeId: "e02", type: "sick", startDate: "2026-06-08", endDate: "2026-06-08", days: 1, reason: "Fever — clinic note attached", status: "approved", approver: "Dewi Lestari", requestedAt: "2026-06-08T07:01:00+08:00" },
  { id: "l3", employeeId: "e10", type: "annual", startDate: "2026-06-20", endDate: "2026-06-24", days: 5, reason: "Galungan holiday with family", status: "pending", requestedAt: "2026-06-06T14:30:00+08:00" },
  { id: "l4", employeeId: "e05", type: "in-lieu", startDate: "2026-06-16", endDate: "2026-06-16", days: 1, reason: "Day-off in lieu for working Sunday harvest", status: "approved", approver: "Komang Adi", requestedAt: "2026-06-02T16:45:00+08:00" },
  { id: "l5", employeeId: "e13", type: "annual", startDate: "2026-06-10", endDate: "2026-06-11", days: 2, reason: "Personal matters", status: "rejected", approver: "Kadek Wirawan", requestedAt: "2026-06-04T11:20:00+08:00" },
  { id: "l6", employeeId: "e04", type: "sick", startDate: "2026-06-09", endDate: "2026-06-09", days: 1, reason: "Stomach flu", status: "pending", requestedAt: "2026-06-09T06:40:00+08:00" },
];

export const dayOffInLieu: DayOffInLieu[] = [
  { id: "d1", employeeId: "e05", workedDate: "2026-06-01", offDate: "2026-06-16", reason: "Sunday harvest — extra demand", status: "approved" },
  { id: "d2", employeeId: "e01", workedDate: "2026-05-31", offDate: "2026-06-14", reason: "Public holiday production run", status: "approved" },
  { id: "d3", employeeId: "e03", workedDate: "2026-06-08", offDate: "2026-06-19", reason: "Maintenance shift on rest day", status: "pending" },
  { id: "d4", employeeId: "e13", workedDate: "2026-06-07", offDate: "2026-06-18", reason: "Packaging backlog (Sunday)", status: "pending" },
];

export const payrollRuns: PayrollRun[] = [
  { id: "pr-2026-05", period: "2026-05", status: "paid", createdAt: "2026-05-28T10:00:00+08:00", paidAt: "2026-05-30T15:00:00+08:00", employeeCount: 13 },
  { id: "pr-2026-04", period: "2026-04", status: "paid", createdAt: "2026-04-28T10:00:00+08:00", paidAt: "2026-04-30T15:00:00+08:00", employeeCount: 14 },
  { id: "pr-2026-06", period: "2026-06", status: "draft", createdAt: "2026-06-09T08:00:00+08:00", paidAt: null, employeeCount: 13 },
];

export const kpis: Kpi[] = [
  { id: "k1", employeeId: "e03", metric: "Production output (tons)", period: CURRENT_PERIOD, target: 18, actual: 19.4, unit: "ton", weight: 40 },
  { id: "k2", employeeId: "e03", metric: "Defect rate", period: CURRENT_PERIOD, target: 2, actual: 1.4, unit: "%", weight: 30 },
  { id: "k3", employeeId: "e03", metric: "On-time shipment", period: CURRENT_PERIOD, target: 95, actual: 97, unit: "%", weight: 30 },
  { id: "k4", employeeId: "e06", metric: "Revenue", period: CURRENT_PERIOD, target: 120, actual: 134, unit: "jt", weight: 60 },
  { id: "k5", employeeId: "e06", metric: "New accounts", period: CURRENT_PERIOD, target: 8, actual: 6, unit: "acct", weight: 40 },
  { id: "k6", employeeId: "e07", metric: "Team revenue", period: CURRENT_PERIOD, target: 450, actual: 488, unit: "jt", weight: 70 },
  { id: "k7", employeeId: "e07", metric: "Churn", period: CURRENT_PERIOD, target: 5, actual: 3.2, unit: "%", weight: 30 },
  { id: "k8", employeeId: "e05", metric: "Harvest yield", period: CURRENT_PERIOD, target: 92, actual: 95, unit: "%", weight: 50 },
  { id: "k9", employeeId: "e05", metric: "Crop quality grade A", period: CURRENT_PERIOD, target: 85, actual: 88, unit: "%", weight: 50 },
];

// ---- Deterministic attendance generation for the current month ----
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function shiftForTeam(team: Employee["team"]): string {
  if (team === "factory") return "s1";
  if (team === "farm") return "s4";
  return "s5";
}

/** Generate attendance for all active employees from the 1st to TODAY. */
export function generateAttendance(): AttendanceRecord[] {
  const records: AttendanceRecord[] = [];
  const today = new Date(TODAY + "T00:00:00+08:00");
  const year = today.getFullYear();
  const month = today.getMonth();
  const lastDay = today.getDate();

  for (const emp of employees) {
    if (emp.status !== "active") continue;
    const sid = shiftForTeam(emp.team);
    const shift = shifts.find((s) => s.id === sid)!;
    for (let day = 1; day <= lastDay; day++) {
      const date = new Date(year, month, day);
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dow = date.getDay();
      const r = hash(emp.id + iso);

      // Weekend off for office/sales; farm/factory work Saturdays
      const isWeekend = dow === 0 || (dow === 6 && (emp.team === "office" || emp.team === "sales"));
      if (isWeekend) {
        records.push({ id: `${emp.id}-${iso}`, employeeId: emp.id, date: iso, status: "off", lateMinutes: 0, overtimeMinutes: 0, source: "biometric" });
        continue;
      }

      let status: AttendanceRecord["status"] = "present";
      let lateMinutes = 0;
      let overtimeMinutes = 0;
      let clockIn: string | null = null;
      let clockOut: string | null = null;

      if (r < 0.04) {
        status = "absent";
      } else if (r < 0.08) {
        status = "sick";
      } else if (r < 0.11) {
        status = "leave";
      } else {
        const [sh, sm] = shift.startTime.split(":").map(Number);
        const lateRoll = hash(emp.id + iso + "late");
        lateMinutes = lateRoll < 0.18 ? Math.round(lateRoll * 100) : 0;
        if (lateMinutes > 0) status = "late";
        const inH = sh;
        const inM = sm + lateMinutes;
        clockIn = `${iso}T${String(inH + Math.floor(inM / 60)).padStart(2, "0")}:${String(inM % 60).padStart(2, "0")}:00+08:00`;
        const otRoll = hash(emp.id + iso + "ot");
        overtimeMinutes = (emp.team === "factory" || emp.team === "farm") && otRoll < 0.35 ? Math.round(otRoll * 360) : 0;
        const [eh, em] = shift.endTime.split(":").map(Number);
        const outTotal = eh * 60 + em + overtimeMinutes;
        clockOut = `${iso}T${String(Math.floor(outTotal / 60) % 24).padStart(2, "0")}:${String(outTotal % 60).padStart(2, "0")}:00+08:00`;
      }

      records.push({
        id: `${emp.id}-${iso}`, employeeId: emp.id, date: iso, shiftId: sid,
        clockIn, clockOut, status, lateMinutes, overtimeMinutes,
        source: r < 0.5 ? "biometric" : "mobile",
      });
    }
  }
  return records;
}

export const attendance: AttendanceRecord[] = generateAttendance();

export const shiftAssignments: ShiftAssignment[] = employees
  .filter((e) => e.status === "active")
  .map((e) => ({
    id: `sa-${e.id}`,
    employeeId: e.id,
    shiftId: shiftForTeam(e.team),
    date: TODAY,
  }));
