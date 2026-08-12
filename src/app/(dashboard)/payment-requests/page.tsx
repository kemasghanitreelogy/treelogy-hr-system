import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PaymentView, type PaymentFileLinks } from "@/components/payment-requests/payment-view";
import { can, getSessionUser } from "@/lib/auth";
import { getPaymentRequests } from "@/lib/data";
import { signedFileUrl } from "@/lib/file-link";
import { getLocale } from "@/lib/locale-server";
import { witaToday } from "@/lib/utils";
import type { Locale } from "@/lib/i18n";

export const metadata = { title: "Pengajuan Pembayaran — Treelogy HR" };

const STR: Record<Locale, { intro: string }> = {
  id: {
    intro:
      "Pengajuan pembayaran & reimbursement. Setiap kiriman langsung tercatat di sistem beserta lampirannya — tidak menunggu persetujuan.",
  },
  en: {
    intro:
      "Payment & reimbursement requests. Every submission is recorded immediately with its attachments — no approval queue.",
  },
};

export default async function PaymentRequestsPage() {
  const [requests, user, locale, h] = await Promise.all([
    getPaymentRequests(),
    getSessionUser(),
    getLocale(),
    headers(),
  ]);
  if (!can(user, "payment.request") && !can(user, "payment.manage")) redirect("/dashboard");

  // Tautan lampiran ditandatangani di server — rahasianya tidak pernah sampai ke
  // browser, tapi hasilnya bisa dibuka siapa pun yang memegang berkas Excel
  // hasil ekspor (tanpa perlu akun aplikasi HR).
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? ""}`;
  const fileLinks: PaymentFileLinks = Object.fromEntries(
    requests.map((r) => [
      r.id,
      {
        invoices: (r.invoicePaths ?? []).map((p) => signedFileUrl(origin, p)),
        approval: r.approvalPath ? signedFileUrl(origin, r.approvalPath) : "",
      },
    ]),
  );

  const t = STR[locale];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t.intro}</p>
      <PaymentView
        requests={requests}
        fileLinks={fileLinks}
        today={witaToday()}
        employeeId={user?.employeeId ?? null}
        name={user?.name ?? ""}
        email={user?.email ?? ""}
        canManage={can(user, "payment.manage") || can(user, "employees.manage")}
      />
    </div>
  );
}
