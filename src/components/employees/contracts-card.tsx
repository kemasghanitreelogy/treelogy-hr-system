"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, FileSignature, FileText, Loader2, Plus, Trash2, Upload } from "lucide-react";
import type { EmployeeContract } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { prepareFileForBucket } from "@/lib/upload";
import { apiErrorMessage } from "@/lib/api-error";
import { useLocale } from "@/components/layout/locale-context";
import type { Locale } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";

type CType = EmployeeContract["type"];
const TYPES: CType[] = ["probation", "pkwt", "pkwtt", "parttime", "magang", "harian"];
const TYPE_LABEL: Record<Locale, Record<CType, string>> = {
  id: { probation: "Masa percobaan", pkwt: "PKWT (kontrak)", pkwtt: "PKWTT (tetap)", parttime: "Part Time", magang: "Magang", harian: "Harian" },
  en: { probation: "Probation", pkwt: "Fixed-term (PKWT)", pkwtt: "Permanent (PKWTT)", parttime: "Part-time", magang: "Internship", harian: "Daily" },
};

const STR: Record<Locale, {
  title: string; empty: string; add: string; ongoing: string; active: string; ended: string;
  typeLabel: string; startLabel: string; endLabel: string; endHint: string; noteLabel: string; statusLabel: string;
  docLabel: string; docHint: string; viewDoc: string; currentDoc: string; replaceDoc: string; noDoc: string; noNote: string;
  cancel: string; save: string; addTitle: string; editTitle: string; detailTitle: string;
  saved: string; updated: string; deleted: string; saveFailed: string; deleteFailed: string; connection: string; delete: string;
}> = {
  id: {
    title: "Riwayat Kontrak", empty: "Belum ada kontrak.", add: "Tambah kontrak", ongoing: "Berlangsung",
    active: "Aktif", ended: "Berakhir", typeLabel: "Jenis kontrak", startLabel: "Mulai", endLabel: "Berakhir",
    endHint: "Kosongkan jika berkelanjutan (tetap).", noteLabel: "Catatan", statusLabel: "Status",
    docLabel: "Dokumen kontrak", docHint: "PDF/gambar, maks 10MB", viewDoc: "Lihat dokumen", currentDoc: "Dokumen saat ini",
    replaceDoc: "Ganti dokumen", noDoc: "Tidak ada dokumen", noNote: "Tidak ada catatan",
    cancel: "Batal", save: "Simpan", addTitle: "Tambah Kontrak", editTitle: "Edit Kontrak", detailTitle: "Detail Kontrak",
    saved: "Kontrak ditambahkan ✓", updated: "Kontrak diperbarui ✓", deleted: "Kontrak dihapus ✓",
    saveFailed: "Gagal menyimpan. Pastikan Anda HR/admin.", deleteFailed: "Gagal menghapus.", connection: "Koneksi bermasalah. Coba lagi.", delete: "Hapus kontrak",
  },
  en: {
    title: "Contract History", empty: "No contracts yet.", add: "Add contract", ongoing: "Ongoing",
    active: "Active", ended: "Ended", typeLabel: "Contract type", startLabel: "Start", endLabel: "End",
    endHint: "Leave empty if ongoing (permanent).", noteLabel: "Note", statusLabel: "Status",
    docLabel: "Contract document", docHint: "PDF/image, max 10MB", viewDoc: "View document", currentDoc: "Current document",
    replaceDoc: "Replace document", noDoc: "No document", noNote: "No note",
    cancel: "Cancel", save: "Save", addTitle: "Add Contract", editTitle: "Edit Contract", detailTitle: "Contract Details",
    saved: "Contract added ✓", updated: "Contract updated ✓", deleted: "Contract deleted ✓",
    saveFailed: "Failed to save. Make sure you are HR/admin.", deleteFailed: "Failed to delete.", connection: "Connection problem. Try again.", delete: "Delete contract",
  },
};

const docHref = (path: string) => `/api/contracts/doc?path=${encodeURIComponent(path)}`;

type SheetState = { mode: "add" } | { mode: "view"; contract: EmployeeContract } | null;

