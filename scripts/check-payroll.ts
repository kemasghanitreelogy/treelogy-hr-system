// Validates the payroll engine against hand-computed values.
// Run: node --experimental-strip-types scripts/check-payroll.ts
import {
  calcBpjs,
  bpjsEmployeeTotal,
  calcPph21,
  terRate,
  calcOvertimePay,
} from "../src/lib/payroll.ts";
import type { Employee } from "../src/lib/types.ts";

let pass = 0;
let fail = 0;
function eq(label: string, got: number, want: number, tol = 1) {
  const ok = Math.abs(got - want) <= tol;
  console.log(`${ok ? "✅" : "❌"} ${label}: got ${got}, want ${want}`);
  ok ? pass++ : fail++;
}

const emp = {
  team: "factory",
  bpjsKes: true,
  bpjsTk: true,
} as Employee;

const gross = 8_000_000;

// PPh 21 TER — K/2 is category B; 8jt falls in the 1% bracket.
eq("terRate K/2 @8jt", terRate("K/2", gross), 0.01, 0.0001);
eq("calcPph21 K/2 @8jt", calcPph21("K/2", gross), 80_000);

// BPJS employee portions
const b = calcBpjs(emp, gross);
eq("BPJS Kes employee (1%)", b.kesEmployee, 80_000);
eq("BPJS JHT employee (2%)", b.jhtEmployee, 160_000);
eq("BPJS JP employee (1%)", b.jpEmployee, 80_000);
eq("BPJS employee total", bpjsEmployeeTotal(b), 320_000);

// Employer JKK uses factory risk 0.89%
eq("BPJS JKK (factory 0.89%)", b.jkk, Math.round(gross * 0.0089));

// Overtime: 2h on 8jt wage → 3.5 × (8jt/173)
eq("Overtime 2h @8jt", calcOvertimePay(120, gross), Math.round(3.5 * (gross / 173)));

// BPJS Kesehatan salary cap (12jt) — gross 20jt capped
const capped = calcBpjs(emp, 20_000_000);
eq("BPJS Kes cap @20jt (1% of 12jt)", capped.kesEmployee, 120_000);

console.log(`\n${fail === 0 ? "🎉 ALL PAYROLL CHECKS PASSED" : "⚠️ SOME CHECKS FAILED"} (${pass} pass, ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);
