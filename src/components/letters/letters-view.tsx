"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, MailPlus, MailSearch, Plus, Search } from "lucide-react";
import type { OutgoingLetter } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { apiErrorMessage } from "@/lib/api-error";
import { cn, formatDate, witaToday } from "@/lib/utils";
import {
  LETTER_CATEGORIES, LETTER_CATEGORY_LABEL, LETTER_STATUSES, LETTER_STATUS_LABEL,
  LETTER_STATUS_TONE, LETTER_URGENCY_LABEL, LETTER_URGENCY_TEXT, fileExtOf, letterNeedsAttention,
} from "@/lib/letters";
import { useLocale } from "@/components/layout/locale-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { DocFileBadge } from "@/components/documents/doc-file-badge";
import { LetterDetail } from "./letter-detail";
import { LetterForm } from "./letter-form";

const STR: Record<Locale, Record<string, string>> = {
  id: {
    searchPh: "Cari perihal, tujuan, nomor surat…",
    allCategories: "Semua jenis",
    allStatuses: "Semua status",
    add: "Catat surat",
    sumLetters: "surat",
    filteredOf: "dari",
    sumDraft: "draft",
    sumStale: "draft lewat tanggal",
    colLetter: "Surat",
    colRecipient: "Tujuan",
    colDate: "Tanggal",
    colStatus: "Status",
    empty: "Belum ada surat keluar tercatat.",
    emptyHint: "Cukup isi tujuan dan perihalnya. Nomor agenda dibuat otomatis — arsip langsung rapi.",
    emptyCta: "Catat surat pertama",
    fab: "Catat surat",
    emptyFiltered: "Tidak ada surat yang cocok.",
    reset: "Hapus filter",
    detailTitle: "Detail Surat Keluar",
    addTitle: "Catat Surat Keluar",
    editTitle: "Ubah Surat Keluar",
    deleteTitle: "Hapus surat",
    deleteMsg: "Data surat pada agenda tidak bisa dikembalikan.",
    deleteConfirm: "Ya, hapus",
    created: "Surat tercatat ✓",
    updated: "Surat diperbarui ✓",
    deleted: "Surat dihapus ✓",
    sentOk: "Surat ditandai terkirim ✓",
    connection: "Koneksi bermasalah. Coba lagi.",
    notFound: "Surat tidak ditemukan.",
  },
  en: {
    searchPh: "Search subject, recipient, letter number…",
    allCategories: "All types",
    allStatuses: "All statuses",
    add: "Register letter",
    sumLetters: "letters",
    filteredOf: "of",
    sumDraft: "draft",
    sumStale: "overdue drafts",
    colLetter: "Letter",
    colRecipient: "Recipient",
    colDate: "Date",
    colStatus: "Status",
    empty: "No outgoing letters registered yet.",
    emptyHint: "Just fill in the recipient and subject. The agenda number is generated for you.",
    emptyCta: "Register the first letter",
    fab: "Register letter",
    emptyFiltered: "No matching letters.",
    reset: "Clear filters",
    detailTitle: "Outgoing Letter Detail",
    addTitle: "Register Outgoing Letter",
    editTitle: "Edit Outgoing Letter",
    deleteTitle: "Delete letter",
    deleteMsg: "The agenda entry cannot be restored.",
    deleteConfirm: "Yes, delete",
    created: "Letter registered ✓",
    updated: "Letter updated ✓",
    deleted: "Letter deleted ✓",
    sentOk: "Letter marked as sent ✓",
    connection: "Connection problem. Try again.",
    notFound: "Letter not found.",
  },
};

/** Delay stagger di-cap: daftar panjang tetap tiba dalam satu ketukan (≤ 0.32s). */
const MAX_STAGGER = 8;

/**
 * Kolom sejajar di layar lebar; di ponsel menyusut jadi ikon · surat · status.
 * Pola minmax(0,…) + min-w-0 sama seperti modul lain — kolom menyusut dan teks
 * di-truncate, bukan mendorong halaman jadi scroll horizontal.
 */
const COLS =
  "grid-cols-[36px_minmax(0,1fr)_auto] " +
  "xl:grid-cols-[36px_minmax(0,1fr)_minmax(0,190px)_minmax(0,110px)_minmax(0,120px)_16px]";

