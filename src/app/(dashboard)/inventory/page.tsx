import { redirect } from "next/navigation";
import { InventoryView } from "@/components/inventory/inventory-view";
import { can, getSessionUser } from "@/lib/auth";
import { getEmployees, getInventoryItems } from "@/lib/data";

export const metadata = { title: "Inventaris — Treelogy HR" };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const [items, employeesAll, user, params] = await Promise.all([
    getInventoryItems(),
    getEmployees(),
    getSessionUser(),
    searchParams,
  ]);

  // Menu di-gate perm yang sama; guard ini menutup akses via URL langsung.
  if (!can(user, "inventory.view") && !can(user, "inventory.manage")) redirect("/dashboard");

  const canManage = can(user, "inventory.manage") || can(user, "employees.manage");
  const employees = employeesAll
    .filter((e) => e.status === "active")
    .map((e) => ({ id: e.id, name: e.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <InventoryView
        items={items}
        employees={employees}
        canManage={canManage}
        initialCode={params.item ?? null}
      />
    </div>
  );
}
