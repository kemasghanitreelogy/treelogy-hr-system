"use client";

import { Pencil, Trash2 } from "lucide-react";
import type { InventoryItem } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { formatDate, rupiah } from "@/lib/utils";
import {
  CATEGORY_LABEL,
  CONDITION_LABEL,
  CONDITION_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  itemValue,
} from "@/lib/inventory";
import { useLocale } from "@/components/layout/locale-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QrPanel } from "./qr-panel";

const STR: Record<
  Locale,
  {
    category: string;
    brand: string;
    serial: string;
    quantity: string;
    condition: string;
    status: string;
    location: string;
    assigned: string;
    unassigned: string;
    purchaseDate: string;
    price: string;
    totalValue: string;
    note: string;
    updated: string;
    edit: string;
    delete: string;
    photoAlt: (name: string) => string;
  }
> = {
  id: {
    category: "Kategori",
    brand: "Merk",
    serial: "Nomor seri",
    quantity: "Jumlah",
    condition: "Kondisi",
    status: "Status",
    location: "Lokasi",
    assigned: "Penanggung jawab",
    unassigned: "Belum ditentukan",
    purchaseDate: "Tanggal beli",
    price: "Harga beli",
    totalValue: "Nilai total",
    note: "Catatan",
    updated: "Diperbarui",
    edit: "Ubah",
    delete: "Hapus",
    photoAlt: (name) => `Foto ${name}`,
  },
  en: {
    category: "Category",
    brand: "Brand",
    serial: "Serial number",
    quantity: "Quantity",
    condition: "Condition",
    status: "Status",
    location: "Location",
    assigned: "Person in charge",
    unassigned: "Unassigned",
    purchaseDate: "Purchase date",
    price: "Purchase price",
    totalValue: "Total value",
    note: "Note",
    updated: "Updated",
    edit: "Edit",
    delete: "Delete",
    photoAlt: (name) => `Photo of ${name}`,
  },
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2.5">
      <span className="shrink-0 text-xs font-medium text-faint">{label}</span>
      <span className="min-w-0 text-right text-sm text-ink">{children}</span>
    </div>
  );
}

export function ItemDetail({
  item,
  employeeName,
  canManage,
  onEdit,
  onDelete,
}: {
  item: InventoryItem;
  employeeName?: string;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const locale = useLocale();
  const t = STR[locale];

  return (
    <div className="animate-flip-in space-y-4">
      {item.photoPath && (
        // Signed URL berumur pendek dari route API — bucket-nya privat, jadi
        // next/image tidak bisa mengoptimalkan host yang berubah-ubah.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/inventory/photo?path=${encodeURIComponent(item.photoPath)}`}
          alt={t.photoAlt(item.name)}
          loading="lazy"
          className="h-44 w-full rounded-2xl border border-line object-cover"
        />
      )}

      <div>
        <h3 className="font-display text-lg font-semibold leading-tight text-ink">{item.name}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge tone={STATUS_TONE[item.status]} dot>
            {STATUS_LABEL[locale][item.status]}
          </Badge>
          <Badge tone={CONDITION_TONE[item.condition]} dot>
            {CONDITION_LABEL[locale][item.condition]}
          </Badge>
          <Badge tone="neutral">{CATEGORY_LABEL[locale][item.category]}</Badge>
        </div>
      </div>

      <QrPanel item={item} />

      <div className="overflow-hidden rounded-2xl border border-line bg-panel divide-y divide-line">
        <Row label={t.category}>{CATEGORY_LABEL[locale][item.category]}</Row>
        {item.brand && <Row label={t.brand}>{item.brand}</Row>}
        {item.serialNo && (
          <Row label={t.serial}>
            <span className="font-mono text-xs">{item.serialNo}</span>
          </Row>
        )}
        <Row label={t.quantity}>
          <span className="tabular-nums">
            {item.quantity} {item.unit}
          </span>
        </Row>
        <Row label={t.location}>{item.location || "—"}</Row>
        <Row label={t.assigned}>{employeeName ?? t.unassigned}</Row>
        {item.purchaseDate && <Row label={t.purchaseDate}>{formatDate(item.purchaseDate, "long", locale)}</Row>}
        <Row label={t.price}>
          <span className="tabular-nums">{rupiah(item.purchasePrice)}</span>
        </Row>
        <Row label={t.totalValue}>
          <span className="font-semibold tabular-nums">{rupiah(itemValue(item))}</span>
        </Row>
        {item.note && <Row label={t.note}>{item.note}</Row>}
        {item.updatedAt && <Row label={t.updated}>{formatDate(item.updatedAt, "long", locale)}</Row>}
      </div>

      {canManage && (
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onEdit}>
            <Pencil className="h-4 w-4" /> {t.edit}
          </Button>
          <Button variant="danger" className="flex-1" onClick={onDelete}>
            <Trash2 className="h-4 w-4" /> {t.delete}
          </Button>
        </div>
      )}
    </div>
  );
}
