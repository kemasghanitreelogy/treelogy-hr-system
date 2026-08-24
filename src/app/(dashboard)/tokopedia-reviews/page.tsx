import { redirect } from "next/navigation";
import { TokopediaReviewsView } from "@/components/tokopedia-reviews/tokopedia-reviews-view";
import { can, getSessionUser } from "@/lib/auth";
import { readState } from "@/app/api/tokopedia-reviews/state";

export const metadata = { title: "Review Tokopedia — Treelogy HR" };
export const dynamic = "force-dynamic";

export default async function TokopediaReviewsPage() {
  const user = await getSessionUser();

  // Menu di-gate izin yang sama; guard ini menutup akses lewat URL langsung.
  if (!can(user, "reviews.view")) redirect("/dashboard");

  return (
    <TokopediaReviewsView
      initialState={await readState()}
      canPull={can(user, "reviews.pull")}
      canManage={can(user, "reviews.manage")}
    />
  );
}
