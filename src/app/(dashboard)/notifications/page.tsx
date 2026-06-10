import { NotificationsView } from "@/components/notifications/notifications-view";
import { getNotifications } from "@/lib/data";

export const metadata = { title: "Notifikasi — Treelogy HR" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const items = await getNotifications();
  return <NotificationsView items={items} />;
}
