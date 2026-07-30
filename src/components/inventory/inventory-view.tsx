"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  Coins,
  PackageSearch,
  Plus,
  Printer,
  QrCode as QrIcon,
  ScanLine,
  Search,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import type { InventoryItem } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { apiErrorMessage } from "@/lib/api-error";
import { cn, rupiah } from "@/lib/utils";
import { itemQrPayload } from "@/lib/qr";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  CONDITION_LABEL,
  CONDITION_TONE,
  STATUSES,
  STATUS_LABEL,
  STATUS_TONE,
  itemValue,
  needsAttention,
} from "@/lib/inventory";
import { useLocale } from "@/components/layout/locale-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { ItemDetail } from "./item-detail";
import { ItemForm, type EmployeeOption } from "./item-form";
import { QrCode } from "./qr-code";
import { QrScanner } from "./qr-scanner";
import { downloadInventoryLabels } from "./labels-pdf";

const STR: Record<
  Locale,
  {
    statItems: string;
    statUnits: string;
    statValue: string;
    statAttention: string;
    statItemsSub: (n: number) => string;
    searchPh: string;
    allCategories: string;
    allStatuses: string;
    add: string;
    scan: string;
    printAll: (n: number) => string;
    printBusy: string;
    printFailed: string;
    count: (shown: number, total: number) => string;
    empty: string;
    emptyFiltered: string;
    detailTitle: string;
    addTitle: string;
    editTitle: string;
    scanTitle: string;
    deleteTitle: (name: string) => string;
    deleteMsg: string;
    deleteConfirm: string;
    created: string;
    updated: string;
    deleted: string;
    deleteFailed: string;
    connection: string;
    notFound: (code: string) => string;
    unassigned: string;
  }
> = {
  id: {
    statItems: "Jenis barang",
    statUnits: "Total unit",
    statValue: "Nilai aset",
    statAttention: "Perlu perhatian",
    statItemsSub: (n) => `${n} unit tercatat`,
    searchPh: "Cari nama, kode, merk, lokasi…",
    allCategories: "Semua kategori",
    allStatuses: "Semua status",
    add: "Tambah",
    scan: "Pindai",
    printAll: (n) => `Cetak ${n} label`,
    printBusy: "Menyiapkan…",
    printFailed: "Gagal membuat label PDF.",
    count: (shown, total) => (shown === total ? `${total} barang` : `${shown} dari ${total} barang`),
    empty: "Belum ada barang inventaris.",
    emptyFiltered: "Tidak ada barang yang cocok dengan filter ini.",
    detailTitle: "Detail Barang",
    addTitle: "Tambah Barang",
    editTitle: "Ubah Barang",
    scanTitle: "Pindai QR",
    deleteTitle: (name) => `Hapus "${name}"?`,
    deleteMsg: "Data barang dan QR-nya tidak bisa dikembalikan.",
    deleteConfirm: "Ya, hapus",
    created: "Barang ditambahkan ✓",
    updated: "Barang diperbarui ✓",
    deleted: "Barang dihapus ✓",
    deleteFailed: "Gagal menghapus barang.",
    connection: "Koneksi bermasalah. Coba lagi.",
    notFound: (code) => `Barang ${code} tidak ditemukan.`,
    unassigned: "Belum ditentukan",
  },
  en: {
    statItems: "Item types",
    statUnits: "Total units",
    statValue: "Asset value",
    statAttention: "Needs attention",
    statItemsSub: (n) => `${n} units recorded`,
    searchPh: "Search name, code, brand, location…",
    allCategories: "All categories",
    allStatuses: "All statuses",
    add: "Add",
    scan: "Scan",
    printAll: (n) => `Print ${n} labels`,
    printBusy: "Preparing…",
    printFailed: "Failed to build the label PDF.",
    count: (shown, total) => (shown === total ? `${total} items` : `${shown} of ${total} items`),
    empty: "No inventory items yet.",
    emptyFiltered: "No items match these filters.",
    detailTitle: "Item Detail",
    addTitle: "Add Item",
    editTitle: "Edit Item",
    scanTitle: "Scan QR",
    deleteTitle: (name) => `Delete "${name}"?`,
    deleteMsg: "The item and its QR cannot be restored.",
    deleteConfirm: "Yes, delete",
    created: "Item added ✓",
    updated: "Item updated ✓",
    deleted: "Item deleted ✓",
    deleteFailed: "Failed to delete the item.",
    connection: "Connection problem. Try again.",
    notFound: (code) => `Item ${code} was not found.`,
    unassigned: "Unassigned",
  },
};

/** Delay stagger di-cap: daftar panjang tetap tiba dalam satu ketukan (≤ 0.32s). */
const MAX_STAGGER = 8;

