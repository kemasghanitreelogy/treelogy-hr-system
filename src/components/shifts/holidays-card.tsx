"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarOff, Loader2, Plus, Trash2 } from "lucide-react";
import type { Holiday, Religion } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { useLocale } from "@/components/layout/locale-context";
import type { Locale } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";

const RELIGIONS: Religion[] = ["islam", "kristen", "katolik", "hindu", "buddha", "konghucu"];
const RELIGION_LABEL: Record<Locale, Record<Religion, string>> = {
  id: { islam: "Islam", kristen: "Kristen", katolik: "Katolik", hindu: "Hindu", buddha: "Buddha", konghucu: "Konghucu" },
  en: { islam: "Islam", kristen: "Christian", katolik: "Catholic", hindu: "Hindu", buddha: "Buddhist", konghucu: "Confucian" },
};

const STR: Record<Locale, {
  title: string; desc: string; add: string; empty: string; nameLabel: string; namePlaceholder: string;
  dateLabel: string; typeLabel: string; publicOpt: string; religiousOpt: string; religionLabel: string;
  publicBadge: string; religiousBadge: (r: string) => string; cancel: string; save: string; sheetTitle: string;
  deleteTitle: (n: string) => string; deleteMsg: string; deleteConfirm: string; saved: string; deleted: string;
  saveFailed: string; deleteFailed: string; connection: string; nameRequired: string;
}> = {
  id: {
    title: "Hari Libur", desc: "Libur nasional (semua off) & keagamaan (hanya seagama off).",
    add: "Tambah", empty: "Belum ada hari libur.", nameLabel: "Nama", namePlaceholder: "cth. Hari Raya Nyepi",
    dateLabel: "Tanggal", typeLabel: "Jenis", publicOpt: "Nasional (semua)", religiousOpt: "Keagamaan (per agama)",
    religionLabel: "Agama", publicBadge: "Nasional", religiousBadge: (r) => `Keagamaan · ${r}`,
    cancel: "Batal", save: "Simpan", sheetTitle: "Tambah Hari Libur",
    deleteTitle: (n) => `Hapus "${n}"?`, deleteMsg: "Tindakan ini tidak bisa dibatalkan.", deleteConfirm: "Ya, hapus",
    saved: "Hari libur ditambahkan ✓", deleted: "Hari libur dihapus ✓",
    saveFailed: "Gagal menyimpan. Pastikan Anda berhak.", deleteFailed: "Gagal menghapus.", connection: "Koneksi bermasalah. Coba lagi.",
    nameRequired: "Nama wajib diisi.",
  },
  en: {
    title: "Holidays", desc: "Public holidays (everyone off) & religious (only same-religion off).",
    add: "Add", empty: "No holidays yet.", nameLabel: "Name", namePlaceholder: "e.g. Nyepi Day",
    dateLabel: "Date", typeLabel: "Type", publicOpt: "Public (everyone)", religiousOpt: "Religious (per religion)",
    religionLabel: "Religion", publicBadge: "Public", religiousBadge: (r) => `Religious · ${r}`,
    cancel: "Cancel", save: "Save", sheetTitle: "Add Holiday",
    deleteTitle: (n) => `Delete "${n}"?`, deleteMsg: "This action cannot be undone.", deleteConfirm: "Yes, delete",
    saved: "Holiday added ✓", deleted: "Holiday deleted ✓",
    saveFailed: "Failed to save. Make sure you are authorized.", deleteFailed: "Failed to delete.", connection: "Connection problem. Try again.",
    nameRequired: "Name is required.",
  },
};

export function HolidaysCard({ holidays }: { holidays: Holiday[] }) {
  const locale = useLocale();
  const t = STR[locale];
  const router = useRouter();
  const toast = useToast();
  const [list, setList] = useState(holidays);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Holiday | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function remove() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const res = await fetch("/api/holidays", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: deleting.id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { toast.error(t.deleteFailed); return; }
      setList((cur) => cur.filter((h) => h.id !== deleting.id));
      toast.success(t.deleted);
      router.refresh();
    } catch { toast.error(t.connection); } finally { setDeleteBusy(false); setDeleting(null); }
  }

  return (
    <Card>
      <CardHeader className="flex-wrap">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-clay-soft text-[#8c3c1f]"><CalendarOff className="h-4 w-4" /></span>
          <div><CardTitle>{t.title}</CardTitle><p className="mt-0.5 text-sm text-muted">{t.desc}</p></div>
        </div>
        <Button size="sm" variant="outline" className="shrink-0" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t.add}</Button>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-cream/40 px-5 py-8 text-center text-sm text-faint">{t.empty}</div>
        ) : (
          <div className="divide-y divide-line">
            {list.map((h) => (
              <div key={h.id} className="flex items-center gap-3 py-2.5">
                <div className="w-24 shrink-0 text-sm font-medium tabular-nums text-ink">{formatDate(h.date, "short", locale)}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{h.name}</p>
                </div>
                <Badge tone={h.type === "public" ? "sky" : "matcha"}>
                  {h.type === "public" ? t.publicBadge : t.religiousBadge(h.religion ? RELIGION_LABEL[locale][h.religion] : "")}
                </Badge>
                <button onClick={() => setDeleting(h)} className="shrink-0 cursor-pointer rounded-lg p-1.5 text-faint transition-colors hover:bg-clay-soft hover:text-[#8c3c1f]" aria-label="Hapus">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Sheet open={adding} onClose={() => setAdding(false)} title={t.sheetTitle}>
        <HolidayForm
          onSaved={(h) => { setList((cur) => [...cur, h].sort((a, b) => a.date.localeCompare(b.date))); setAdding(false); toast.success(t.saved); router.refresh(); }}
          onCancel={() => setAdding(false)}
        />
      </Sheet>

      <ConfirmDialog open={deleting !== null} title={t.deleteTitle(deleting?.name ?? "")} message={t.deleteMsg} confirmLabel={t.deleteConfirm} tone="danger" busy={deleteBusy} onConfirm={remove} onCancel={() => setDeleting(null)} />
    </Card>
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
      if (!res.ok || !data.holiday) { toast.error(t.saveFailed); return; }
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
      <div className={cn("flex gap-2 pt-2")}>
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>{t.cancel}</Button>
        <Button type="submit" className="flex-1" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}{t.save}</Button>
      </div>
    </form>
  );
}
