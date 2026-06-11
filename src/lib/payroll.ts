import type { BpjsBreakdown, Employee, PTKP } from "./types";

/* ============================================================
   Indonesian Payroll Engine
   - BPJS Kesehatan & Ketenagakerjaan
   - PPh 21 (TER monthly method, PP 58/2023, effective 2024)
   - Government overtime formula (Kepmenaker)
   ============================================================ */

// --- BPJS ceilings & rates ---
const BPJS_KES_CAP = 12_000_000; // health upper salary limit
const BPJS_JP_CAP = 10_547_400; // pension upper salary limit (2024)

const RATE = {
  kesEmployee: 0.01,
  kesEmployer: 0.04,
  jhtEmployee: 0.02,
  jhtEmployer: 0.037,
  jpEmployee: 0.01,
  jpEmployer: 0.02,
  jkm: 0.003,
};

/** JKK (work-accident) risk rate by team. Factory/farm carry higher risk. */
export function jkkRate(team: Employee["team"]): number {
  switch (team) {
    case "factory":
      return 0.0089; // medium-high risk
    case "farm":
      return 0.0124; // high risk (agriculture)
    default:
      return 0.0054; // low risk (office/sales)
  }
}

export function calcBpjs(employee: Employee, gross: number): BpjsBreakdown {
  const kesBase = Math.min(gross, BPJS_KES_CAP);
  const jpBase = Math.min(gross, BPJS_JP_CAP);

  const empty: BpjsBreakdown = {
    kesEmployee: 0, kesEmployer: 0, jhtEmployee: 0, jhtEmployer: 0,
    jpEmployee: 0, jpEmployer: 0, jkk: 0, jkm: 0,
  };

  const b = { ...empty };
  if (employee.bpjsKes) {
    b.kesEmployee = Math.round(kesBase * RATE.kesEmployee);
    b.kesEmployer = Math.round(kesBase * RATE.kesEmployer);
  }
  if (employee.bpjsTk) {
    b.jhtEmployee = Math.round(gross * RATE.jhtEmployee);
    b.jhtEmployer = Math.round(gross * RATE.jhtEmployer);
    b.jpEmployee = Math.round(jpBase * RATE.jpEmployee);
    b.jpEmployer = Math.round(jpBase * RATE.jpEmployer);
    b.jkk = Math.round(gross * jkkRate(employee.team));
    b.jkm = Math.round(gross * RATE.jkm);
  }
  return b;
}

export function bpjsEmployeeTotal(b: BpjsBreakdown): number {
  return b.kesEmployee + b.jhtEmployee + b.jpEmployee;
}

export function bpjsEmployerTotal(b: BpjsBreakdown): number {
  return b.kesEmployer + b.jhtEmployer + b.jpEmployer + b.jkk + b.jkm;
}

// --- PPh 21 TER (Tarif Efektif Rata-rata) ---
type TerBracket = [upTo: number, rate: number];

// Category A: TK/0, TK/1, K/0
const TER_A: TerBracket[] = [
  [5_400_000, 0], [5_650_000, 0.0025], [5_950_000, 0.005], [6_300_000, 0.0075],
  [6_750_000, 0.01], [7_500_000, 0.0125], [8_550_000, 0.015], [9_650_000, 0.0175],
  [10_050_000, 0.02], [10_350_000, 0.0225], [10_700_000, 0.025], [11_050_000, 0.03],
  [11_600_000, 0.035], [12_500_000, 0.04], [13_750_000, 0.05], [15_100_000, 0.06],
  [16_950_000, 0.07], [19_750_000, 0.08], [24_150_000, 0.09], [26_450_000, 0.1],
  [28_000_000, 0.11], [30_050_000, 0.12], [32_400_000, 0.13], [35_400_000, 0.14],
  [39_100_000, 0.15], [43_850_000, 0.16], [47_800_000, 0.17], [51_400_000, 0.18],
  [56_300_000, 0.19], [62_200_000, 0.2], [68_600_000, 0.21], [77_500_000, 0.22],
  [89_000_000, 0.23], [103_000_000, 0.24], [125_000_000, 0.25], [157_000_000, 0.26],
  [206_000_000, 0.27], [337_000_000, 0.28], [454_000_000, 0.29], [550_000_000, 0.3],
  [695_000_000, 0.31], [910_000_000, 0.32], [1_400_000_000, 0.33], [Infinity, 0.34],
];

