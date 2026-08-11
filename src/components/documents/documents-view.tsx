"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, FileSearch, Plus, Search } from "lucide-react";
import type { CompanyDocument } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { apiErrorMessage } from "@/lib/api-error";
import { cn, formatDate, witaToday } from "@/lib/utils";
import {
  DOC_CATEGORIES,
  DOC_CATEGORY_LABEL,
  EXPIRY_LABEL,
  EXPIRY_STATUSES,
  EXPIRY_TEXT,
  EXPIRY_TONE,
  docNeedsAttention,
  expiryStatus,
  fileExt,
} from "@/lib/documents";
import { useLocale } from "@/components/layout/locale-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { DocFileBadge } from "./doc-file-badge";
import { DocumentDetail } from "./document-detail";
import { DocumentForm } from "./document-form";

const STR: Record<
  Locale,
  {
    searchPh: string;
    allCategories: string;
    allExpiry: string;
    add: string;
    sumDocs: (n: number) => string;
    sumExpiring: (n: number) => string;
    sumExpired: (n: number) => string;
    filteredOf: (total: number) => string;
    colDoc: string;
    colCategory: string;
    colNumber: string;
    colExpiry: string;
    forever: string;
    empty: string;
    emptyHint: string;
    emptyCta: string;
    fab: string;
    emptyFiltered: string;
    reset: string;
    detailTitle: string;
    addTitle: string;
    editTitle: string;
    deleteTitle: (name: string) => string;
    deleteMsg: string;
    deleteConfirm: string;
    created: string;
    updated: string;
    deleted: string;
    connection: string;
    notFound: (code: string) => string;
  }
> = {
  id: {
    searchPh: "Cari nama, kode, nomor dokumen…",
    allCategories: "Semua kategori",
    allExpiry: "Semua masa berlaku",
    add: "Tambah",
    sumDocs: (n) => `${n} dokumen`,
    sumExpiring: (n) => `${n} segera berakhir`,
    sumExpired: (n) => `${n} kedaluwarsa`,
    filteredOf: (total) => `dari ${total}`,
    colDoc: "Dokumen",
    colCategory: "Kategori",
    colNumber: "Nomor",
    colExpiry: "Masa berlaku",
    forever: "Selamanya",
    empty: "Belum ada dokumen tersimpan.",
    emptyHint: "Cukup isi nama dan unggah berkasnya. Kode dokumen dibuat otomatis — arsip langsung rapi.",
    emptyCta: "Unggah dokumen pertama",
    fab: "Tambah dokumen",
    emptyFiltered: "Tidak ada dokumen yang cocok.",
    reset: "Hapus filter",
    detailTitle: "Detail Dokumen",
    addTitle: "Tambah Dokumen",
    editTitle: "Ubah Dokumen",
    deleteTitle: (name) => `Hapus "${name}"?`,
    deleteMsg: "Data dokumen tidak bisa dikembalikan.",
    deleteConfirm: "Ya, hapus",
    created: "Dokumen ditambahkan ✓",
    updated: "Dokumen diperbarui ✓",
    deleted: "Dokumen dihapus ✓",
    connection: "Koneksi bermasalah. Coba lagi.",
    notFound: (code) => `Dokumen ${code} tidak ditemukan.`,
  },
  en: {
    searchPh: "Search name, code, document number…",
    allCategories: "All categories",
    allExpiry: "All validity",
    add: "Add",
    sumDocs: (n) => `${n} documents`,
    sumExpiring: (n) => `${n} expiring soon`,
    sumExpired: (n) => `${n} expired`,
    filteredOf: (total) => `of ${total}`,
    colDoc: "Document",
    colCategory: "Category",
    colNumber: "Number",
    colExpiry: "Validity",
    forever: "Forever",
    empty: "No documents stored yet.",
    emptyHint: "Just type the name and upload the file. The document code is generated for you — the archive stays tidy.",
    emptyCta: "Upload the first document",
    fab: "Add document",
    emptyFiltered: "No matching documents.",
    reset: "Clear filters",
    detailTitle: "Document Detail",
    addTitle: "Add Document",
    editTitle: "Edit Document",
    deleteTitle: (name) => `Delete "${name}"?`,
    deleteMsg: "The document record cannot be restored.",
    deleteConfirm: "Yes, delete",
    created: "Document added ✓",
    updated: "Document updated ✓",
    deleted: "Document deleted ✓",
    connection: "Connection problem. Try again.",
    notFound: (code) => `Document ${code} was not found.`,
  },
};

/** Delay stagger di-cap: daftar panjang tetap tiba dalam satu ketukan (≤ 0.32s). */
const MAX_STAGGER = 8;

/**
 * Kolom sejajar di layar lebar; di ponsel menyusut jadi ikon · dokumen · status.
 * Pola minmax(0,…) + min-w-0 sama seperti daftar inventaris — kolom menyusut
 * dan teks di-truncate, bukan mendorong halaman jadi scroll horizontal.
 */
