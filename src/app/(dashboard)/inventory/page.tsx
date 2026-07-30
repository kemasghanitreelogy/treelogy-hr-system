import { redirect } from "next/navigation";
import { InventoryView } from "@/components/inventory/inventory-view";
import { can, getSessionUser } from "@/lib/auth";
import { getEmployees, getInventoryItems } from "@/lib/data";
import { getLocale } from "@/lib/locale-server";
import type { Locale } from "@/lib/i18n";

export const metadata = { title: "Inventaris — Treelogy HR" };

const STR: Record<Locale, { intro: string }> = {
  id: {
    intro:
      "Data inventaris kantor. Tiap barang punya kode aset unik beserta QR-nya — tempel labelnya, pindai untuk membuka detail barang.",
  },
  en: {
    intro:
      "Office inventory records. Every item carries a unique asset code and its QR — stick the label on, scan it to open the item's detail.",
  },
};

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const [items, employeesAll, user, params, locale] = await Promise.all([
    getInventoryItems(),
    getEmployees(),
    getSessionUser(),
    searchParams,
    getLocale(),
  ]);

  // Menu di-gate perm yang sama; guard ini menutup akses via URL langsung.
  if (!can(user, "inventory.view") && !can(user, "inventory.manage")) redirect("/dashboard");

  const t = STR[locale];
  const canManage = can(user, "inventory.manage") || can(user, "employees.manage");
  const employees = employeesAll
    .filter((e) => e.status === "active")
    .map((e) => ({ id: e.id, name: e.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t.intro}</p>
      <InventoryView
        items={items}
        employees={employees}
        canManage={canManage}
        initialCode={params.item ?? null}
      />
    </div>
  );
}
