"use client";

import { useMemo, useState } from "react";
import { CalendarRange, Download, Layers, Loader2 } from "lucide-react";
import type { TravelRequest } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { cn, formatDate, rupiah } from "@/lib/utils";
import { exportTravelXlsx, filterByRange } from "@/lib/travel-xlsx";
import { useLocale } from "@/components/layout/locale-context";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { TravelEmployee } from "./travel-view";

type Mode = "all" | "range";

const STR: Record<
  Locale,
  {
    intro: string;
    modeAll: string; modeAllHint: string;
    modeRange: string; modeRangeHint: string;
    from: string; to: string;
    quick: string; thisMonth: string; lastMonth: string; thisYear: string;
    preview: string;
    rows: (n: number) => string;
    noRows: string;
    breakdown: (a: number, b: number, c: number) => string;
    value: string;
    download: string; working: string; cancel: string;
    empty: string; failed: string; done: (n: number) => string;
    rangeInvalid: string;
  }
> = {
  id: {
    intro: "File Excel (.xlsx) berisi sheet rincian per pengajuan dan sheet ringkasan per status & per karyawan.",
    modeAll: "Semua data", modeAllHint: "Seluruh pengajuan yang bisa Anda lihat",
    modeRange: "Rentang tanggal", modeRangeHint: "Disaring menurut tanggal berangkat",
    from: "Dari tanggal", to: "Sampai tanggal",
    quick: "Pintasan", thisMonth: "Bulan ini", lastMonth: "Bulan lalu", thisYear: "Tahun ini",
    preview: "Yang akan diekspor",
    rows: (n) => `${n} pengajuan`,
    noRows: "Tidak ada pengajuan pada rentang ini.",
    breakdown: (a, b, c) => `${a} menunggu · ${b} disetujui · ${c} ditolak`,
    value: "Total estimasi",
    download: "Unduh Excel", working: "Menyiapkan…", cancel: "Batal",
    empty: "Tidak ada data untuk diekspor.", failed: "Gagal membuat file Excel.",
    done: (n) => `${n} pengajuan diekspor ✓`,
    rangeInvalid: "Tanggal akhir tidak boleh mendahului tanggal awal.",
  },
  en: {
    intro: "The Excel (.xlsx) file has a detail sheet per request plus a summary by status and by employee.",
    modeAll: "All data", modeAllHint: "Every request you can see",
    modeRange: "Date range", modeRangeHint: "Filtered by departure date",
    from: "From date", to: "To date",
    quick: "Shortcuts", thisMonth: "This month", lastMonth: "Last month", thisYear: "This year",
    preview: "What will be exported",
    rows: (n) => `${n} requests`,
    noRows: "No requests in this range.",
    breakdown: (a, b, c) => `${a} pending · ${b} approved · ${c} rejected`,
    value: "Estimated total",
    download: "Download Excel", working: "Preparing…", cancel: "Cancel",
    empty: "No data to export.", failed: "Failed to build the Excel file.",
    done: (n) => `${n} requests exported ✓`,
    rangeInvalid: "The end date cannot precede the start date.",
  },
};

/** Awal & akhir bulan dari sebuah tanggal (YYYY-MM-DD), aman lintas tahun. */
function monthBounds(year: number, month: number): [string, string] {
  const p = (n: number) => String(n).padStart(2, "0");
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return [`${year}-${p(month)}-01`, `${year}-${p(month)}-${p(last)}`];
}

