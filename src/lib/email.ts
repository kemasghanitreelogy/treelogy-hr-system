import nodemailer from "nodemailer";

const HOST = process.env.SMTP_HOST;
const PORT = Number(process.env.SMTP_PORT || 465);
const USER = process.env.SMTP_USER;
const PASS = process.env.SMTP_PASS;
const FROM = process.env.SMTP_FROM || (USER ? `Treelogy HR <${USER}>` : undefined);

/** True when SMTP credentials are present so we can send mail ourselves. */
export const isSmtpConfigured = Boolean(HOST && USER && PASS);

function getTransport() {
  return nodemailer.createTransport({
    host: HOST,
    port: PORT,
    secure: PORT === 465, // 465 = implicit TLS (Gmail), 587 = STARTTLS
    auth: { user: USER, pass: PASS },
  });
}

/** Low-level send. Throws on SMTP failure — callers decide how to surface it. */
export async function sendEmail(opts: { to: string; subject: string; html: string; text?: string }): Promise<void> {
  const transport = getTransport();
  await transport.sendMail({ from: FROM, to: opts.to, subject: opts.subject, text: opts.text, html: opts.html });
}

/** Shared branded HTML shell so every Treelogy email looks consistent. */
export function brandedEmail(opts: { heading: string; intro?: string; message: string; ctaLabel?: string; ctaUrl?: string }): string {
  const cta = opts.ctaLabel && opts.ctaUrl
    ? `<a href="${opts.ctaUrl}" style="display:inline-block;margin-top:18px;background:#2f5a2f;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:12px">${opts.ctaLabel}</a>`
    : "";
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2421">
    <h2 style="margin:0 0 4px;font-size:20px;color:#2f5a2f">Treelogy HR</h2>
    ${opts.intro ? `<p style="margin:0 0 20px;color:#6b7280;font-size:14px">${opts.intro}</p>` : ""}
    <h3 style="margin:0 0 10px;font-size:16px">${opts.heading}</h3>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#374151">${opts.message}</p>
    ${cta}
    <p style="margin:24px 0 0;color:#9ca3af;font-size:12px">© Treelogy · Premium Organic Moringa</p>
  </div>`;
}

/** Send the password-reset OTP code to the user, from kemas@treelogy.com. */
export async function sendOtpEmail(to: string, code: string): Promise<void> {
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2421">
    <h2 style="margin:0 0 4px;font-size:20px;color:#2f5a2f">Treelogy HR</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px">Reset kata sandi akunmu</p>
    <p style="margin:0 0 12px;font-size:14px">Gunakan kode verifikasi berikut:</p>
    <div style="font-size:34px;font-weight:700;letter-spacing:10px;background:#eef3ee;border-radius:14px;padding:18px 0;text-align:center;color:#2f5a2f">${code}</div>
    <p style="margin:18px 0 0;color:#6b7280;font-size:13px">Kode berlaku 10 menit. Abaikan email ini jika kamu tidak meminta reset kata sandi.</p>
    <p style="margin:24px 0 0;color:#9ca3af;font-size:12px">© Treelogy · Premium Organic Moringa</p>
  </div>`;

  await sendEmail({
    to,
    subject: `Kode reset kata sandi Treelogy HR: ${code}`,
    text: `Kode verifikasi reset kata sandi Treelogy HR: ${code}\nBerlaku 10 menit. Abaikan jika kamu tidak meminta reset.`,
    html,
  });
}
