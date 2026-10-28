/**
 * SATU sumber kebenaran status pesan — dipakai server (hitungan, daftar
 * masalah, kirim ulang) dan browser (badge, ringkasan). Aturannya: status
 * hanya boleh mengklaim apa yang sudah DILAPORKAN, tidak pernah lebih.
 *
 *   201 dari Qontak            → "accepted"   (baru diterima Qontak, belum tentu terkirim)
 *   log Qontak: sent           → "sent_wa"    (sudah diserahkan ke WhatsApp, belum sampai di HP)
 *   log Qontak: delivered      → "delivered"  (sampai di HP pelanggan)
 *   log Qontak: read           → "read"
 *   log Qontak: failed         → "undelivered" (ditolak WhatsApp — bisa dikirim ulang)
 *   tanpa laporan akhir > 48 j → "unconfirmed" (tidak pernah dikonfirmasi — bisa dikirim ulang)
 */

/** Laporan WhatsApp dicek selama jendela ini; setelahnya dianggap tidak terkonfirmasi. */
export const CONFIRM_WINDOW_MS = 48 * 3600_000;
export const FINAL_DELIVERY = ["delivered", "read", "failed"];

export type DeliveryState =
  | "queued" | "sending" | "skipped" | "failed" | "unknown"
  | "accepted" | "sent_wa" | "delivered" | "read" | "undelivered" | "unconfirmed";

export interface DeliveryRow {
  status: string;
  delivery_status: string | null;
  sent_at: string | null;
}

export function deliveryState(r: DeliveryRow, now = Date.now()): DeliveryState {
  if (r.status !== "sent") {
    return (["queued", "sending", "skipped", "failed", "unknown"].includes(r.status) ? r.status : "unknown") as DeliveryState;
  }
  if (r.delivery_status === "read") return "read";
  if (r.delivery_status === "delivered") return "delivered";
  if (r.delivery_status === "failed") return "undelivered";
  const sentAt = r.sent_at ? +new Date(r.sent_at) : NaN;
  if (!Number.isFinite(sentAt) || now - sentAt > CONFIRM_WINDOW_MS) return "unconfirmed";
  return r.delivery_status === "sent" ? "sent_wa" : "accepted";
}

/** Boleh dikirim ulang: gagal, tidak pasti, ditolak WhatsApp, atau tak pernah terkonfirmasi. */
export const RETRYABLE: DeliveryState[] = ["failed", "unknown", "undelivered", "unconfirmed"];
/** Kemungkinan SUDAH sampai walau tidak terlapor — kirim ulang bisa jadi pesan ganda. */
export const MAYBE_ARRIVED: DeliveryState[] = ["unknown", "unconfirmed"];
/** Masih menunggu laporan WhatsApp. */
export const AWAITING: DeliveryState[] = ["accepted", "sent_wa"];