function Stat({
  label,
  value,
  sub,
  icon: Icon,
  tone,
  pulse,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof Boxes;
  tone: string;
  pulse: string;
}) {
  return (
    <div className="card p-3.5 sm:p-4">
      <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", tone)}>
        <Icon className="h-4.5 w-4.5" />
      </span>
      {/* key = nilai → elemen di-remount tiap angka berubah, jadi animasi
          count-up berjalan lagi setiap filter diubah. */}
      <p key={pulse} className="animate-count-up mt-2.5 font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
        {value}
      </p>
      <p className="mt-0.5 text-xs font-medium text-muted">{label}</p>
      {sub && <p className="mt-0.5 text-[11px] text-faint">{sub}</p>}
    </div>
  );
}

export function InventoryView({
  items,
  employees,
  canManage,
  initialCode,
}: {
  items: InventoryItem[];
  employees: EmployeeOption[];
  canManage: boolean;
  /** Kode dari ?item=… (hasil pindai QR di luar app) — detailnya dibuka otomatis. */
  initialCode?: string | null;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const router = useRouter();
  const toast = useToast();

  const [list, setList] = useState(items);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [scanning, setScanning] = useState(false);
  const [deleting, setDeleting] = useState<InventoryItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [printBusy, setPrintBusy] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);

  const empName = useMemo(() => new Map(employees.map((e) => [e.id, e.name])), [employees]);

  // Deep link dari QR: buka detail sekali saat halaman dimuat.
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current || !initialCode) return;
    deepLinked.current = true;
    const hit = list.find((i) => i.code.toUpperCase() === initialCode.toUpperCase());
    if (hit) setSelectedId(hit.id);
    else toast.error(t.notFound(initialCode));
    // sengaja hanya sekali saat mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  // URL mengikuti detail yang terbuka → tautan bisa dibagikan / di-refresh.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const item = list.find((i) => i.id === selectedId);
    const url = new URL(window.location.href);
    if (item) url.searchParams.set("item", item.code);
    else url.searchParams.delete("item");
    window.history.replaceState(null, "", url.toString());
  }, [selectedId, list]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (status !== "all" && item.status !== status) return false;
      if (!q) return true;
      return [item.name, item.code, item.brand, item.location, item.serialNo]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q));
    });
  }, [list, query, category, status]);

  const stats = useMemo(() => {
    const units = filtered.reduce((sum, i) => sum + i.quantity, 0);
    const value = filtered.reduce((sum, i) => sum + itemValue(i), 0);
    const attention = filtered.filter(needsAttention).length;
    return { types: filtered.length, units, value, attention };
  }, [filtered]);

  const selected = list.find((i) => i.id === selectedId) ?? null;

  function upsert(saved: InventoryItem, mode: "create" | "update") {
    setList((cur) => (mode === "create" ? [saved, ...cur] : cur.map((i) => (i.id === saved.id ? saved : i))));
    toast.success(mode === "create" ? t.created : t.updated);
    if (mode === "create") setSelectedId(saved.id);
    router.refresh();
  }

  async function remove() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleting.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        toast.error(apiErrorMessage(data?.error, locale, res.status));
        return;
      }
      // Baris menyusut keluar dulu, baru dilepas dari state — penghapusan terasa
      // dilakukan, bukan sekadar hilang.
      const goneId = deleting.id;
      setSelectedId((cur) => (cur === goneId ? null : cur));
      setRemovingId(goneId);
      setTimeout(() => {
        setList((cur) => cur.filter((i) => i.id !== goneId));
        setRemovingId(null);
      }, 240);
      toast.success(t.deleted);
      router.refresh();
    } catch {
      toast.error(t.connection);
    } finally {
      setDeleteBusy(false);
      setDeleting(null);
    }
  }

  async function printAll() {
    setPrintBusy(true);
    try {
      await downloadInventoryLabels(filtered, origin || window.location.origin, locale);
    } catch {
      toast.error(t.printFailed);
    } finally {
      setPrintBusy(false);
    }
  }

  function handleScan(code: string) {
    setScanning(false);
    const hit = list.find((i) => i.code.toUpperCase() === code.toUpperCase());
    if (hit) setSelectedId(hit.id);
    else toast.error(t.notFound(code));
  }

  return (
    <div className="space-y-4">
      {/* Statistik — ikut filter, jadi selalu menjawab "yang sedang saya lihat" */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={t.statItems}
          value={String(stats.types)}
          sub={t.statItemsSub(stats.units)}
          icon={Boxes}
          tone="bg-forest-100 text-forest-700"
          pulse={`types-${stats.types}`}
        />
        <Stat
          label={t.statUnits}
          value={String(stats.units)}
          icon={PackageSearch}
          tone="bg-sky-soft text-[#2c5775]"
          pulse={`units-${stats.units}`}
        />
        <Stat
          label={t.statValue}
          value={rupiah(stats.value, { compact: true })}
          icon={Coins}
          tone="bg-gold-soft text-[#8a6512]"
          pulse={`value-${stats.value}`}
        />
        <Stat
          label={t.statAttention}
          value={String(stats.attention)}
          icon={stats.attention > 0 ? TriangleAlert : Wrench}
          tone={stats.attention > 0 ? "bg-clay-soft text-[#8c3c1f]" : "bg-[#e9f0d8] text-forest-600"}
          pulse={`att-${stats.attention}`}
        />
      </div>

      {/* Filter + aksi */}
      <div className="rounded-2xl border border-line bg-panel p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.searchPh}
              aria-label={t.searchPh}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto min-w-[10rem]">
              <option value="all">{t.allCategories}</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[locale][c]}
                </option>
              ))}
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-[9rem]">
              <option value="all">{t.allStatuses}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[locale][s]}
                </option>
              ))}
            </Select>
            <Button variant="outline" onClick={() => setScanning(true)} className="relative">
              <ScanLine className="h-4 w-4" /> {t.scan}
            </Button>
            {canManage && (
              <Button onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" /> {t.add}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">{t.count(filtered.length, list.length)}</p>
        {canManage && filtered.length > 0 && (
          <Button size="sm" variant="ghost" onClick={printAll} disabled={printBusy}>
            <Printer className="h-4 w-4" /> {printBusy ? t.printBusy : t.printAll(filtered.length)}
          </Button>
        )}
      </div>

      {/* Daftar barang */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-cream/40 px-5 py-12 text-center">
          <PackageSearch className="mx-auto h-8 w-8 text-faint" />
          <p className="mt-2 text-sm text-faint">{list.length === 0 ? t.empty : t.emptyFiltered}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item, i) => (
            <button
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              style={{ ["--i" as string]: Math.min(i, MAX_STAGGER) }}
              className={cn(
                "stagger-item group flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-panel p-3 text-left transition-colors hover:border-forest-200 hover:bg-cream/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-400",
                removingId === item.id && "animate-row-out",
              )}
            >
              {/* Thumbnail QR — kode aset terlihat langsung dari daftar */}
              {origin ? (
                <QrCode
                  value={itemQrPayload(origin, item.code)}
                  size={56}
                  border={1}
                  className="shrink-0 ring-1 ring-line"
                  title={`QR ${item.code}`}
                />
              ) : (
                <div className="h-14 w-14 shrink-0 animate-pulse rounded-xl bg-sand" />
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <QrIcon className="h-3 w-3 shrink-0 text-faint" />
                  <span className="font-mono text-[11px] font-semibold tracking-tight text-muted tabular-nums">
                    {item.code}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-sm font-semibold text-ink">{item.name}</p>
                <p className="truncate text-xs text-faint">
                  {item.location || "—"}
                  {" · "}
                  {item.quantity} {item.unit}
                  {item.assignedTo && empName.has(item.assignedTo) ? ` · ${empName.get(item.assignedTo)}` : ""}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <Badge tone={STATUS_TONE[item.status]} dot className="!px-2 !py-0.5 !text-[10px]">
                    {STATUS_LABEL[locale][item.status]}
                  </Badge>
                  {item.condition !== "baik" && (
                    <Badge tone={CONDITION_TONE[item.condition]} className="!px-2 !py-0.5 !text-[10px]">
                      {CONDITION_LABEL[locale][item.condition]}
                    </Badge>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detail */}
      <Sheet open={selected !== null} onClose={() => setSelectedId(null)} title={t.detailTitle} width="lg">
        {selected && (
          <ItemDetail
            item={selected}
            // Karyawan biasa mungkin tidak boleh membaca baris karyawan lain (RLS):
            // tampilkan "—", bukan "Belum ditentukan" yang keliru.
            employeeName={selected.assignedTo ? (empName.get(selected.assignedTo) ?? "—") : undefined}
            canManage={canManage}
            onEdit={() => setEditing(selected)}
            onDelete={() => setDeleting(selected)}
          />
        )}
      </Sheet>

      {/* Tambah */}
      <Sheet open={adding} onClose={() => setAdding(false)} title={t.addTitle} width="lg">
        <ItemForm
          employees={employees}
          onSaved={(saved) => {
            setAdding(false);
            upsert(saved, "create");
          }}
          onCancel={() => setAdding(false)}
        />
      </Sheet>

      {/* Ubah */}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={t.editTitle} width="lg">
        {editing && (
          <ItemForm
            item={editing}
            employees={employees}
            onSaved={(saved) => {
              setEditing(null);
              upsert(saved, "update");
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Sheet>

      {/* Pindai */}
      <Sheet open={scanning} onClose={() => setScanning(false)} title={t.scanTitle}>
        {scanning && <QrScanner onDetect={handleScan} onClose={() => setScanning(false)} />}
      </Sheet>

      <ConfirmDialog
        open={deleting !== null}
        title={t.deleteTitle(deleting?.name ?? "")}
        message={t.deleteMsg}
        confirmLabel={t.deleteConfirm}
        tone="danger"
        busy={deleteBusy}
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