const COLS =
  "grid-cols-[36px_minmax(0,1fr)_auto] " +
  "xl:grid-cols-[36px_minmax(0,1fr)_minmax(0,150px)_minmax(0,160px)_minmax(0,140px)_16px]";

export function DocumentsView({
  docs,
  canManage,
  initialCode,
}: {
  docs: CompanyDocument[];
  canManage: boolean;
  /** Kode dari ?doc=… — detailnya dibuka otomatis (tautan bisa dibagikan). */
  initialCode?: string | null;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const router = useRouter();
  const toast = useToast();
  const today = witaToday();

  const [list, setList] = useState(docs);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [expiry, setExpiry] = useState<string>("all");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Dokumen yang baru saja dibuat — detailnya menyorot kode baru sekali saja. */
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CompanyDocument | null>(null);
  const [deleting, setDeleting] = useState<CompanyDocument | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Deep link: buka detail sekali saat halaman dimuat.
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current || !initialCode) return;
    deepLinked.current = true;
    const hit = list.find((d) => d.code.toUpperCase() === initialCode.toUpperCase());
    if (hit) setSelectedId(hit.id);
    else toast.error(t.notFound(initialCode));
    // sengaja hanya sekali saat mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  // URL mengikuti detail yang terbuka → tautan bisa dibagikan / di-refresh.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const doc = list.find((d) => d.id === selectedId);
    const url = new URL(window.location.href);
    if (doc) url.searchParams.set("doc", doc.code);
    else url.searchParams.delete("doc");
    window.history.replaceState(null, "", url.toString());
  }, [selectedId, list]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((doc) => {
      if (category !== "all" && doc.category !== category) return false;
      if (expiry !== "all" && expiryStatus(doc, today) !== expiry) return false;
      if (!q) return true;
      return [doc.name, doc.code, doc.docNumber, doc.note]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q));
    });
  }, [list, query, category, expiry, today]);

  const stats = useMemo(() => {
    const expiring = filtered.filter((d) => expiryStatus(d, today) === "segera").length;
    const expired = filtered.filter((d) => expiryStatus(d, today) === "kedaluwarsa").length;
    return { expiring, expired };
  }, [filtered, today]);

  const selected = list.find((d) => d.id === selectedId) ?? null;
  const isFiltered = query.trim() !== "" || category !== "all" || expiry !== "all";

  function clearFilters() {
    setQuery("");
    setCategory("all");
    setExpiry("all");
  }

  function upsert(saved: CompanyDocument, mode: "create" | "update") {
    setList((cur) => (mode === "create" ? [saved, ...cur] : cur.map((d) => (d.id === saved.id ? saved : d))));
    toast.success(mode === "create" ? t.created : t.updated);
    // Dokumen baru langsung membuka detailnya: kode yang baru dibuat terlihat
    // saat itu juga, lengkap dengan tombol buka/unduh berkasnya.
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
      const res = await fetch("/api/documents", {
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
        setList((cur) => cur.filter((d) => d.id !== goneId));
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

  return (
    <div className="space-y-3">
      {/* Baris aksi — pencarian + dua filter; di ponsel filter dibagi dua kolom. */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchPh}
            aria-label={t.searchPh}
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label={t.allCategories}
            className="min-w-0 sm:w-44"
          >
            <option value="all">{t.allCategories}</option>
            {DOC_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {DOC_CATEGORY_LABEL[locale][c]}
              </option>
            ))}
          </Select>
          <Select
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            aria-label={t.allExpiry}
            className="min-w-0 sm:w-44"
          >
            <option value="all">{t.allExpiry}</option>
            {EXPIRY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {EXPIRY_LABEL[locale][s]}
              </option>
            ))}
          </Select>
          {canManage && (
            <Button onClick={() => setAdding(true)} className="hidden shrink-0 lg:inline-flex">
              <Plus className="h-4 w-4" /> {t.add}
            </Button>
          )}
        </div>
      </div>

      {/* Ringkasan satu baris — angka yang sama, tanpa kotak-kotak */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span key={`d-${filtered.length}`} className="animate-count-up font-semibold text-ink tabular-nums">
          {t.sumDocs(filtered.length)}
        </span>
        {isFiltered && <span className="text-faint">{t.filteredOf(list.length)}</span>}
        {stats.expiring > 0 && (
          <>
            <span className="text-line">·</span>
            <span key={`s-${stats.expiring}`} className="animate-count-up font-medium text-[#8a6512] tabular-nums">
              {t.sumExpiring(stats.expiring)}
            </span>
          </>
        )}
        {stats.expired > 0 && (
          <>
            <span className="text-line">·</span>
            <span key={`e-${stats.expired}`} className="animate-count-up font-medium text-clay tabular-nums">
              {t.sumExpired(stats.expired)}
            </span>
          </>
        )}
        {isFiltered && (
          <button
            onClick={clearFilters}
            className="ml-auto cursor-pointer rounded-lg px-2 py-1 font-medium text-muted transition-colors hover:bg-sand hover:text-ink"
          >
            {t.reset}
          </button>
        )}
      </div>

      {/* Daftar padat: satu panel, baris demi baris */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-cream/40 px-5 py-12 text-center">
          <FileSearch className="mx-auto h-8 w-8 text-faint" />
          <p className="mt-2 text-sm text-faint">{list.length === 0 ? t.empty : t.emptyFiltered}</p>
          {/* Arsip kosong tanpa ajakan = jalan buntu. Beri jalur langsung. */}
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
              "hidden items-center gap-3 border-b border-line bg-cream/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-faint xl:grid",
              COLS,
            )}
          >
            {/* Kolom ikon tak berjudul — jumlah sel harus persis sama dengan baris data */}
            <span />
            <span>{t.colDoc}</span>
            <span>{t.colCategory}</span>
            <span>{t.colNumber}</span>
            <span>{t.colExpiry}</span>
            <span />
          </div>

          <div className="divide-y divide-line">
            {filtered.map((doc, i) => {
              const status = expiryStatus(doc, today);
              return (
                <button
                  key={doc.id}
                  onClick={() => setSelectedId(doc.id)}
                  style={{ ["--i" as string]: Math.min(i, MAX_STAGGER) }}
                  className={cn(
                    "stagger-item grid w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-cream/60 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-forest-400",
                    COLS,
                    removingId === doc.id && "animate-row-out",
                  )}
                >
                  {/* Ikon jenis berkas: penanda cepat PDF/gambar/spreadsheet */}
                  <DocFileBadge ext={fileExt(doc.filePath)} />

                  <span className="block min-w-0">
                    {/* min-w-0 pada flex-nya juga: tanpa itu `truncate` di anak
                        tidak pernah aktif karena flex item memakai lebar kontennya. */}
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="shrink-0 font-mono text-[11px] font-semibold text-faint tabular-nums">
                        {doc.code}
                      </span>
                      <span className="truncate text-sm font-medium text-ink">{doc.name}</span>
                    </span>
                    {/* Di ponsel kolom lain disembunyikan → ringkas di satu baris meta. */}
                    <span className="mt-0.5 block truncate text-xs text-faint xl:hidden">
                      {DOC_CATEGORY_LABEL[locale][doc.category]}
                      {doc.docNumber && ` · ${doc.docNumber}`}
                      {docNeedsAttention(doc, today) && (
                        <span className={EXPIRY_TEXT[status]}>
                          {" · "}
                          {EXPIRY_LABEL[locale][status]}
                        </span>
                      )}
                    </span>
                  </span>

                  <span className="hidden min-w-0 truncate text-sm text-muted xl:block">
                    {DOC_CATEGORY_LABEL[locale][doc.category]}
                  </span>
                  <span className="hidden min-w-0 truncate text-sm text-muted xl:block">
                    {doc.docNumber ? <span className="font-mono text-xs">{doc.docNumber}</span> : "—"}
                  </span>
                  <span className="hidden min-w-0 xl:block">
                    {doc.expiryDate ? (
                      <>
                        <span className={cn("block truncate text-sm tabular-nums", EXPIRY_TEXT[status])}>
                          {formatDate(doc.expiryDate, "short", locale)}
                        </span>
                        {docNeedsAttention(doc, today) && (
                          <span className={cn("block truncate text-[10px] font-medium", EXPIRY_TEXT[status])}>
                            {EXPIRY_LABEL[locale][status]}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="block truncate text-sm text-faint">{t.forever}</span>
                    )}
                  </span>

                  {/* Ponsel: status sebagai chip; layar lebar: chevron penanda bisa dibuka */}
                  <Badge
                    tone={doc.expiryDate ? EXPIRY_TONE[status] : "neutral"}
                    dot={Boolean(doc.expiryDate)}
                    className="shrink-0 !px-2 !py-0.5 !text-[10px] xl:hidden"
                  >
                    {doc.expiryDate ? EXPIRY_LABEL[locale][status] : t.forever}
                  </Badge>
                  <ChevronRight className="hidden h-4 w-4 shrink-0 text-faint xl:block" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tombol tambah mengambang — aksi utama di zona jempol, di atas bottom nav. */}
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
          <DocumentDetail
            doc={selected}
            justCreated={justCreatedId === selected.id}
            canManage={canManage}
            onEdit={() => setEditing(selected)}
            onDelete={() => setDeleting(selected)}
          />
        )}
      </Sheet>

      {/* Tambah */}
      <Sheet open={adding} onClose={() => setAdding(false)} title={t.addTitle} width="lg">
        <DocumentForm
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
          <DocumentForm
            doc={editing}
            onSaved={(saved) => {
              setEditing(null);
              upsert(saved, "update");
            }}
            onCancel={() => setEditing(null)}
          />
        )}
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
