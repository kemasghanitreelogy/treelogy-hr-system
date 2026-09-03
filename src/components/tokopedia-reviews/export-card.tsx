"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ClipboardCopy, FileDown, FileSpreadsheet, ImageOff, Info, Loader2, TriangleAlert, Undo2,
} from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { fotoTidakTerbawa, hasBody, namedCount, picturesExpired, type NameStyle } from "@/lib/tokopedia/judgeme";
import { buildJudgeMeTsv } from "@/lib/tokopedia/judgeme";
import { exportJudgeMeCsv, exportReviewsXlsx, exportSkippedCsv, jumlahBerkasEkspor } from "@/lib/tokopedia/judgeme-export";
import type { TokopediaReview } from "@/lib/tokopedia/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { STR } from "./strings";

type Scope = "new" | "all";

/** Satu tombol pilihan bergaya segmented — dipakai untuk cakupan & gaya nama. */
function Segment<T extends string>({
  value, options, onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-line bg-panel p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "cursor-pointer rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors",
            value === o.value ? "bg-forest-600 text-cream shadow-sm" : "text-muted hover:bg-sand/60 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ExportCard({
  locale,
  reviews,
  onMarkExported,
  onUnmark,
  marking,
}: {
  locale: Locale;
  reviews: TokopediaReview[];
  onMarkExported: (ids: string[]) => Promise<void>;
  onUnmark: (ids: string[]) => Promise<void>;
  marking: boolean;
}) {
  const t = STR[locale];
  const toast = useToast();

  const [scope, setScope] = useState<Scope>("new");
  const [nameStyle, setNameStyle] = useState<NameStyle>("respect");
  const [busyXlsx, setBusyXlsx] = useState(false);
  /** ID yang baru saja ditandai — supaya penandaannya bisa dibatalkan. */
  const [justMarked, setJustMarked] = useState<string[]>([]);

  const pool = useMemo(
    () => (scope === "new" ? reviews.filter((r) => !r.exportedAt) : reviews),
    [reviews, scope],
  );
  const importable = useMemo(() => pool.filter(hasBody), [pool]);
  const starOnly = useMemo(() => pool.filter((r) => !hasBody(r)), [pool]);

  // Foto: yang penting bukan berapa yang punya foto, tapi berapa yang tautannya
  // masih hidup PADA SAAT INI — itulah yang akan benar-benar terunduh Judge.me.
  const withPhotos = useMemo(() => importable.filter((r) => r.pictureUrls.length > 0), [importable]);

  // Tautan foto mati sendiri seiring waktu, tanpa ada yang berubah di layar.
  // Tanpa detak ini, halaman yang dibiarkan terbuka akan terus meyakinkan
  // orang bahwa fotonya masih hidup sampai detik ia menekan unduh.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (!withPhotos.length) return;
    const id = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [withPhotos.length]);

  const deadPhotos = useMemo(
    () => withPhotos.filter((r) => picturesExpired(r, new Date(clock))),
    [withPhotos, clock],
  );

  async function afterExport(rows: TokopediaReview[]) {
    toast.success(t.exported);
    const ids = rows.filter((r) => !r.exportedAt).map((r) => r.feedbackId);
    if (!ids.length) return;
    await onMarkExported(ids);
    setJustMarked(ids);
  }

  function guard(): boolean {
    if (importable.length) return true;
    toast.error(t.nothingToExport);
    return false;
  }

  async function doCsv() {
    if (!guard()) return;
    const berkas = jumlahBerkasEkspor(importable);
    // Beberapa unduhan beruntun mudah disalahpahami browser sebagai gangguan,
    // jadi jumlahnya disebut LEBIH DULU — supaya yang muncul kemudian terbaca
    // sebagai hal yang diharapkan, bukan kejanggalan.
    if (berkas > 1) toast.success(t.filesComing.replace("{n}", String(berkas)));
    await exportJudgeMeCsv(importable, nameStyle);
    await afterExport(importable);
  }

  async function doXlsx() {
    if (!guard()) return;
    setBusyXlsx(true);
    try {
      await exportReviewsXlsx(importable, nameStyle, locale);
      // Excel adalah salinan untuk DIPERIKSA, bukan yang diunggah ke Judge.me —
      // jadi ia sengaja tidak menandai apa pun sebagai terekspor.
      toast.success(t.exported);
    } catch {
      toast.error(t.xlsxFailed);
    } finally {
      setBusyXlsx(false);
    }
  }

  async function doCopy() {
    if (!guard()) return;
    try {
      await navigator.clipboard.writeText(buildJudgeMeTsv(importable, nameStyle));
      toast.success(t.copied);
      await afterExport(importable);
    } catch {
      toast.error(t.copyFailed);
    }
  }

  function doSkipped() {
    if (!starOnly.length) {
      toast.error(t.nothingToExport);
      return;
    }
    exportSkippedCsv(starOnly, nameStyle);
    toast.success(t.exported);
  }

  return (
    <section className="card p-4 sm:p-5">
      <h2 className="font-display text-base font-semibold text-ink sm:text-lg">{t.exportTitle}</h2>
      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">{t.exportLead}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-ink">{t.scope}</p>
          <div className="mt-1.5">
            <Segment
              value={scope}
              onChange={setScope}
              options={[
                { value: "new", label: `${t.scopeNew} (${reviews.filter((r) => !r.exportedAt).length})` },
                { value: "all", label: `${t.scopeAll} (${reviews.length})` },
              ]}
            />
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-ink">{t.nameStyle}</p>
          <div className="mt-1.5">
            <Segment
              value={nameStyle}
              onChange={setNameStyle}
              options={[
                { value: "respect", label: t.nameRespect },
                { value: "masked", label: t.nameMasked },
                { value: "anonymous", label: t.nameAnon },
              ]}
            />
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
            {nameStyle === "respect" ? t.nameRespectHint : nameStyle === "masked" ? t.nameMaskedHint : t.nameAnonHint}
          </p>
          {/* Angka nyata, bukan penjelasan saja — bedanya antar-pilihan baru
              terasa kalau terlihat berapa baris yang benar-benar bernama. */}
          <p className="mt-1 text-[11px] tabular-nums text-muted">
            <span className="font-semibold text-ink">{namedCount(importable, nameStyle)}</span>
            {" / "}
            {importable.length} {t.namedPreview}
          </p>
        </div>
      </div>

      {/* Mengekspor SEMUA adalah tindakan yang bisa menggandakan review di toko
          dan Judge.me tidak punya dedup — peringatannya harus keras, bukan halus. */}
      {scope === "all" && (
        <div className="mt-3 flex gap-2.5 rounded-xl border border-[#e6c9bd] bg-clay-soft px-3 py-2.5">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-clay" />
          <p className="text-[11px] leading-relaxed font-medium text-[#8c3c1f]">{t.scopeAllWarn}</p>
        </div>
      )}

      {/* Foto yang belum disalin ke penyimpanan sendiri TIDAK ikut CSV —
          lebih baik kosong daripada tautan mati yang membuat import terlihat
          berhasil padahal fotonya hilang. Yang hilang harus disebut, dan
          disebut bersama cara memulihkannya. */}
      {fotoTidakTerbawa(importable) > 0 && (
        <div className="mb-3 rounded-xl border border-[#e6c9bd] bg-clay-soft px-3 py-2.5 text-xs leading-relaxed text-[#8c3c1f]">
          <span className="font-semibold">
            {t.photoDropped.replace("{n}", String(fotoTidakTerbawa(importable)))}
          </span>{" "}
          {t.photoDroppedHint}
        </div>
      )}

      {withPhotos.length > 0 && (
        <div
          className={cn(
            "mt-3 flex gap-2.5 rounded-xl border px-3 py-2.5",
            deadPhotos.length ? "border-[#e8d9a8] bg-gold-soft" : "border-line bg-sand/50",
          )}
        >
          {deadPhotos.length ? (
            <ImageOff className="mt-0.5 h-4 w-4 shrink-0 text-[#8a6512]" />
          ) : (
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-faint" />
          )}
          <div className="min-w-0">
            <p className={cn("text-xs font-semibold", deadPhotos.length ? "text-[#8a6512]" : "text-ink")}>
              {t.photoTitle}
            </p>
            <p
              className={cn(
                "mt-0.5 text-[11px] leading-relaxed",
                deadPhotos.length ? "text-[#8a6512]/85" : "text-muted",
              )}
            >
              {t.photoBody} <span className="font-semibold">{t.photoAct}</span>
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge tone={deadPhotos.length ? "gold" : "matcha"}>
                {withPhotos.length - deadPhotos.length} {t.photoLive}
              </Badge>
              {deadPhotos.length > 0 && (
                <>
                  <Badge tone="clay">
                    {deadPhotos.length} {t.photoDead}
                  </Badge>
                  <span className="text-[11px] text-[#8a6512]">{t.photoRepull}</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button onClick={doCsv} disabled={!importable.length || marking} className="sm:w-auto">
          <FileDown className="h-4 w-4" />
          {t.csv} ({importable.length})
        </Button>
        <Button variant="outline" onClick={doCopy} disabled={!importable.length || marking}>
          <ClipboardCopy className="h-4 w-4" />
          {t.copySheet}
        </Button>
        <Button variant="outline" onClick={doXlsx} disabled={!importable.length || busyXlsx}>
          {busyXlsx ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
          {t.xlsx}
        </Button>
        {starOnly.length > 0 && (
          <Button variant="ghost" onClick={doSkipped}>
            <FileDown className="h-4 w-4" />
            {t.skipped} ({starOnly.length})
          </Button>
        )}
      </div>

      {/* Jalan pulang. Tanpa ini, satu unduhan percobaan menyembunyikan review
          itu selamanya dari daftar "belum diekspor". */}
      {justMarked.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-sand/60 px-3 py-2">
          <p className="text-[11px] text-muted">
            <span className="font-semibold text-ink">{justMarked.length}</span> {t.markedTitle}.{" "}
            <span className="text-faint">{t.unmarkHint}</span>
          </p>
          <button
            type="button"
            disabled={marking}
            onClick={async () => {
              await onUnmark(justMarked);
              setJustMarked([]);
              toast.success(t.unmarked);
            }}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-forest-700 transition-colors hover:bg-forest-50 disabled:opacity-50"
          >
            <Undo2 className="h-3 w-3" /> {t.unmark}
          </button>
        </div>
      )}
    </section>
  );
}