export function ContractsCard({ employeeId, contracts, canManage }: { employeeId: string; contracts: EmployeeContract[]; canManage: boolean }) {
  const locale = useLocale();
  const t = STR[locale];
  const router = useRouter();
  const toast = useToast();
  const [list, setList] = useState(contracts);
  const [sheet, setSheet] = useState<SheetState>(null);

  async function remove(id: string) {
    const prev = list;
    setList((cur) => cur.filter((c) => c.id !== id));
    setSheet(null);
    try {
      const res = await fetch("/api/contracts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { setList(prev); toast.error(apiErrorMessage(data?.error, locale, res.status)); return; }
      toast.success(t.deleted);
      router.refresh();
    } catch { setList(prev); toast.error(t.connection); }
  }

  const sheetTitle = sheet?.mode === "add" ? t.addTitle : canManage ? t.editTitle : t.detailTitle;

  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <FileSignature className="h-4 w-4 text-forest-600" /> {t.title}
        </h3>
        {canManage && (
          <button onClick={() => setSheet({ mode: "add" })} className="inline-flex items-center gap-1 text-xs font-medium text-sky hover:underline">
            <Plus className="h-3.5 w-3.5" /> {t.add}
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <p className="mt-3 text-sm text-faint">{t.empty}</p>
      ) : (
        <ol className="mt-3 space-y-1.5">
          {list.map((c) => (
            <li key={c.id} className="border-l-2 border-line pl-3">
              <button
                type="button"
                onClick={() => setSheet({ mode: "view", contract: c })}
                className="group flex w-full items-start gap-2 rounded-lg py-1 pr-1 text-left transition-colors hover:bg-sand/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">{TYPE_LABEL[locale][c.type]}</span>
                    <Badge tone={c.status === "active" ? "matcha" : "neutral"}>{c.status === "active" ? t.active : t.ended}</Badge>
                    {c.docPath && <FileText className="h-3.5 w-3.5 text-faint" />}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {formatDate(c.startDate, "short", locale)} – {c.endDate ? formatDate(c.endDate, "short", locale) : t.ongoing}
                  </p>
                  {c.note && <p className="mt-0.5 truncate text-xs text-faint">{c.note}</p>}
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-line transition-colors group-hover:text-faint" />
              </button>
            </li>
          ))}
        </ol>
      )}

      <Sheet open={sheet !== null} onClose={() => setSheet(null)} title={sheetTitle}>
        {sheet?.mode === "add" && (
          <ContractForm
            employeeId={employeeId}
            onSaved={(c) => { setList((cur) => [c, ...cur]); setSheet(null); toast.success(t.saved); router.refresh(); }}
            onCancel={() => setSheet(null)}
          />
        )}
        {sheet?.mode === "view" && canManage && (
          <ContractForm
            employeeId={employeeId}
            initial={sheet.contract}
            onSaved={(c) => { setList((cur) => cur.map((x) => (x.id === c.id ? c : x))); setSheet(null); toast.success(t.updated); router.refresh(); }}
            onDelete={() => remove(sheet.contract.id)}
            onCancel={() => setSheet(null)}
          />
        )}
        {sheet?.mode === "view" && !canManage && <ContractDetail contract={sheet.contract} />}
      </Sheet>
    </div>
  );
}

/** Read-only preview for employees viewing their own contract. */
function ContractDetail({ contract }: { contract: EmployeeContract }) {
  const locale = useLocale();
  const t = STR[locale];
  return (
    <dl className="space-y-3 text-sm">
      <Row label={t.typeLabel} value={TYPE_LABEL[locale][contract.type]} />
      <Row label={t.statusLabel} value={contract.status === "active" ? t.active : t.ended} />
      <Row label={t.startLabel} value={formatDate(contract.startDate, "long", locale)} />
      <Row label={t.endLabel} value={contract.endDate ? formatDate(contract.endDate, "long", locale) : t.ongoing} />
      <Row label={t.noteLabel} value={contract.note || t.noNote} />
      <div>
        <dt className="text-faint">{t.docLabel}</dt>
        <dd className="mt-0.5">
          {contract.docPath ? (
            <a href={docHref(contract.docPath)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-sky hover:underline">
              <FileText className="h-3.5 w-3.5" /> {t.viewDoc}
            </a>
          ) : (
            <span className="text-ink">{t.noDoc}</span>
          )}
        </dd>
      </div>
    </dl>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-faint">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  );
}

function ContractForm({
  employeeId,
  initial,
  onSaved,
  onCancel,
  onDelete,
}: {
  employeeId: string;
  initial?: EmployeeContract;
  onSaved: (c: EmployeeContract) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();
  const isEdit = !!initial;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    type: (initial?.type ?? "pkwt") as CType,
    startDate: initial?.startDate ?? "",
    endDate: initial?.endDate ?? "",
    status: (initial?.status ?? "active") as EmployeeContract["status"],
    note: initial?.note ?? "",
  });
  const [docBlob, setDocBlob] = useState<File | null>(null);
  const [docName, setDocName] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.startDate) return;
    setSaving(true);
    try {
      // Upload the doc straight to storage (no body-size limit); send the path.
      let doc: { docPath?: string; docFile?: string } = {};
      if (docBlob) {
        const up = await prepareFileForBucket("contract-docs", employeeId, docBlob);
        doc = up.path ? { docPath: up.path } : { docFile: up.dataUrl ?? undefined };
      }
      const payload = isEdit
        ? { id: initial!.id, type: form.type, startDate: form.startDate, endDate: form.endDate || null, status: form.status, note: form.note, ...doc }
        : { employeeId, type: form.type, startDate: form.startDate, endDate: form.endDate || null, status: form.status, note: form.note, ...doc };
      const res = await fetch("/api/contracts", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.contract) { toast.error(apiErrorMessage(data?.error, locale, res.status)); return; }
      onSaved(data.contract as EmployeeContract);
    } catch (err) {
      toast.error(apiErrorMessage(err instanceof Error ? err.message : undefined, locale));
    } finally { setSaving(false); }
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
      <Field label={t.docLabel} hint={t.docHint}>
        <div className="space-y-2">
          {isEdit && initial!.docPath && !docBlob && (
            <a href={docHref(initial!.docPath)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-sky hover:underline">
              <FileText className="h-3.5 w-3.5" /> {t.currentDoc}
            </a>
          )}
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-cream/50 px-3 py-2 text-sm text-ink transition-colors hover:bg-cream">
            <Upload className="h-4 w-4 text-faint" />
            <span className="truncate max-w-[14rem]">{docName || (isEdit && initial!.docPath ? t.replaceDoc : t.docLabel)}</span>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = ""; // allow re-picking the same file
                if (!file) return;
                // Keep the raw file; it's compressed + uploaded on submit.
                setDocBlob(file);
                setDocName(file.name);
              }}
            />
          </label>
        </div>
      </Field>
      <div className="flex gap-2 pt-2">
        {isEdit && onDelete && (
          <Button type="button" variant="outline" onClick={onDelete} disabled={saving} aria-label={t.delete} className="px-3 text-[#8c3c1f] hover:bg-[#8c3c1f]/5">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>{t.cancel}</Button>
        <Button type="submit" className="flex-1" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}{t.save}</Button>
      </div>
    </form>
  );
}
