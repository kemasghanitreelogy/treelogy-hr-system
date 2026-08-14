"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check, Copy, Factory, Loader2, Mail, Plus, Search, Sprout, Trash2, TrendingUp, Users, Wallet,
} from "lucide-react";
import type { LetterDept, OutgoingLetter } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { apiErrorMessage } from "@/lib/api-error";
import { cn, formatDate } from "@/lib/utils";
import { DEPT_CODE, DEPT_NAME, LETTER_DEPTS, previewCode, witaNow } from "@/lib/letters";
import { useLocale } from "@/components/layout/locale-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { SuccessCheck } from "@/components/ui/success-check";
import { useToast } from "@/components/ui/toast";

const STR: Record<Locale, Record<string, any>> = {
  id: {
    searchPh: "Cari nomor surat…",
    allDept: "Semua departemen",
    create: "Terbitkan Nomor",
    createTitle: "Terbitkan Nomor Surat",
    chooseHint: "Pilih departemen tujuan surat. Nomornya langsung terbit — tidak ada isian lain.",
    thisMonth: (bulan: string, tahun: number) => `Bulan berjalan: ${bulan} ${tahun}`,
    count: "nomor terbit",
    empty: "Belum ada nomor surat yang diterbitkan.",
    emptyHint: "Pilih departemen tujuan, nomornya langsung jadi.",
    emptyFiltered: "Tidak ada nomor yang cocok.",
    issuing: "Menerbitkan…",
    issued: "Nomor surat terbit ✓",
    copy: "Salin nomor",
    copied: "Nomor tersalin ✓",
    copyFail: "Tidak bisa menyalin — silakan salin manual.",
    again: "Terbitkan lagi",
    done: "Selesai",
    by: "Diterbitkan oleh",
    deleteTitle: "Batalkan nomor ini?",
    deleteMsg:
      "Nomor tidak akan dipakai ulang oleh sistem, jadi deretnya akan berlubang. Lakukan hanya bila surat ini belum terkirim keluar.",
    deleteYes: "Ya, batalkan",
    deleted: "Nomor dibatalkan.",
    connection: "Koneksi bermasalah. Coba lagi.",
    delete: "Batalkan nomor",
  },
  en: {
    searchPh: "Search letter number…",
    allDept: "All departments",
    create: "Issue Number",
    createTitle: "Issue Letter Number",
    chooseHint: "Pick the destination department. The number is issued instantly — nothing else to fill in.",
    thisMonth: (bulan: string, tahun: number) => `Current month: ${bulan} ${tahun}`,
    count: "numbers issued",
    empty: "No letter numbers issued yet.",
    emptyHint: "Pick a destination department and the number is ready.",
    emptyFiltered: "No matching numbers.",
    issuing: "Issuing…",
    issued: "Letter number issued ✓",
    copy: "Copy number",
    copied: "Number copied ✓",
    copyFail: "Couldn't copy — please copy it manually.",
    again: "Issue another",
    done: "Done",
    by: "Issued by",
    deleteTitle: "Void this number?",
    deleteMsg:
      "The system will not reuse it, so the sequence will have a gap. Only do this if the letter has not gone out yet.",
    deleteYes: "Yes, void it",
    deleted: "Number voided.",
    connection: "Connection problem. Try again.",
    delete: "Void number",
  },
};

const DEPT_ICON: Record<LetterDept, typeof Users> = {
  hr_ga: Users,
  sales: TrendingUp,
  finance: Wallet,
  farm: Sprout,
  factory: Factory,
};

const DEPT_TONE: Record<LetterDept, "sky" | "gold" | "forest" | "olive" | "clay"> = {
  hr_ga: "sky",
  sales: "gold",
  finance: "forest",
  farm: "olive",
  factory: "clay",
};

