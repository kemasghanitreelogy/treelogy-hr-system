"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileSignature, Loader2, Plus, Trash2 } from "lucide-react";
import type { EmployeeContract } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { useLocale } from "@/components/layout/locale-context";
import type { Locale } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";

type CType = EmployeeContract["type"];
const TYPES: CType[] = ["probation", "pkwt", "pkwtt", "magang", "harian"];
const TYPE_LABEL: Record<Locale, Record<CType, string>> = {
  id: { probation: "Masa percobaan", pkwt: "PKWT (kontrak)", pkwtt: "PKWTT (tetap)", magang: "Magang", harian: "Harian" },
  en: { probation: "Probation", pkwt: "Fixed-term (PKWT)", pkwtt: "Permanent (PKWTT)", magang: "Internship", harian: "Daily" },
};

const STR: Record<Locale, {
  title: string; empty: string; add: string; ongoing: string; active: string; ended: string;
  typeLabel: string; startLabel: string; endLabel: string; endHint: string; noteLabel: string; statusLabel: string;
  cancel: string; save: string; sheetTitle: string; saved: string; deleted: string; saveFailed: string;
  deleteFailed: string; connection: string;
}> = {
  id: {
    title: "Riwayat Kontrak", empty: "Belum ada kontrak.", add: "Tambah kontrak", ongoing: "Berlangsung",
    active: "Aktif", ended: "Berakhir", typeLabel: "Jenis kontrak", startLabel: "Mulai", endLabel: "Berakhir",
    endHint: "Kosongkan jika berkelanjutan (tetap).", noteLabel: "Catatan", statusLabel: "Status",
    cancel: "Batal", save: "Simpan", sheetTitle: "Tambah Kontrak", saved: "Kontrak ditambahkan ✓", deleted: "Kontrak dihapus ✓",
    saveFailed: "Gagal menyimpan. Pastikan Anda HR/admin.", deleteFailed: "Gagal menghapus.", connection: "Koneksi bermasalah. Coba lagi.",
  },
  en: {
    title: "Contract History", empty: "No contracts yet.", add: "Add contract", ongoing: "Ongoing",
    active: "Active", ended: "Ended", typeLabel: "Contract type", startLabel: "Start", endLabel: "End",
    endHint: "Leave empty if ongoing (permanent).", noteLabel: "Note", statusLabel: "Status",
    cancel: "Cancel", save: "Save", sheetTitle: "Add Contract", saved: "Contract added ✓", deleted: "Contract deleted ✓",
    saveFailed: "Failed to save. Make sure you are HR/admin.", deleteFailed: "Failed to delete.", connection: "Connection problem. Try again.",
  },
};

export function ContractsCard({ employeeId, contracts, canManage }: { employeeId: string; contracts: EmployeeContract[]; canManage: boolean }) {
  const locale = useLocale();
  const t = STR[locale];
  const router = useRouter();
  const toast = useToast();
  const [list, setList] = useState(contracts);
  const [adding, setAdding] = useState(false);

  async function remove(id: string) {
    const prev = list;
    setList((cur) => cur.filter((c) => c.id !== id));
    try {
      const res = await fetch("/api/contracts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { setList(prev); toast.error(t.deleteFailed); return; }
      toast.success(t.deleted);
      router.refresh();
    } catch { setList(prev); toast.error(t.connection); }
  }

  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <FileSignature className="h-4 w-4 text-forest-600" /> {t.title}
        </h3>
        {canManage && (
          <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-xs font-medium text-sky hover:underline">
            <Plus className="h-3.5 w-3.5" /> {t.add}
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <p className="mt-3 text-sm text-faint">{t.empty}</p>
      ) : (
        <ol className="mt-3 space-y-2.5">
          {list.map((c) => (
            <li key={c.id} className="flex items-start gap-3 border-l-2 border-line pl-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">{TYPE_LABEL[locale][c.type]}</span>
                  <Badge tone={c.status === "active" ? "matcha" : "neutral"}>{c.status === "active" ? t.active : t.ended}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {formatDate(c.startDate, "short", locale)} – {c.endDate ? formatDate(c.endDate, "short", locale) : t.ongoing}
                </p>
                {c.note && <p className="mt-0.5 text-xs text-faint">{c.note}</p>}
              </div>
              {canManage && (
                <button onClick={() => remove(c.id)} className="shrink-0 cursor-pointer rounded-lg p-1 text-faint transition-colors hover:text-[#8c3c1f]" aria-label="Hapus">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title={t.sheetTitle}>
        <ContractForm
          employeeId={employeeId}
          onSaved={(c) => { setList((cur) => [c, ...cur]); setAdding(false); toast.success(t.saved); router.refresh(); }}
          onCancel={() => setAdding(false)}
        />
      </Sheet>
    </div>
  );
}

function ContractForm({ employeeId, onSaved, onCancel }: { employeeId: string; onSaved: (c: EmployeeContract) => void; onCancel: () => void }) {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ type: "pkwt" as CType, startDate: "", endDate: "", status: "active" as EmployeeContract["status"], note: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.startDate) return;
    setSaving(true);
    try {
      const res = await fetch("/api/contracts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, type: form.type, startDate: form.startDate, endDate: form.endDate || null, status: form.status, note: form.note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.contract) { toast.error(t.saveFailed); return; }
      onSaved(data.contract as EmployeeContract);
    } catch { toast.error(t.connection); } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t.typeLabel}>
        <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as CType }))}>
          {TYPES.map((ty) => <option key={ty} value={ty}>{TYPE_LABEL[locale][ty]}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.startLabel}><Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} required /></Field>
        <Field label={t.endLabel} hint={t.endHint}><Input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} /></Field>
      </div>
      <Field label={t.statusLabel}>
        <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as EmployeeContract["status"] }))}>
          <option value="active">{t.active}</option>
          <option value="ended">{t.ended}</option>
        </Select>
      </Field>
      <Field label={t.noteLabel}><Textarea value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} /></Field>
      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>{t.cancel}</Button>
        <Button type="submit" className="flex-1" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}{t.save}</Button>
      </div>
    </form>
  );
}
