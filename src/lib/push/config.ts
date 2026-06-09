export const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
export const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
export const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:hr@treelogy.com";

/** True when VAPID keys exist — push can be sent. */
export const isPushConfigured = Boolean(VAPID_PUBLIC && VAPID_PRIVATE);
