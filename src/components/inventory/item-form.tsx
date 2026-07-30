"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import type { InventoryItem } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { apiErrorMessage } from "@/lib/api-error";
import { rupiah } from "@/lib/utils";
import { prepareFileForBucket } from "@/lib/upload";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  CONDITIONS,
  CONDITION_LABEL,
  STATUSES,
  STATUS_LABEL,
  UNITS,
} from "@/lib/inventory";
import { useLocale } from "@/components/layout/locale-context";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

export interface EmployeeOption {
  id: string;
  name: string;
}

const STR: Record<
  Locale,
  {
    name: string;
    namePh: string;
    category: string;
    brand: string;
    brandPh: string;
    serial: string;
    serialPh: string;
    quantity: string;
    unit: string;
    condition: string;
    status: string;
    location: string;
    locationPh: string;
    assigned: string;
    unassigned: string;
    purchaseDate: string;
    price: string;
    photo: string;
    photoAdd: string;
    photoReplace: string;
    photoRemove: string;
    uploading: string;
    note: string;
    notePh: string;
    cancel: string;
    save: string;
    saving: string;
    nameRequired: string;
    connection: string;
    codeHint: string;
  }
> = {
  id: {
    name: "Nama barang",
    namePh: "cth. Laptop Dell Latitude 5440",
    category: "Kategori",
    brand: "Merk",
    brandPh: "cth. Dell",
    serial: "Nomor seri",
    serialPh: "cth. DL5440-2291",
    quantity: "Jumlah",
    unit: "Satuan",
    condition: "Kondisi",
    status: "Status",
    location: "Lokasi",
    locationPh: "cth. Ruang Finance",
    assigned: "Penanggung jawab",
    unassigned: "— Belum ditentukan —",
    purchaseDate: "Tanggal beli",
    price: "Harga beli (Rp)",
    photo: "Foto barang",
    photoAdd: "Pilih foto",
    photoReplace: "Ganti foto",
    photoRemove: "Hapus foto",
    uploading: "Mengunggah…",
    note: "Catatan",
    notePh: "cth. Garansi sampai Feb 2027",
    cancel: "Batal",
    save: "Simpan",
    saving: "Menyimpan…",
    nameRequired: "Nama barang wajib diisi.",
    connection: "Koneksi bermasalah. Coba lagi.",
    codeHint: "Kode aset & QR dibuat otomatis oleh sistem setelah disimpan.",
  },
  en: {
    name: "Item name",
    namePh: "e.g. Dell Latitude 5440 laptop",
    category: "Category",
    brand: "Brand",
    brandPh: "e.g. Dell",
    serial: "Serial number",
    serialPh: "e.g. DL5440-2291",
    quantity: "Quantity",
    unit: "Unit",
    condition: "Condition",
    status: "Status",
    location: "Location",
    locationPh: "e.g. Finance room",
    assigned: "Person in charge",
    unassigned: "— Unassigned —",
    purchaseDate: "Purchase date",
    price: "Purchase price (IDR)",
    photo: "Item photo",
    photoAdd: "Choose photo",
    photoReplace: "Replace photo",
    photoRemove: "Remove photo",
    uploading: "Uploading…",
    note: "Note",
    notePh: "e.g. Warranty until Feb 2027",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving…",
    nameRequired: "Item name is required.",
    connection: "Connection problem. Try again.",
    codeHint: "The asset code & QR are generated automatically once saved.",
  },
};

type FormState = {
  name: string;
  category: InventoryItem["category"];
  brand: string;
  serialNo: string;
  quantity: string;
  unit: string;
  condition: InventoryItem["condition"];
  status: InventoryItem["status"];
  location: string;
  assignedTo: string;
  purchaseDate: string;
  purchasePrice: string;
  photoPath: string | null;
  note: string;
};

function initial(item?: InventoryItem): FormState {
  return {
    name: item?.name ?? "",
    category: item?.category ?? "elektronik",
    brand: item?.brand ?? "",
    serialNo: item?.serialNo ?? "",
    quantity: String(item?.quantity ?? 1),
    unit: item?.unit ?? "unit",
    condition: item?.condition ?? "baik",
    status: item?.status ?? "tersedia",
    location: item?.location ?? "",
    assignedTo: item?.assignedTo ?? "",
    purchaseDate: item?.purchaseDate ?? "",
    purchasePrice: String(item?.purchasePrice ?? 0),
    photoPath: item?.photoPath ?? null,
    note: item?.note ?? "",
  };
}

