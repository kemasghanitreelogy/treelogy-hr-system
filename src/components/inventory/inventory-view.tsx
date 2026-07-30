"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, PackageSearch, Plus, Printer, ScanLine, Search } from "lucide-react";
import type { InventoryItem } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { apiErrorMessage } from "@/lib/api-error";
import { cn, rupiah } from "@/lib/utils";
import { itemQrPayload } from "@/lib/qr";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  CONDITION_LABEL,
  CONDITION_TEXT,
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
    searchPh: string;
    allCategories: string;
    allStatuses: string;
    add: string;
    scan: string;
    printAll: (n: number) => string;
    printBusy: string;
    printFailed: string;
    sumItems: (n: number) => string;
    sumUnits: (n: number) => string;
    sumAttention: (n: number) => string;
    filteredOf: (total: number) => string;
    colItem: string;
    colLocation: string;
    colQty: string;
    colHolder: string;
    colStatus: string;
    empty: string;
    emptyHint: string;
    emptyCta: string;
    fab: string;
    emptyFiltered: string;
    reset: string;
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
    connection: string;
    notFound: (code: string) => string;
    unassigned: string;
  }
> = {
  id: {
    searchPh: "Cari nama, kode, merk, lokasi…",
    allCategories: "Semua kategori",
    allStatuses: "Semua status",
    add: "Tambah",
    scan: "Pindai",
    printAll: (n) => `Cetak ${n} label`,
    printBusy: "Menyiapkan…",
    printFailed: "Gagal membuat label PDF.",
    sumItems: (n) => `${n} barang`,
    sumUnits: (n) => `${n} unit`,
    sumAttention: (n) => `${n} perlu perhatian`,
    filteredOf: (total) => `dari ${total}`,
    colItem: "Barang",
    colLocation: "Lokasi",
    colQty: "Jumlah",
    colHolder: "Pemegang",
    colStatus: "Status",
    empty: "Belum ada barang inventaris.",
    emptyHint: "Cukup isi namanya. Kode aset dan QR dibuat otomatis — Anda tidak perlu menomori apa pun.",
    emptyCta: "Tambah barang pertama",
    fab: "Tambah barang",
    emptyFiltered: "Tidak ada barang yang cocok.",
    reset: "Hapus filter",
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
    connection: "Koneksi bermasalah. Coba lagi.",
    notFound: (code) => `Barang ${code} tidak ditemukan.`,
    unassigned: "—",
  },
  en: {
    searchPh: "Search name, code, brand, location…",
    allCategories: "All categories",
    allStatuses: "All statuses",
    add: "Add",
    scan: "Scan",
    printAll: (n) => `Print ${n} labels`,
    printBusy: "Preparing…",
    printFailed: "Failed to build the label PDF.",
    sumItems: (n) => `${n} items`,
    sumUnits: (n) => `${n} units`,
    sumAttention: (n) => `${n} need attention`,
    filteredOf: (total) => `of ${total}`,
    colItem: "Item",
    colLocation: "Location",
    colQty: "Qty",
    colHolder: "Holder",
    colStatus: "Status",
    empty: "No inventory items yet.",
    emptyHint: "Just type the name. The asset code and QR are generated for you — no numbering to remember.",
    emptyCta: "Add the first item",
    fab: "Add item",
    emptyFiltered: "No matching items.",
    reset: "Clear filters",
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
    connection: "Connection problem. Try again.",
    notFound: (code) => `Item ${code} was not found.`,
    unassigned: "—",
  },
};

/** Delay stagger di-cap: daftar panjang tetap tiba dalam satu ketukan (≤ 0.32s). */
const MAX_STAGGER = 8;