export function TravelExport({
  requests,
  employees,
  today,
  onClose,
}: {
  requests: TravelRequest[];
  employees: TravelEmployee[];
  today: string;
  onClose: () => void;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();

  const [mode, setMode] = useState<Mode>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);

  const rangeInvalid = mode === "range" && !!from && !!to && to < from;

  // Pratinjau memakai penyaring yang SAMA dengan yang dipakai saat menulis file,
  // jadi angka di sini tidak mungkin berbeda dengan isi berkasnya.
  const terpilih = useMemo(() => {
    if (mode === "all") return requests;
    if (rangeInvalid) return [];
    return filterByRange(requests, from || null, to || null);
  }, [requests, mode, from, to, rangeInvalid]);

  const ringkas = useMemo(
    () => ({
      pending: terpilih.filter((r) => r.status === "pending").length,
      approved: terpilih.filter((r) => r.status === "approved").length,
      rejected: terpilih.filter((r) => r.status === "rejected").length,
      total: terpilih.reduce((s, r) => s + r.costTotal, 0),
    }),
    [terpilih],
  );

  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const pintasan: [string, () => void][] = [
    [t.thisMonth, () => { const [a, b] = monthBounds(y, m); setFrom(a); setTo(b); }],
    [t.lastMonth, () => {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      const [a, b] = monthBounds(py, pm); setFrom(a); setTo(b);
    }],
    [t.thisYear, () => { setFrom(`${y}-01-01`); setTo(`${y}-12-31`); }],
  ];

  async function unduh() {
    if (rangeInvalid) { toast.error(t.rangeInvalid); return; }
    setBusy(true);
    try {
      const n = await exportTravelXlsx({
        requests,
        employees,
        from: mode === "all" ? null : from || null,
        to: mode === "all" ? null : to || null,
        locale,
      });
      if (n === 0) { toast.error(t.empty); return; }
      toast.success(t.done(n));
      onClose();
    } catch {
      toast.error(t.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-line bg-cream/60 px-3 py-2.5 text-xs leading-relaxed text-muted">
        {t.intro}
      </p>

      {/* Pilihan cakupan — dua kartu besar, jelas mana yang aktif */}
      <div className="grid grid-cols-2 gap-2">
        {([
          ["all", Layers, t.modeAll, t.modeAllHint],
          ["range", CalendarRange, t.modeRange, t.modeRangeHint],
        ] as const).map(([id, Icon, judul, hint]) => (
          <button
            key={id}
            type="button"
            aria-pressed={mode === id}
            onClick={() => setMode(id)}
            className={cn(
              "cursor-pointer rounded-2xl border p-3 text-left transition-colors",
              mode === id
                ? "border-forest-400 bg-forest-50 ring-1 ring-forest-200"
                : "border-line bg-panel hover:bg-cream/60",
            )}
          >
            <Icon className={cn("h-4 w-4", mode === id ? "text-forest-600" : "text-faint")} />
            <p className={cn("mt-1.5 text-sm font-semibold", mode === id ? "text-forest-700" : "text-ink")}>
              {judul}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted">{hint}</p>
          </button>
        ))}
      </div>

      {mode === "range" && (
        <div className="space-y-3 rounded-2xl border border-line bg-cream/40 p-3">
          <div>
            <p className="mb-1.5 text-xs font-medium text-faint">{t.quick}</p>
            <div className="flex flex-wrap gap-1.5">
              {pintasan.map(([label, aksi]) => (
                <button
                  key={label}
                  type="button"
                  onClick={aksi}
                  className="cursor-pointer rounded-lg border border-line bg-panel px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-forest-300 hover:text-ink"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.from}>
              <Input type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label={t.to}>
              <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          {rangeInvalid && <p className="text-xs font-medium text-clay">{t.rangeInvalid}</p>}
        </div>
      )}

      {/* Pratinjau: berapa baris & berapa nilainya, sebelum berkas dibuat */}
      <div className="rounded-2xl border border-line bg-panel p-3.5">
        <p className="text-xs font-medium text-faint">{t.preview}</p>
        {terpilih.length === 0 ? (
          <p className="mt-1 text-sm text-clay">{t.noRows}</p>
        ) : (
          <>
            <p key={terpilih.length} className="animate-count-up mt-0.5 font-display text-xl font-bold text-ink tabular-nums">
              {t.rows(terpilih.length)}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {t.breakdown(ringkas.pending, ringkas.approved, ringkas.rejected)}
            </p>
            <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
              <span className="text-xs text-muted">{t.value}</span>
              <span className="text-sm font-semibold text-ink tabular-nums">{rupiah(ringkas.total)}</span>
            </div>
            {mode === "range" && from && to && (
              <p className="mt-1.5 text-[11px] text-faint">
                {formatDate(from, "long", locale)} — {formatDate(to, "long", locale)}
              </p>
            )}
          </>
        )}
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={busy}>
          {t.cancel}
        </Button>
        <Button className="flex-1" onClick={unduh} disabled={busy || terpilih.length === 0}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {busy ? t.working : t.download}
        </Button>
      </div>
    </div>
  );
}