/**
 * Form tambah/ubah barang. Kode aset sengaja TIDAK ada di form — dibuat database
 * (sequence) supaya tidak mungkin bentrok, dan supaya HR tidak perlu mengingat
 * penomoran apa pun.
 */
export function ItemForm({
  item,
  employees,
  onSaved,
  onCancel,
}: {
  item?: InventoryItem;
  employees: EmployeeOption[];
  onSaved: (saved: InventoryItem) => void;
  onCancel: () => void;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormState>(() => initial(item));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const prepared = await prepareFileForBucket("inventory-photos", "items", file);
      // Mode demo (tanpa Supabase) tidak menghasilkan path — abaikan dengan tenang.
      if (prepared.path) set("photoPath", prepared.path);
    } catch (err) {
      toast.error(apiErrorMessage(err instanceof Error ? err.message : null, locale));
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error(t.nameRequired);

    setSaving(true);
    try {
      const payload = {
        ...(item ? { id: item.id } : {}),
        name: form.name,
        category: form.category,
        brand: form.brand,
        serialNo: form.serialNo,
        quantity: Number(form.quantity) || 0,
        unit: form.unit,
        condition: form.condition,
        status: form.status,
        location: form.location,
        assignedTo: form.assignedTo || null,
        purchaseDate: form.purchaseDate || null,
        purchasePrice: Number(form.purchasePrice) || 0,
        photoPath: form.photoPath,
        note: form.note,
      };
      const res = await fetch("/api/inventory", {
        method: item ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.item) {
        toast.error(apiErrorMessage(data?.error, locale, res.status));
        return;
      }
      onSaved(data.item as InventoryItem);
    } catch {
      toast.error(t.connection);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t.name}>
        <Input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder={t.namePh}
          required
          autoFocus
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t.category}>
          <Select value={form.category} onChange={(e) => set("category", e.target.value as InventoryItem["category"])}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[locale][c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.brand}>
          <Input value={form.brand} onChange={(e) => set("brand", e.target.value)} placeholder={t.brandPh} />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label={t.quantity}>
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            value={form.quantity}
            onChange={(e) => set("quantity", e.target.value)}
          />
        </Field>
        <Field label={t.unit}>
          <Select value={form.unit} onChange={(e) => set("unit", e.target.value)}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.serial} className="col-span-1">
          <Input value={form.serialNo} onChange={(e) => set("serialNo", e.target.value)} placeholder={t.serialPh} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t.condition}>
          <Select
            value={form.condition}
            onChange={(e) => set("condition", e.target.value as InventoryItem["condition"])}
          >
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {CONDITION_LABEL[locale][c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.status}>
          <Select value={form.status} onChange={(e) => set("status", e.target.value as InventoryItem["status"])}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[locale][s]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label={t.location}>
        <Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder={t.locationPh} />
      </Field>

      <Field label={t.assigned}>
        <Select value={form.assignedTo} onChange={(e) => set("assignedTo", e.target.value)}>
          <option value="">{t.unassigned}</option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t.purchaseDate}>
          <Input type="date" value={form.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)} />
        </Field>
        {/* Hint rupiah hidup: angka panjang tanpa pemisah ribuan mudah salah ketik. */}
        <Field label={t.price} hint={Number(form.purchasePrice) > 0 ? rupiah(Number(form.purchasePrice)) : undefined}>
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            value={form.purchasePrice}
            onChange={(e) => set("purchasePrice", e.target.value)}
          />
        </Field>
      </div>

      <Field label={t.photo}>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {uploading ? t.uploading : form.photoPath ? t.photoReplace : t.photoAdd}
          </Button>
          {form.photoPath && (
            <button
              type="button"
              onClick={() => set("photoPath", null)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-clay-soft hover:text-[#8c3c1f]"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t.photoRemove}
            </button>
          )}
        </div>
      </Field>

      <Field label={t.note}>
        <Textarea value={form.note} onChange={(e) => set("note", e.target.value)} placeholder={t.notePh} rows={3} />
      </Field>

      {!item && <p className="text-xs text-faint">{t.codeHint}</p>}

      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>
          {t.cancel}
        </Button>
        <Button type="submit" className="flex-1" disabled={saving || uploading}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? t.saving : t.save}
        </Button>
      </div>
    </form>
  );
}
