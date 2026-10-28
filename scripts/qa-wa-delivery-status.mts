import { deliveryState, RETRYABLE, MAYBE_ARRIVED } from "../src/lib/qontak/delivery.ts";
const now = Date.parse("2026-10-28T10:00:00Z"), h = (n: number) => new Date(now - n * 3600_000).toISOString();
let bad = 0;
const cek = (ok: boolean, m: string) => { console.log((ok ? "✓ " : "✗ ") + m); if (!ok) bad++; };
const c: [any, string, boolean][] = [
  [{ status: "sent", delivery_status: null, sent_at: h(0.01) }, "accepted", false],
  [{ status: "sent", delivery_status: "todo", sent_at: h(1) }, "accepted", false],
  [{ status: "sent", delivery_status: "sent", sent_at: h(1) }, "sent_wa", false],
  [{ status: "sent", delivery_status: "delivered", sent_at: h(1) }, "delivered", false],
  [{ status: "sent", delivery_status: "read", sent_at: h(100) }, "read", false],
  [{ status: "sent", delivery_status: "failed", sent_at: h(1) }, "undelivered", true],
  [{ status: "sent", delivery_status: "sent", sent_at: h(49) }, "unconfirmed", true],
  [{ status: "sent", delivery_status: null, sent_at: null }, "unconfirmed", true],
  [{ status: "failed", delivery_status: null, sent_at: null }, "failed", true],
  [{ status: "unknown", delivery_status: null, sent_at: null }, "unknown", true],
  [{ status: "queued", delivery_status: null, sent_at: null }, "queued", false],
  [{ status: "skipped", delivery_status: null, sent_at: null }, "skipped", false],
];
for (const [r, want, retry] of c) {
  const st = deliveryState(r, now);
  cek(st === want && RETRYABLE.includes(st) === retry, `${r.status}/${r.delivery_status ?? "—"} → ${st}${RETRYABLE.includes(st) ? " (bisa kirim ulang)" : ""}`);
}
cek(MAYBE_ARRIVED.includes("unconfirmed") && MAYBE_ARRIVED.includes("unknown") && !MAYBE_ARRIVED.includes("undelivered"), "peringatan pesan ganda hanya untuk tidak pasti / tak terkonfirmasi");
process.exit(bad ? 1 : 0);
