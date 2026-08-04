import { redirect } from "next/navigation";
import { PaymentView } from "@/components/payment-requests/payment-view";
import { can, getSessionUser } from "@/lib/auth";
import { getPaymentRequests } from "@/lib/data";
import { getLocale } from "@/lib/locale-server";
import { sheetsMode } from "@/lib/sheets";
import type { Locale } from "@/lib/i18n";

export const metadata = { title: "Pengajuan Pembayaran — Treelogy HR" };

const STR: Record<Locale, { intro: string }> = {
  id: {
    intro:
      "Pengajuan pembayaran & reimbursement. Setiap kiriman tersimpan di sistem sekaligus disalin ke Google Sheet keuangan.",
  },
  en: {
    intro:
      "Payment & reimbursement requests. Every submission is stored here and copied to the finance Google Sheet.",
  },
};

export default async function PaymentRequestsPage() {
  const [requests, user, locale] = await Promise.all([
    getPaymentRequests(),
    getSessionUser(),
    getLocale(),
  ]);
  if (!can(user, "payment.request") && !can(user, "payment.manage")) redirect("/dashboard");

  const t = STR[locale];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t.intro}</p>
      <PaymentView
        requests={requests}
        employeeId={user?.employeeId ?? null}
        name={user?.name ?? ""}
        email={user?.email ?? ""}
        canManage={can(user, "payment.manage") || can(user, "employees.manage")}
        sheetsConnected={sheetsMode() !== "none"}
      />
    </div>
  );
}
