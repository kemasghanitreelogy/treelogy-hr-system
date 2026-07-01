"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarOff, Loader2, Plus, Trash2 } from "lucide-react";
import type { Holiday, Religion } from "@/lib/types";
import { cn, formatDate, monthLabel, witaToday } from "@/lib/utils";
import { useLocale } from "@/components/layout/locale-context";
import { apiErrorMessage } from "@/lib/api-error";
import type { Locale } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";

const RELIGIONS: Religion[] = ["islam", "kristen", "katolik", "hindu", "buddha", "konghucu"];
const RELIGION_LABEL: Record<Locale, Record<Religion, string>> = {
  id: { islam: "Islam", kristen: "Kristen", katolik: "Katolik", hindu: "Hindu", buddha: "Buddha", konghucu: "Konghucu" },
  en: { islam: "Islam", kristen: "Christian", katolik: "Catholic", hindu: "Hindu", buddha: "Buddhist", konghucu: "Confucian" },
};

type Mode = "month" | "year" | "range";

const STR: Record<Locale, {
  add: string; empty: string; publicBadge: string; religiousBadge: (r: string) => string;
  modeMonth: string; modeYear: string; modeRange: string; thisMonth: string;
  from: string; to: string; count: (n: number) => string;
  nameLabel: string; namePlaceholder: string; dateLabel: string; typeLabel: string;
  publicOpt: string; religiousOpt: string; religionLabel: string; cancel: string; save: string; sheetTitle: string;
  deleteTitle: (n: string) => string; deleteMsg: string; deleteConfirm: string;
  saved: string; deleted: string; saveFailed: string; deleteFailed: string; connection: string; nameRequired: string;
}> = {
  id: {
    add: "Tambah", empty: "Tidak ada hari libur pada periode ini.",
    publicBadge: "Nasional", religiousBadge: (r) => `Keagamaan · ${r}`,
    modeMonth: "Bulan", modeYear: "Tahun", modeRange: "Rentang", thisMonth: "Bulan ini",
    from: "Dari", to: "Sampai", count: (n) => `${n} hari libur`,
    nameLabel: "Nama", namePlaceholder: "cth. Hari Raya Nyepi", dateLabel: "Tanggal", typeLabel: "Jenis",
    publicOpt: "Nasional (semua)", religiousOpt: "Keagamaan (per agama)", religionLabel: "Agama",
    cancel: "Batal", save: "Simpan", sheetTitle: "Tambah Hari Libur",
    deleteTitle: (n) => `Hapus "${n}"?`, deleteMsg: "Tindakan ini tidak bisa dibatalkan.", deleteConfirm: "Ya, hapus",
    saved: "Hari libur ditambahkan ✓", deleted: "Hari libur dihapus ✓",
    saveFailed: "Gagal menyimpan. Pastikan Anda berhak.", deleteFailed: "Gagal menghapus.",
    connection: "Koneksi bermasalah. Coba lagi.", nameRequired: "Nama wajib diisi.",
  },
  en: {
    add: "Add", empty: "No holidays in this period.",
    publicBadge: "National", religiousBadge: (r) => `Religious · ${r}`,
    modeMonth: "Month", modeYear: "Year", modeRange: "Range", thisMonth: "This month",
    from: "From", to: "To", count: (n) => `${n} holiday${n === 1 ? "" : "s"}`,
    nameLabel: "Name", namePlaceholder: "e.g. Nyepi Day", dateLabel: "Date", typeLabel: "Type",
    publicOpt: "National (everyone)", religiousOpt: "Religious (per religion)", religionLabel: "Religion",
    cancel: "Cancel", save: "Save", sheetTitle: "Add Holiday",
    deleteTitle: (n) => `Delete "${n}"?`, deleteMsg: "This action cannot be undone.", deleteConfirm: "Yes, delete",
    saved: "Holiday added ✓", deleted: "Holiday deleted ✓",
    saveFailed: "Failed to save. Make sure you are authorized.", deleteFailed: "Failed to delete.",
    connection: "Connection problem. Try again.", nameRequired: "Name is required.",
  },
};

const MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function HolidaysView({ holidays, canManage }: { holidays: Holiday[]; canManage: boolean }) {
  const locale = useLocale();
  const t = STR[locale];
  const router = useRouter();
  const toast = useToast();

  const [list, setList] = useState(() => [...holidays].sort((a, b) => a.date.localeCompare(b.date)));
  // Default calendar to the current month/year in WITA (not the browser's tz).
  const witaTodayStr = witaToday(); // "YYYY-MM-DD"
  const curYear = Number(witaTodayStr.slice(0, 4));
  const curMonth = Number(witaTodayStr.slice(5, 7)); // 1-12
  const [mode, setMode] = useState<Mode>("month");
  const [month, setMonth] = useState(curMonth);
  const [year, setYear] = useState(curYear);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");

  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Holiday | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Year options: every year present in the data, plus the current year ±1.
  const years = useMemo(() => {
    const set = new Set<number>([curYear - 1, curYear, curYear + 1]);
    for (const h of list) set.add(Number(h.date.slice(0, 4)));
    return [...set].sort((a, b) => a - b);
  }, [list, curYear]);

  const filtered = useMemo(() => {
    if (mode === "month") {
      const prefix = `${year}-${String(month).padStart(2, "0")}`;
      return list.filter((h) => h.date.startsWith(prefix));
    }
    if (mode === "year") return list.filter((h) => h.date.startsWith(`${year}-`));
    // range — inclusive; if a bound is empty, treat as open-ended
    return list.filter((h) => (!rangeFrom || h.date >= rangeFrom) && (!rangeTo || h.date <= rangeTo));
  }, [list, mode, month, year, rangeFrom, rangeTo]);

  // Group by month for an agenda-style layout.
  const groups = useMemo(() => {
    const map = new Map<string, Holiday[]>();
    for (const h of filtered) {
      const key = h.date.slice(0, 7); // YYYY-MM
      (map.get(key) ?? map.set(key, []).get(key)!).push(h);
    }
    return [...map.entries()];
  }, [filtered]);

  async function remove() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const res = await fetch("/api/holidays", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: deleting.id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { toast.error(apiErrorMessage(data?.error, locale, res.status)); return; }
      setList((cur) => cur.filter((h) => h.id !== deleting.id));
      toast.success(t.deleted);
      router.refresh();
    } catch { toast.error(t.connection); } finally { setDeleteBusy(false); setDeleting(null); }
  }

  const MONTHS = locale === "en" ? MONTHS_EN : MONTHS_ID;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="rounded-2xl border border-line bg-panel p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl border border-line bg-cream/50 p-0.5">
            {(["month", "year", "range"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  mode === m ? "bg-panel text-ink shadow-sm" : "text-muted hover:text-ink",
                )}
              >
                {m === "month" ? t.modeMonth : m === "year" ? t.modeYear : t.modeRange}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {mode === "month" && (
              <>
                <button
                  onClick={() => { setMonth(curMonth); setYear(curYear); }}
                  className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-muted hover:text-ink"
                >
                  {t.thisMonth}
                </button>
                <Select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-36">
                  {MONTHS.map((mo, i) => <option key={mo} value={i + 1}>{mo}</option>)}
                </Select>
                <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28">
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </Select>
              </>
            )}
            {mode === "year" && (
              <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28">
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </Select>
            )}
            {mode === "range" && (
              <>
                <Field label={t.from} className="!mb-0">
                  <Input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className="w-40" />
                </Field>
                <Field label={t.to} className="!mb-0">
                  <Input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className="w-40" />
                </Field>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">{t.count(filtered.length)}</p>
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> {t.add}
          </Button>
        )}
      </div>

      {/* Agenda list grouped by month */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-cream/40 px-5 py-12 text-center">
          <CalendarOff className="mx-auto h-8 w-8 text-faint" />
          <p className="mt-2 text-sm text-faint">{t.empty}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([key, items]) => (
            <div key={key}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">{monthLabel(key, locale)}</h3>
              <div className="overflow-hidden rounded-2xl border border-line bg-panel divide-y divide-line">
                {items.map((h) => (
                  <div key={h.id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
                    <DateChip date={h.date} locale={locale} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{h.name}</p>
                      <p className="text-xs text-muted">{formatDate(h.date, "long", locale)}</p>
                    </div>
                    <Badge tone={h.type === "public" ? "sky" : "matcha"} className="shrink-0">
                      {h.type === "public" ? t.publicBadge : t.religiousBadge(h.religion ? RELIGION_LABEL[locale][h.religion] : "")}
                    </Badge>
                    {canManage && (
                      <button onClick={() => setDeleting(h)} className="shrink-0 cursor-pointer rounded-lg p-1.5 text-faint transition-colors hover:bg-clay-soft hover:text-[#8c3c1f]" aria-label="Hapus">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title={t.sheetTitle}>
        <HolidayForm
          onSaved={(h) => { setList((cur) => [...cur, h].sort((a, b) => a.date.localeCompare(b.date))); setAdding(false); toast.success(t.saved); router.refresh(); }}
          onCancel={() => setAdding(false)}
        />
      </Sheet>

      <ConfirmDialog open={deleting !== null} title={t.deleteTitle(deleting?.name ?? "")} message={t.deleteMsg} confirmLabel={t.deleteConfirm} tone="danger" busy={deleteBusy} onConfirm={remove} onCancel={() => setDeleting(null)} />
    </div>
  );
}

function DateChip({ date, locale }: { date: string; locale: Locale }) {
  const d = new Date(date + "T00:00:00");
  const day = d.getDate();
  const dow = (locale === "en"
    ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    : ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"])[d.getDay()];
  return (
    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-cream/70 text-center">
      <span className="text-base font-bold leading-none text-ink tabular-nums">{day}</span>
      <span className="mt-0.5 text-[10px] font-medium uppercase text-faint">{dow}</span>
    </div>
  );
}

function HolidayForm({ onSaved, onCancel }: { onSaved: (h: Holiday) => void; onCancel: () => void }) {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ date: "", name: "", type: "public" as Holiday["type"], religion: "hindu" as Religion });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.date) return;
    if (!form.name.trim()) return toast.error(t.nameRequired);
    setSaving(true);
    try {
      const res = await fetch("/api/holidays", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: form.date, name: form.name, type: form.type, religion: form.type === "religious" ? form.religion : null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.holiday) { toast.error(apiErrorMessage(data?.error, locale, res.status)); return; }
      onSaved(data.holiday as Holiday);
    } catch { toast.error(t.connection); } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t.nameLabel}><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t.namePlaceholder} required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.dateLabel}><Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required /></Field>
        <Field label={t.typeLabel}>
          <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as Holiday["type"] }))}>
            <option value="public">{t.publicOpt}</option>
            <option value="religious">{t.religiousOpt}</option>
          </Select>
        </Field>
      </div>
      {form.type === "religious" && (
        <Field label={t.religionLabel}>
          <Select value={form.religion} onChange={(e) => setForm((f) => ({ ...f, religion: e.target.value as Religion }))}>
            {RELIGIONS.map((rg) => <option key={rg} value={rg}>{RELIGION_LABEL[locale][rg]}</option>)}
          </Select>
        </Field>
      )}
      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>{t.cancel}</Button>
        <Button type="submit" className="flex-1" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}{t.save}</Button>
      </div>
    </form>
  );
}
