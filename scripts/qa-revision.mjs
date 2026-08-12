/**
 * QA: alur revisi berulang (jalankan: node --experimental-strip-types scripts/qa-revision.mjs)
 *
 * Alur revisi berulang (tolak → revisi → tolak lagi → revisi lagi → …).
 * Menguji fungsi murni yang dipakai SEMUA modul berpersetujuan.
 */
import { applyApproval } from "../src/lib/approval.ts";

let pass = 0;
let fail = 0;
const check = (name, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name} ${extra}`);
  }
};

// Salinan revisionReset/revisionGuard (lib-nya server-only → tidak bisa diimpor
// langsung di skrip node biasa; logikanya disalin persis untuk diuji).
function revisionGuard(prev, employeeId) {
  if (!employeeId || prev.employee_id !== employeeId) return "forbidden_or_failed";
  const status = String(prev.status ?? "");
  if (status !== "pending" && status !== "rejected") return "already_decided";
  return null;
}
function revisionReset(previousRejectionReason) {
  const note = String(previousRejectionReason ?? "").trim();
  return {
    status: "pending",
    approver: null,
    rejection_reason: null,
    manager_approver: null,
    manager_approved_at: null,
    hr_approver: null,
    hr_approved_at: null,
    revision_note: note || null,
  };
}

/** Simulasi baris di database. */
function makeRow(employeeId = "emp-1") {
  return {
    employee_id: employeeId,
    status: "pending",
    approver: null,
    rejection_reason: null,
    manager_approver: null,
    manager_approved_at: null,
    hr_approver: null,
    hr_approved_at: null,
    revision_note: null,
  };
}

/** Terapkan patch applyApproval ke baris (seperti UPDATE di API). */
function applyToRow(row, patch) {
  Object.assign(row, patch ?? {});
  return row;
}

function reject(row, who, reason, role = "manager") {
  const res = applyApproval({
    action: "reject",
    role,
    actorName: who,
    managerRequired: true,
    current: {
      status: row.status,
      managerApprover: row.manager_approver,
      hrApprover: row.hr_approver,
    },
    nowIso: "2026-08-12T00:00:00Z",
    reason,
  });
  if (res.update) applyToRow(row, res.update);
  return res;
}

function approve(row, who, role) {
  const res = applyApproval({
    action: "approve",
    role,
    actorName: who,
    managerRequired: true,
    current: {
      status: row.status,
      managerApprover: row.manager_approver,
      hrApprover: row.hr_approver,
    },
    nowIso: "2026-08-12T00:00:00Z",
  });
  if (res.update) applyToRow(row, res.update);
  return res;
}

function revise(row, byEmployeeId) {
  const guard = revisionGuard(row, byEmployeeId);
  if (guard) return { error: guard };
  Object.assign(row, revisionReset(row.rejection_reason));
  return { ok: true };
}

console.log("\n== TC1: siklus tolak → revisi berulang 3x ==");
{
  const row = makeRow();
  for (let cycle = 1; cycle <= 3; cycle++) {
    const alasan = `Alasan penolakan ke-${cycle}`;
    const rej = reject(row, "Tanty", alasan);
    check(`siklus ${cycle}: penolakan tercatat`, row.status === "rejected" && !rej.error);
    check(`siklus ${cycle}: catatan penolak tersimpan`, row.rejection_reason === alasan, row.rejection_reason);

    const rev = revise(row, "emp-1");
    check(`siklus ${cycle}: pengaju boleh revisi`, !rev.error, rev.error);
    check(`siklus ${cycle}: kembali ke menunggu`, row.status === "pending", row.status);
    check(`siklus ${cycle}: alasan lama jadi konteks`, row.revision_note === alasan, row.revision_note);
    check(`siklus ${cycle}: tanda tangan bersih`,
      row.approver === null && row.manager_approver === null && row.hr_approver === null && row.rejection_reason === null);
  }
  check("setelah 3 siklus masih bisa diproses", row.status === "pending");
}

console.log("\n== TC2: penolakan wajib beralasan ==");
{
  const row = makeRow();
  const res = reject(row, "Tanty", "   ");
  check("alasan kosong ditolak sistem", res.error === "reason_required", res.error);
  check("status tidak berubah", row.status === "pending");
}

console.log("\n== TC3: dua tahap — revisi setelah lolos tahap 1 lalu ditolak Finance ==");
{
  const row = makeRow();
  approve(row, "Tanty", "manager");
  check("tahap 1 tercatat, status tetap menunggu", row.status === "pending" && row.manager_approver === "Tanty");

  reject(row, "Honest", "Kuitansi tidak terbaca", "hr");
  check("ditolak di tahap 2", row.status === "rejected" && row.rejection_reason === "Kuitansi tidak terbaca");

  revise(row, "emp-1");
  check("revisi menghapus tanda tangan tahap 1", row.manager_approver === null);
  check("wajib mulai dari tahap 1 lagi", row.status === "pending" && row.hr_approver === null);

  // Setelah revisi: Finance TIDAK boleh langsung final tanpa tahap 1.
  const lompat = approve(row, "Honest", "hr");
  check("Finance tidak bisa melompati tahap 1", lompat.error === "awaiting_manager", lompat.error);

  approve(row, "Tanty", "manager");
  const final = approve(row, "Honest", "hr");
  check("alur dua tahap selesai normal", row.status === "approved" && !final.error);
}

console.log("\n== TC4: pagar keamanan revisi ==");
{
  const row = makeRow("emp-1");
  reject(row, "Tanty", "Data kurang");
  check("orang lain tidak bisa merevisi", revise(row, "emp-2").error === "forbidden_or_failed");
  check("tanpa identitas ditolak", revise(row, null).error === "forbidden_or_failed");

  const approved = makeRow();
  approve(approved, "Tanty", "manager");
  approve(approved, "Honest", "hr");
  check("yang sudah disetujui tidak bisa direvisi", revise(approved, "emp-1").error === "already_decided");
}

console.log("\n== TC5: keputusan ganda ditolak ==");
{
  const row = makeRow();
  reject(row, "Tanty", "Alasan A");
  const lagi = reject(row, "Honest", "Alasan B");
  check("tidak bisa menolak dua kali", lagi.error === "already_decided", lagi.error);
}

console.log(`\n──────────────\nLULUS: ${pass} · GAGAL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