const MONTH_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** Tombol salin dengan tanda centang sesaat — konfirmasi tanpa toast beruntun. */
function CopyButton({
  value,
  label,
  copiedLabel,
  failLabel,
  className,
}: {
  value: string;
  label: string;
  copiedLabel: string;
  failLabel: string;
  className?: string;
}) {
  const toast = useToast();
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(value);
          setOk(true);
          setTimeout(() => setOk(false), 1600);
        } catch {
          toast.error(failLabel);
        }
      }}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
        ok ? "bg-forest-50 text-forest-700" : "text-muted hover:bg-sand hover:text-ink",
        className,
      )}
    >
      {ok ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">{ok ? copiedLabel.replace(" ✓", "") : label}</span>
    </button>
  );
}

export function LettersView({
  letters,
  canManage,
}: {
  letters: OutgoingLetter[];
  canManage: boolean;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const router = useRouter();
  const toast = useToast();

  const [list, setList] = useState(letters);
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState<string>("all");
  const [open, setOpen] = useState(false);
  /** Nomor yang baru terbit — ditampilkan besar sebagai hasil, bukan toast saja. */
  const [hasil, setHasil] = useState<OutgoingLetter | null>(null);
  const [busyDept, setBusyDept] = useState<LetterDept | null>(null);
  const [hapus, setHapus] = useState<OutgoingLetter | null>(null);
  const [busyHapus, setBusyHapus] = useState(false);

  const sekarang = witaNow();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((l) => {
      if (dept !== "all" && l.department !== dept) return false;
      return !q || l.code.toLowerCase().includes(q);
    });
  }, [list, query, dept]);

  async function terbitkan(d: LetterDept) {
    setBusyDept(d);
    try {
      const res = await fetch("/api/letters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department: d }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.letter) {
        toast.error(apiErrorMessage(data?.error, locale, res.status));
        return;
      }
      const baru = data.letter as OutgoingLetter;
      setList((cur) => [baru, ...cur]);
      setHasil(baru);
      toast.success(t.issued);
      router.refresh();
    } catch {
      toast.error(t.connection);
    } finally {
      setBusyDept(null);
    }
  }

  async function batalkan(l: OutgoingLetter) {
    setBusyHapus(true);
    try {
      const res = await fetch(`/api/letters?id=${encodeURIComponent(l.id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(apiErrorMessage(data?.error, locale, res.status));
        return;
      }
      setList((cur) => cur.filter((x) => x.id !== l.id));
      toast.success(t.deleted);
      router.refresh();
    } catch {
      toast.error(t.connection);
    } finally {
      setBusyHapus(false);
      setHapus(null);
    }
  }

  function tutup() {
    setOpen(false);
    setHasil(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            aria-label={t.allDept}
            className="min-w-0 sm:w-44"
          >
            <option value="all">{t.allDept}</option>
            {LETTER_DEPTS.map((d) => (
              <option key={d} value={d}>
                {DEPT_NAME[locale][d]}
              </option>
            ))}
          </Select>
          {canManage && (
            <Button onClick={() => setOpen(true)} className="shrink-0">
              <Plus className="h-4 w-4" /> {t.create}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span key={filtered.length} className="animate-count-up font-semibold text-ink tabular-nums">
          {filtered.length} {t.count}
        </span>
        <span className="text-line">·</span>
        <span className="text-muted">
          {t.thisMonth(MONTH_ID[sekarang.month - 1], sekarang.year)}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-cream/40 px-5 py-12 text-center">
          <Mail className="mx-auto h-8 w-8 text-faint" />
          <p className="mt-2 text-sm text-faint">{list.length === 0 ? t.empty : t.emptyFiltered}</p>
          {list.length === 0 && canManage && (
            <>
              <p className="mx-auto mt-1 max-w-md text-xs text-faint">{t.emptyHint}</p>
              <Button className="mt-4" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" /> {t.create}
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-panel">
          <div className="divide-y divide-line">
            {filtered.map((l, i) => {
              const Icon = DEPT_ICON[l.department];
              return (
                <div
                  key={l.id}
                  style={{ ["--i" as string]: Math.min(i, 8) }}
                  className="stagger-item flex items-center gap-3 px-3 py-2.5"
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                      l.department === "hr_ga" && "bg-sky-soft text-[#2b5d7c]",
                      l.department === "sales" && "bg-gold-soft text-[#8a6512]",
                      l.department === "finance" && "bg-forest-50 text-forest-600",
                      l.department === "farm" && "bg-[#e9f0d8] text-forest-700",
                      l.department === "factory" && "bg-clay-soft text-clay",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>

                  <span className="min-w-0 flex-1">
                    {/* Nomornya adalah isi utama baris ini — dibuat monospasi
                        agar deret angka & garis miringnya terbaca tepat. */}
                    <span className="block truncate font-mono text-sm font-semibold tracking-tight text-ink">
                      {l.code}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-faint">
                      {DEPT_NAME[locale][l.department]}
                      {l.createdByName ? ` · ${l.createdByName}` : ""} ·{" "}
                      {formatDate(l.createdAt, "short", locale)}
                    </span>
                  </span>

                  <Badge tone={DEPT_TONE[l.department]} className="hidden shrink-0 sm:inline-flex">
                    {DEPT_CODE[l.department]}
                  </Badge>

                  <CopyButton
                    value={l.code}
                    label={t.copy}
                    copiedLabel={t.copied}
                    failLabel={t.copyFail}
                  />

                  {canManage && (
                    <button
                      type="button"
                      onClick={() => setHapus(l)}
                      aria-label={t.delete}
                      title={t.delete}
                      className="shrink-0 cursor-pointer rounded-lg p-1.5 text-faint transition-colors hover:bg-clay-soft hover:text-clay"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Terbitkan: pilih departemen → nomor langsung jadi. */}
      <Sheet open={open} onClose={tutup} title={t.createTitle}>
        {open && !hasil && (
          <div className="space-y-3">
            <p className="rounded-xl border border-line bg-cream/60 px-3 py-2.5 text-xs leading-relaxed text-muted">
              {t.chooseHint}
            </p>
            {LETTER_DEPTS.map((d) => {
              const Icon = DEPT_ICON[d];
              const sibuk = busyDept === d;
              return (
                <button
                  key={d}
                  type="button"
                  disabled={busyDept !== null}
                  onClick={() => terbitkan(d)}
                  className="group flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-line bg-panel p-4 text-left transition-colors hover:border-forest-300 hover:bg-cream/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-400 disabled:opacity-60"
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                      d === "hr_ga" && "bg-sky-soft text-[#2b5d7c]",
                      d === "sales" && "bg-gold-soft text-[#8a6512]",
                      d === "finance" && "bg-forest-50 text-forest-600",
                      d === "farm" && "bg-[#e9f0d8] text-forest-700",
                      d === "factory" && "bg-clay-soft text-clay",
                    )}
                  >
                    {sibuk ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{DEPT_NAME[locale][d]}</span>
                    {/* Pratinjau bentuk nomornya; 0000 karena nomor urut baru
                        diketahui saat database menerbitkannya. */}
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-faint">
                      {sibuk ? t.issuing : previewCode(d, sekarang)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {open && hasil && (
          <div className="space-y-4 text-center">
            <div className="flex justify-center text-forest-600">
              <SuccessCheck />
            </div>
            <div className="rounded-2xl border border-forest-200 bg-forest-50 px-4 py-5">
              <p className="text-xs font-medium text-forest-700">
                {DEPT_NAME[locale][hasil.department]}
              </p>
              <p className="mt-1 break-all font-mono text-xl font-bold tracking-tight text-ink sm:text-2xl">
                {hasil.code}
              </p>
              <div className="mt-2 flex justify-center">
                <CopyButton
                  value={hasil.code}
                  label={t.copy}
                  copiedLabel={t.copied}
                  failLabel={t.copyFail}
                  className="!bg-panel !px-3 !py-2 !text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setHasil(null)}>
                <Plus className="h-4 w-4" /> {t.again}
              </Button>
              <Button className="flex-1" onClick={tutup}>
                {t.done}
              </Button>
            </div>
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={hapus !== null}
        title={t.deleteTitle}
        message={t.deleteMsg}
        confirmLabel={t.deleteYes}
        tone="danger"
        busy={busyHapus}
        onConfirm={() => hapus && batalkan(hapus)}
        onCancel={() => setHapus(null)}
      />
    </div>
  );
}