// Category B: TK/2, TK/3, K/1, K/2
const TER_B: TerBracket[] = [
  [6_200_000, 0], [6_500_000, 0.0025], [6_850_000, 0.005], [7_300_000, 0.0075],
  [9_200_000, 0.01], [10_750_000, 0.015], [11_250_000, 0.02], [11_600_000, 0.025],
  [12_600_000, 0.03], [13_600_000, 0.04], [14_950_000, 0.05], [16_400_000, 0.06],
  [18_450_000, 0.07], [21_850_000, 0.08], [26_000_000, 0.09], [27_700_000, 0.1],
  [29_350_000, 0.11], [31_450_000, 0.12], [33_950_000, 0.13], [37_100_000, 0.14],
  [41_100_000, 0.15], [45_800_000, 0.16], [49_500_000, 0.17], [53_800_000, 0.18],
  [58_500_000, 0.19], [64_000_000, 0.2], [71_000_000, 0.21], [80_000_000, 0.22],
  [93_000_000, 0.23], [109_000_000, 0.24], [129_000_000, 0.25], [163_000_000, 0.26],
  [211_000_000, 0.27], [374_000_000, 0.28], [459_000_000, 0.29], [555_000_000, 0.3],
  [704_000_000, 0.31], [957_000_000, 0.32], [1_405_000_000, 0.33], [Infinity, 0.34],
];

// Category C: K/3
const TER_C: TerBracket[] = [
  [6_600_000, 0], [6_950_000, 0.0025], [7_350_000, 0.005], [7_800_000, 0.0075],
  [8_850_000, 0.01], [9_800_000, 0.0125], [10_950_000, 0.015], [11_200_000, 0.0175],
  [12_050_000, 0.02], [12_950_000, 0.03], [14_150_000, 0.04], [15_550_000, 0.05],
  [17_050_000, 0.06], [19_500_000, 0.07], [22_700_000, 0.08], [26_600_000, 0.09],
  [28_100_000, 0.1], [30_100_000, 0.11], [32_600_000, 0.12], [35_400_000, 0.13],
  [38_900_000, 0.14], [43_000_000, 0.15], [47_400_000, 0.16], [51_200_000, 0.17],
  [55_800_000, 0.18], [60_400_000, 0.19], [66_700_000, 0.2], [74_500_000, 0.21],
  [83_200_000, 0.22], [95_600_000, 0.23], [110_000_000, 0.24], [134_000_000, 0.25],
  [169_000_000, 0.26], [221_000_000, 0.27], [390_000_000, 0.28], [463_000_000, 0.29],
  [561_000_000, 0.3], [709_000_000, 0.31], [965_000_000, 0.32], [1_419_000_000, 0.33],
  [Infinity, 0.34],
];

export function terCategory(ptkp: PTKP): "A" | "B" | "C" {
  switch (ptkp) {
    case "TK/0":
    case "TK/1":
    case "K/0":
      return "A";
    case "TK/2":
    case "TK/3":
    case "K/1":
    case "K/2":
      return "B";
    case "K/3":
      return "C";
  }
}

export function terRate(ptkp: PTKP, monthlyGross: number): number {
  const cat = terCategory(ptkp);
  const table = cat === "A" ? TER_A : cat === "B" ? TER_B : TER_C;
  for (const [upTo, rate] of table) {
    if (monthlyGross <= upTo) return rate;
  }
  return 0.34;
}

/** Monthly PPh 21 via the TER method (rounded to rupiah). */
export function calcPph21(ptkp: PTKP, monthlyGross: number): number {
  return Math.round(monthlyGross * terRate(ptkp, monthlyGross));
}

// Lembur sengaja tidak dihitung di payroll: kebijakan perusahaan membayar
// lembur TERPISAH dari gaji bulanan, lewat modul Lembur (overtime_requests).

export const PTKP_OPTIONS: PTKP[] = ["TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3"];