/** Kolom sejajar di layar lebar; di ponsel menyusut jadi QR · barang · status. */
const COLS =
  "grid-cols-[36px_minmax(0,1fr)_auto] lg:grid-cols-[36px_minmax(0,1fr)_180px_92px_150px_116px_20px]";

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
  /** Barang yang baru saja dibuat — detailnya menyorot QR baru sekali saja. */
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
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
    return { units, value, attention };
  }, [filtered]);

  const selected = list.find((i) => i.id === selectedId) ?? null;
  const isFiltered = query.trim() !== "" || category !== "all" || status !== "all";

  function clearFilters() {
    setQuery("");
    setCategory("all");
    setStatus("all");
  }

  function upsert(saved: InventoryItem, mode: "create" | "update") {
    setList((cur) => (mode === "create" ? [saved, ...cur] : cur.map((i) => (i.id === saved.id ? saved : i))));
    toast.success(mode === "create" ? t.created : t.updated);
    // Barang baru langsung membuka detailnya: kode & QR yang baru dibuat
    // ditampilkan saat itu juga, lengkap dengan ajakan mencetak labelnya.
    if (mode === "create") {
      setSelectedId(saved.id);
      setJustCreatedId(saved.id);
    }
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
    <div className="space-y-3">
      {/* Baris aksi — tanpa panel pembungkus, langsung ke alat yang dipakai */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
        <div className="flex items-center gap-2">
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto flex-1 sm:flex-none">
            <option value="all">{t.allCategories}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[locale][c]}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto flex-1 sm:flex-none">
            <option value="all">{t.allStatuses}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[locale][s]}
              </option>
            ))}
          </Select>
          <Button variant="outline" onClick={() => setScanning(true)} className="shrink-0">
            <ScanLine className="h-4 w-4" />
            <span className="hidden sm:inline">{t.scan}</span>
          </Button>
          {canManage && (
            <Button onClick={() => setAdding(true)} className="hidden shrink-0 lg:inline-flex">
              <Plus className="h-4 w-4" /> {t.add}
            </Button>
          )}
        </div>
      </div>

      {/* Ringkasan satu baris — angka yang sama, tanpa empat kotak */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span key={`i-${filtered.length}`} className="animate-count-up font-semibold text-ink tabular-nums">
          {t.sumItems(filtered.length)}
        </span>
        {isFiltered && <span className="text-faint">{t.filteredOf(list.length)}</span>}
        <span className="text-line">·</span>
        <span key={`u-${stats.units}`} className="animate-count-up text-muted tabular-nums">
          {t.sumUnits(stats.units)}
        </span>
        <span className="text-line">·</span>
        <span key={`v-${stats.value}`} className="animate-count-up text-muted tabular-nums">
          {rupiah(stats.value, { compact: true })}
        </span>
        {stats.attention > 0 && (
          <>
            <span className="text-line">·</span>
            <span key={`a-${stats.attention}`} className="animate-count-up font-medium text-clay tabular-nums">
              {t.sumAttention(stats.attention)}
            </span>
          </>
        )}
        <span className="ml-auto flex items-center gap-1">
          {isFiltered && (
            <button
              onClick={clearFilters}
              className="cursor-pointer rounded-lg px-2 py-1 font-medium text-muted transition-colors hover:bg-sand hover:text-ink"
            >
              {t.reset}
            </button>
          )}
          {canManage && filtered.length > 0 && (
            <button
              onClick={printAll}
              disabled={printBusy}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 font-medium text-muted transition-colors hover:bg-sand hover:text-ink disabled:opacity-50"
            >
              <Printer className="h-3.5 w-3.5" />
              {printBusy ? t.printBusy : t.printAll(filtered.length)}
            </button>
          )}
        </span>
      </div>

      {/* Daftar padat: satu panel, baris demi baris */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-cream/40 px-5 py-12 text-center">
          <PackageSearch className="mx-auto h-8 w-8 text-faint" />
          <p className="mt-2 text-sm text-faint">{list.length === 0 ? t.empty : t.emptyFiltered}</p>
          {/* Inventaris kosong tanpa ajakan = jalan buntu. Beri jalur langsung,
              dan jelaskan bahwa kode + QR tidak perlu dipikirkan. */}
          {list.length === 0 && canManage && (
            <>
              <p className="mx-auto mt-1 max-w-sm text-xs text-faint">{t.emptyHint}</p>
              <Button className="mt-4" onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" /> {t.emptyCta}
              </Button>
            </>
          )}
          {list.length > 0 && isFiltered && (
            <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
              {t.reset}
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-panel">
          {/* Kepala kolom hanya di layar lebar */}
          <div
            className={cn(
              "hidden items-center gap-3 border-b border-line bg-cream/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-faint lg:grid",
              COLS,
            )}
          >
            {/* Kolom QR tak berjudul — jumlah sel harus persis sama dengan baris data */}
            <span />
            <span>{t.colItem}</span>
            <span>{t.colLocation}</span>
            <span className="text-right">{t.colQty}</span>
            <span>{t.colHolder}</span>
            <span>{t.colStatus}</span>
            <span />
          </div>

          <div className="divide-y divide-line">
            {filtered.map((item, i) => (
              <button
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                style={{ ["--i" as string]: Math.min(i, MAX_STAGGER) }}
                className={cn(
                  "stagger-item grid w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-cream/60 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-forest-400",
                  COLS,
                  removingId === item.id && "animate-row-out",
                )}
              >
                {/* QR kecil: penanda visual bahwa tiap barang punya kodenya sendiri */}
                {origin ? (
                  <QrCode
                    value={itemQrPayload(origin, item.code)}
                    size={36}
                    border={1}
                    className="shrink-0 ring-1 ring-line"
                    title={`QR ${item.code}`}
                  />
                ) : (
                  <span className="h-9 w-9 shrink-0 animate-pulse rounded-xl bg-sand" />
                )}

                <span className="min-w-0">
                  <span className="flex items-baseline gap-2">
                    <span className="shrink-0 font-mono text-[11px] font-semibold text-faint tabular-nums">
                      {item.code}
                    </span>
                    <span className="truncate text-sm font-medium text-ink">{item.name}</span>
                  </span>
                  {/* Di ponsel kolom-kolom lain disembunyikan → ringkas di satu baris meta */}
                  <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-faint lg:hidden">
                    {item.location || "—"} · {item.quantity} {item.unit}
                    {item.condition !== "baik" && (
                      <span className={CONDITION_TEXT[item.condition]}>
                        · {CONDITION_LABEL[locale][item.condition]}
                      </span>
                    )}
                  </span>
                </span>

                <span className="hidden truncate text-sm text-muted lg:block">{item.location || "—"}</span>
                <span className="hidden text-right text-sm text-muted tabular-nums lg:block">
                  {item.quantity} <span className="text-faint">{item.unit}</span>
                </span>
                <span className="hidden truncate text-sm text-muted lg:block">
                  {item.assignedTo ? (empName.get(item.assignedTo) ?? "—") : t.unassigned}
                </span>
                <span className="hidden lg:block">
                  <Badge tone={STATUS_TONE[item.status]} dot className="!px-2 !py-0.5 !text-[10px]">
                    {STATUS_LABEL[locale][item.status]}
                  </Badge>
                  {item.condition !== "baik" && (
                    <span className={cn("mt-1 block text-[10px] font-medium", CONDITION_TEXT[item.condition])}>
                      {CONDITION_LABEL[locale][item.condition]}
                    </span>
                  )}
                </span>

                {/* Ponsel: status sebagai chip; layar lebar: chevron penanda bisa dibuka */}
                <Badge tone={STATUS_TONE[item.status]} dot className="shrink-0 !px-2 !py-0.5 !text-[10px] lg:hidden">
                  {STATUS_LABEL[locale][item.status]}
                </Badge>
                <ChevronRight className="hidden h-4 w-4 shrink-0 text-faint lg:block" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tombol tambah mengambang — di ponsel, toolbar ada jauh di atas layar;
          ini menaruh aksi utama di zona jempol, di atas bottom nav. */}
      {canManage && list.length > 0 && (
        <button
          onClick={() => setAdding(true)}
          aria-label={t.fab}
          className="fixed bottom-20 right-4 z-30 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-forest-600 text-cream shadow-pop transition-transform hover:bg-forest-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-400 focus-visible:ring-offset-2 focus-visible:ring-offset-cream lg:hidden"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {/* Detail */}
      <Sheet
        open={selected !== null}
        onClose={() => {
          setSelectedId(null);
          setJustCreatedId(null);
        }}
        title={t.detailTitle}
        width="lg"
      >
        {selected && (
          <ItemDetail
            item={selected}
            justCreated={justCreatedId === selected.id}
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
