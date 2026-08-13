import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PaymentView, type PaymentFileLinks } from "@/components/payment-requests/payment-view";
import { can, getSessionUser } from "@/lib/auth";
import { getPaymentRequests } from "@/lib/data";
import { signedFileUrl } from "@/lib/file-link";
import { sheetsMode } from "@/lib/sheets";
import { witaToday } from "@/lib/utils";

export const metadata = { title: "Pengajuan Pembayaran — Treelogy HR" };

export default async function PaymentRequestsPage() {
  const [requests, user, h] = await Promise.all([
    getPaymentRequests(),
    getSessionUser(),
    headers(),
  ]);
  if (
    !can(user, "payment.request") &&
    !can(user, "payment.manage") &&
    !can(user, "payment.approve_ops")
  ) {
    redirect("/dashboard");
  }

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

  return (
    <div className="space-y-4">
      <PaymentView
        requests={requests}
        fileLinks={fileLinks}
        today={witaToday()}
        employeeId={user?.employeeId ?? null}
        name={user?.name ?? ""}
        email={user?.email ?? ""}
        canManage={can(user, "payment.manage") || can(user, "employees.manage")}
        canApproveOps={
          can(user, "payment.approve_ops") || can(user, "payment.manage") || can(user, "employees.manage")
        }
        sheetsConnected={sheetsMode() !== "none"}
      />
    </div>
  );
}