export function LettersView({
  letters,
  canManage,
  initialCode,
}: {
  letters: OutgoingLetter[];
  canManage: boolean;
  /** Kode dari ?surat=… — detailnya dibuka otomatis (tautan bisa dibagikan). */
  initialCode?: string | null;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const router = useRouter();
  const toast = useToast();
  const today = witaToday();

  const [list, setList] = useState(letters);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Surat yang baru dicatat — detailnya menyorot nomor agenda baru sekali saja. */
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<OutgoingLetter | null>(null);
  const [deleting, setDeleting] = useState<OutgoingLetter | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Deep link: buka detail sekali saat halaman dimuat.
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current || !initialCode) return;
    deepLinked.current = true;
    const hit = list.find((l) => l.code.toUpperCase() === initialCode.toUpperCase());
    if (hit) setSelectedId(hit.id);
    else toast.error(t.notFound);
    // sengaja hanya sekali saat mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  // URL mengikuti detail yang terbuka → tautan bisa dibagikan / di-refresh.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const letter = list.find((l) => l.id === selectedId);
    const url = new URL(window.location.href);
    if (letter) url.searchParams.set("surat", letter.code);
    else url.searchParams.delete("surat");
    window.history.replaceState(null, "", url.toString());
  }, [selectedId, list]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((l) => {
      if (category !== "all" && l.category !== category) return false;
      if (status !== "all" && l.status !== status) return false;
      if (!q) return true;
      return [l.subject, l.recipient, l.code, l.letterNumber, l.signer, l.note]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q));
    });
  }, [list, query, category, status]);

  const stats = useMemo(
    () => ({
      draft: filtered.filter((l) => l.status === "draft").length,
      stale: filtered.filter((l) => letterNeedsAttention(l, today)).length,
    }),
    [filtered, today],
  );

  const selected = list.find((l) => l.id === selectedId) ?? null;
  const isFiltered = query.trim() !== "" || category !== "all" || status !== "all";

  function clearFilters() {
    setQuery("");
    setCategory("all");
    setStatus("all");
  }

  function upsert(saved: OutgoingLetter, mode: "create" | "update") {
    setList((cur) => (mode === "create" ? [saved, ...cur] : cur.map((l) => (l.id === saved.id ? saved : l))));
    toast.success(mode === "create" ? t.created : t.updated);
    // Surat baru langsung membuka detailnya: nomor agenda yang baru dibuat
    // terlihat saat itu juga.
    if (mode === "create") {
      setSelectedId(saved.id);
      setJustCreatedId(saved.id);
    }
    router.refresh();
  }

  /** Jalur cepat draft → terkirim, tanpa membuka form. */
  async function markSent(letter: OutgoingLetter) {
    setBusyId(letter.id);
    try {
      const res = await fetch("/api/letters", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: letter.id, status: "terkirim", sentDate: today }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.letter) {
        toast.error(apiErrorMessage(data?.error, locale, res.status));
        return;
      }
      const saved = data.letter as OutgoingLetter;
      setList((cur) => cur.map((l) => (l.id === saved.id ? saved : l)));
      toast.success(t.sentOk);
      router.refresh();
    } catch {
      toast.error(t.connection);
    } finally {
      setBusyId(null);
    }
  }

  async function remove() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const res = await fetch("/api/letters", {
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
        setList((cur) => cur.filter((l) => l.id !== goneId));
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
            className="min-w-0 sm:w-48"
          >
            <option value="all">{t.allCategories}</option>
            {LETTER_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {LETTER_CATEGORY_LABEL[locale][c]}
              </option>
            ))}
          </Select>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label={t.allStatuses}
            className="min-w-0 sm:w-40"
          >
            <option value="all">{t.allStatuses}</option>
            {LETTER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LETTER_STATUS_LABEL[locale][s]}
              </option>
            ))}
          </Select>
          {canManage && (
            <Button onClick={() => setAdding(true)} className="hidden shrink-0 lg:inline-flex">
              <MailPlus className="h-4 w-4" /> {t.add}
            </Button>
          )}
        </div>
      </div>

      {/* Ringkasan satu baris — angka yang sama, tanpa kotak-kotak */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span key={`n-${filtered.length}`} className="animate-count-up font-semibold text-ink tabular-nums">
          {filtered.length} {t.sumLetters}
        </span>
        {isFiltered && (
          <span className="text-faint">
            {t.filteredOf} {list.length}
          </span>
        )}
        {stats.draft > 0 && (
          <>
            <span className="text-line">·</span>
            <span key={`d-${stats.draft}`} className="animate-count-up text-muted tabular-nums">
              {stats.draft} {t.sumDraft}
            </span>
          </>
        )}
        {stats.stale > 0 && (
          <>
            <span className="text-line">·</span>
            <span key={`s-${stats.stale}`} className="animate-count-up font-medium text-clay tabular-nums">
              {stats.stale} {t.sumStale}
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
          <MailSearch className="mx-auto h-8 w-8 text-faint" />
          <p className="mt-2 text-sm text-faint">{list.length === 0 ? t.empty : t.emptyFiltered}</p>
          {list.length === 0 && canManage && (
            <>
              <p className="mx-auto mt-1 max-w-sm text-xs text-faint">{t.emptyHint}</p>
              <Button className="mt-4" onClick={() => setAdding(true)}>
                <MailPlus className="h-4 w-4" /> {t.emptyCta}
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
            <span>{t.colLetter}</span>
            <span>{t.colRecipient}</span>
            <span>{t.colDate}</span>
            <span>{t.colStatus}</span>
            <span />
          </div>

          <div className="divide-y divide-line">
            {filtered.map((l, i) => (
              <button
                key={l.id}
                onClick={() => setSelectedId(l.id)}
                style={{ ["--i" as string]: Math.min(i, MAX_STAGGER) }}
                className={cn(
                  "stagger-item grid w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-cream/60 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-forest-400",
                  COLS,
                  removingId === l.id && "animate-row-out",
                )}
              >
                <DocFileBadge ext={fileExtOf(l.filePath)} />

                <span className="block min-w-0">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0 font-mono text-[11px] font-semibold text-faint tabular-nums">
                      {l.code}
                    </span>
                    <span className="truncate text-sm font-medium text-ink">{l.subject}</span>
                  </span>
                  {/* Di ponsel kolom lain disembunyikan → ringkas di satu baris meta. */}
                  <span className="mt-0.5 block truncate text-xs text-faint">
                    {l.recipient}
                    <span className="xl:hidden">
                      {" · "}
                      {formatDate(l.letterDate, "short", locale)}
                    </span>
                    {l.urgency !== "biasa" && (
                      <span className={LETTER_URGENCY_TEXT[l.urgency]}>
                        {" · "}
                        {LETTER_URGENCY_LABEL[locale][l.urgency]}
                      </span>
                    )}
                  </span>
                </span>

                <span className="hidden min-w-0 truncate text-sm text-muted xl:block">
                  {l.recipient}
                  {l.letterNumber && (
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-faint">
                      {l.letterNumber}
                    </span>
                  )}
                </span>
                <span className="hidden min-w-0 truncate text-sm text-muted tabular-nums xl:block">
                  {formatDate(l.letterDate, "short", locale)}
                </span>
                <span className="hidden min-w-0 xl:block">
                  <Badge tone={LETTER_STATUS_TONE[l.status]} dot className="max-w-full !px-2 !py-0.5 !text-[10px]">
                    <span className="truncate">{LETTER_STATUS_LABEL[locale][l.status]}</span>
                  </Badge>
                  {letterNeedsAttention(l, today) && (
                    <span className="mt-1 block truncate text-[10px] font-medium text-clay">{t.sumStale}</span>
                  )}
                </span>

                {/* Ponsel: status sebagai chip; layar lebar: chevron penanda bisa dibuka */}
                <Badge tone={LETTER_STATUS_TONE[l.status]} dot className="shrink-0 !px-2 !py-0.5 !text-[10px] xl:hidden">
                  {LETTER_STATUS_LABEL[locale][l.status]}
                </Badge>
                <ChevronRight className="hidden h-4 w-4 shrink-0 text-faint xl:block" />
              </button>
            ))}
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
          <LetterDetail
            letter={selected}
            justCreated={justCreatedId === selected.id}
            canManage={canManage}
            busy={busyId === selected.id}
            onEdit={() => setEditing(selected)}
            onDelete={() => setDeleting(selected)}
            onMarkSent={() => markSent(selected)}
          />
        )}
      </Sheet>

      {/* Catat */}
      <Sheet open={adding} onClose={() => setAdding(false)} title={t.addTitle} width="lg">
        {adding && (
          <LetterForm
            onSaved={(saved) => {
              setAdding(false);
              upsert(saved, "create");
            }}
            onCancel={() => setAdding(false)}
          />
        )}
      </Sheet>

      {/* Ubah */}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={t.editTitle} width="lg">
        {editing && (
          <LetterForm
            letter={editing}
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
        title={`${t.deleteTitle} ${deleting?.code ?? ""}?`}
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
