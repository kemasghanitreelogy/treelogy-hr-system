"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, ClipboardPaste, FileSpreadsheet, History, Loader2, MessageSquareText,
  RefreshCw, Search, Sparkles, Upload, X, Zap,
} from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { apiErrorMessage } from "@/lib/api-error";
import { parseCsv, parseXlsx } from "@/lib/eligible-customers/parse";
import { displayWaPhone, normalizeWaPhone, PHONE_FIX_TEXT, PHONE_PROBLEM_TEXT, type PhoneFix } from "@/lib/qontak/phone";
import { humanTemplateName, renderPreview, slotId, type TemplateSlot, type WaTemplate } from "@/lib/qontak/template";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/layout/locale-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { CampaignRunner, type Counts } from "./campaign-runner";
import { WaBubble } from "./wa-bubble";

const STR: Record<Locale, Record<string, string>> = {
  id: {
    tabNew: "Kampanye baru", tabHistory: "Riwayat",
    step1: "Template", step2: "Penerima", step3: "Pratinjau & kirim",
    pickTpl: "Pilih template pesan",
    pickTplHint: "Hanya template yang sudah disetujui WhatsApp (APPROVED) yang tampil.",
    searchTpl: "Cari template…",
    vars: "variabel", noVars: "tanpa variabel",
    unsupported: "Belum bisa dikirim dari sini",
    slowLane: "Jalur cepat (bulk) Qontak belum aktif untuk kredensial ini — pesan dikirim lewat antrean 55/menit. Aktifkan scope qontak-chat:all di Mekari Developer Center untuk blast ribuan nomor dalam hitungan detik.",
    from: "Dikirim dari",
    recipients: "Daftar penerima",
    dropTitle: "Letakkan CSV / Excel di sini",
    dropHint: "atau ketuk untuk memilih berkas — nomor HP dirapikan otomatis",
    orPaste: "atau tempel langsung dari spreadsheet",
    pastePh: "Nama\tNo HP\tResi\nSiti Aminah\t0812-3456-7890\tJD0123456789",
    usePaste: "Pakai teks ini",
    mapping: "Pemetaan kolom",
    mappingHint: "Dicocokkan otomatis dari judul kolom — ganti bila keliru.",
    colPhone: "Nomor WhatsApp", colName: "Nama penerima",
    sameForAll: "— isi sama untuk semua —",
    constPh: "Nilai untuk semua penerima",
    mediaUrl: "URL gambar/berkas header (https://…)",
    ready: "siap dikirim", fixed: "dirapikan otomatis", invalid: "tidak bisa dikirim",
    dup: "duplikat (nomor sama)", emptyVar: "variabel kosong",
    line: "baris",
    next: "Lanjut ke pratinjau",
    back: "Kembali",
    change: "Ganti",
    preparing: "Menyiapkan…",
    noFile: "Berkas kosong atau tidak terbaca.",
    unsupportedFile: "Hanya CSV atau Excel (.xlsx).",
    historyEmpty: "Belum ada kampanye.",
    by: "oleh",
    newAgain: "Buat kampanye lain",
    statusSending: "Mengirim", statusDone: "Selesai", statusPartial: "Sebagian gagal", statusFailed: "Gagal", statusCancelled: "Dihentikan",
    sent: "terkirim", delivered: "sampai", failedN: "gagal",
    detail: "Detail kampanye",
    preview: "Contoh pesan",
    clear: "Hapus daftar",
  },
  en: {
    tabNew: "New campaign", tabHistory: "History",
    step1: "Template", step2: "Recipients", step3: "Preview & send",
    pickTpl: "Choose a message template",
    pickTplHint: "Only WhatsApp-approved (APPROVED) templates are listed.",
    searchTpl: "Search templates…",
    vars: "variables", noVars: "no variables",
    unsupported: "Can't be sent from here yet",
    slowLane: "Qontak's fast lane (bulk) isn't enabled for these credentials — messages go through a 55/min queue. Enable the qontak-chat:all scope in Mekari Developer Center to blast thousands in seconds.",
    from: "Sent from",
    recipients: "Recipients",
    dropTitle: "Drop a CSV / Excel file here",
    dropHint: "or tap to choose — phone numbers are cleaned up automatically",
    orPaste: "or paste straight from a spreadsheet",
    pastePh: "Name\tPhone\tTracking\nSiti Aminah\t0812-3456-7890\tJD0123456789",
    usePaste: "Use this text",
    mapping: "Column mapping",
    mappingHint: "Matched automatically from the column titles — change it if wrong.",
    colPhone: "WhatsApp number", colName: "Recipient name",
    sameForAll: "— same value for everyone —",
    constPh: "Value for every recipient",
    mediaUrl: "Header image/file URL (https://…)",
    ready: "ready to send", fixed: "auto-fixed", invalid: "can't be sent",
    dup: "duplicate (same number)", emptyVar: "empty variable",
    line: "row",
    next: "Continue to preview",
    back: "Back",
    change: "Change",
    preparing: "Preparing…",
    noFile: "The file is empty or unreadable.",
    unsupportedFile: "Only CSV or Excel (.xlsx).",
    historyEmpty: "No campaigns yet.",
    by: "by",
    newAgain: "Start another campaign",
    statusSending: "Sending", statusDone: "Done", statusPartial: "Partly failed", statusFailed: "Failed", statusCancelled: "Stopped",
    sent: "sent", delivered: "delivered", failedN: "failed",
    detail: "Campaign detail",
    preview: "Sample message",
    clear: "Clear list",
  },
};

interface TemplatesResp {
  templates: WaTemplate[];
  channel: { id: string; phone: string | null; name: string | null } | null;
  bulk: boolean;
}

// ── Pemetaan kolom otomatis ─────────────────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const PHONE_HDR = /^(hp|nohp|nomorhp|nowa|nomorwa|wa|whatsapp|phone|phonenumber|mobile|handphone|telp|telepon|notelp|nomor|contact|kontak|tujuan)/;
const NAME_HDR = /^(nama|name|customer|customername|penerima|pelanggan|fullname|namapenerima|namapelanggan|tujuan)/;
const AWB_HDR = /(resi|awb|tracking|noresi|nomorresi|airwaybill)/;

type SlotSource = { kind: "col"; col: number } | { kind: "const"; value: string };

interface Grid {
  header: string[];
  rows: string[][];
  /** Nomor baris pertama data di berkas (1 = baris pertama). */
  firstLine: number;
}

function toGrid(raw: string[][]): Grid | null {
  const rows = raw.map((r) => (r ?? []).map((c) => String(c ?? "").trim())).filter((r) => r.some(Boolean));
  if (!rows.length) return null;
  const width = Math.max(...rows.map((r) => r.length));
  const first = rows[0];
  // Baris pertama dianggap JUDUL bila tidak ada satu pun sel yang berupa nomor HP valid.
  const hasHeader = !first.some((c) => normalizeWaPhone(c).ok);
  const header = Array.from({ length: width }, (_, i) => (hasHeader ? first[i] : "") || `Kolom ${String.fromCharCode(65 + (i % 26))}`);
  return { header, rows: hasHeader ? rows.slice(1) : rows, firstLine: hasHeader ? 2 : 1 };
}

function guessPhoneCol(g: Grid): number {
  const byHdr = g.header.findIndex((h) => PHONE_HDR.test(norm(h)));
  if (byHdr >= 0) return byHdr;
  // Tanpa judul yang jelas: kolom dengan nomor valid terbanyak.
  let best = 0, bestN = -1;
  for (let c = 0; c < g.header.length; c++) {
    const n = g.rows.slice(0, 50).filter((r) => normalizeWaPhone(r[c]).ok).length;
    if (n > bestN) { bestN = n; best = c; }
  }
  return best;
}

function guessSlot(g: Grid, s: TemplateSlot, phoneCol: number, nameCol: number): SlotSource {
  if (s.meaning === "name" && nameCol >= 0) return { kind: "col", col: nameCol };
  if (s.meaning === "awb") {
    const i = g.header.findIndex((h) => AWB_HDR.test(norm(h)));
    if (i >= 0) return { kind: "col", col: i };
  }
  const key = s.part === "button" ? `button${s.buttonIndex}` : s.key;
  const i = g.header.findIndex((h, idx) => idx !== phoneCol && [`{{${s.key}}}`, `var${key}`, `variabel${key}`, key].map(norm).includes(norm(h)));
  if (i >= 0) return { kind: "col", col: i };
  return { kind: "const", value: "" };
}

interface Built {
  ok: { line: number; phone: string; name: string; awb: string; vals: Record<string, string>; fixes: PhoneFix[]; raw: string }[];
  bad: { line: number; reason: string; raw: string; name: string }[];
}

function buildRecipients(g: Grid, tpl: WaTemplate, phoneCol: number, nameCol: number, map: Record<string, SlotSource>, locale: Locale): Built {
  const out: Built = { ok: [], bad: [] };
  const seen = new Set<string>();
  const t = STR[locale];
  const awbSlot = tpl.slots.find((s) => s.meaning === "awb");
  g.rows.forEach((r, i) => {
    const line = g.firstLine + i;
    const raw = r[phoneCol] ?? "";
    const name = nameCol >= 0 ? (r[nameCol] ?? "").trim() : "";
    const p = normalizeWaPhone(raw);
    if (!p.ok) { out.bad.push({ line, raw, name, reason: PHONE_PROBLEM_TEXT[p.problem][locale] }); return; }
    const vals: Record<string, string> = {};
    for (const s of tpl.slots) {
      const src = map[slotId(s)];
      vals[slotId(s)] = !src ? "" : src.kind === "col" ? (r[src.col] ?? "").trim() : src.value.trim();
    }
    const kosong = tpl.slots.filter((s) => !vals[slotId(s)]);
    if (kosong.length) {
      out.bad.push({ line, raw, name, reason: `${t.emptyVar}: ${kosong.map((s) => s.context || `{{${s.key}}}`).join(", ")}` });
      return;
    }
    const awb = awbSlot ? vals[slotId(awbSlot)].toUpperCase() : "";
    const key = `${p.phone}|${awb}`;
    if (seen.has(key)) { out.bad.push({ line, raw, name, reason: t.dup }); return; }
    seen.add(key);
    out.ok.push({ line, phone: p.phone, name, awb, vals, fixes: p.fixes, raw });
  });
  return out;
}

// ── Komponen ────────────────────────────────────────────────────────

function Steps({ step, t }: { step: number; t: Record<string, string> }) {
  const items = [t.step1, t.step2, t.step3];
  return (
    <ol className="flex items-center gap-2 text-xs sm:text-sm" aria-label="Langkah">
      {items.map((label, i) => {
        const n = i + 1;
        const state = n < step ? "done" : n === step ? "now" : "next";
        return (
          <li key={label} className="flex min-w-0 items-center gap-2" aria-current={state === "now" ? "step" : undefined}>
            <span
              className={cn(
                "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold transition-colors",
                state === "done" && "bg-forest-600 text-cream",
                state === "now" && "bg-forest-100 text-forest-700 ring-2 ring-forest-500",
                state === "next" && "bg-sand text-faint",
              )}
            >
              {state === "done" ? "✓" : n}
            </span>
            <span className={cn("truncate font-medium", state === "next" ? "text-faint" : "text-ink")}>{label}</span>
            {n < items.length && <span className="h-px w-4 shrink-0 bg-line sm:w-8" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

function TemplateCard({ tpl, onPick, t }: { tpl: WaTemplate; onPick: () => void; t: Record<string, string> }) {
  const disabled = Boolean(tpl.unsupported);
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className={cn(
        "stagger-item group flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-line bg-panel text-left transition-[border-color,box-shadow] duration-200",
        "hover:border-forest-300 hover:shadow-[0_10px_30px_-18px_rgba(29,42,34,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-400",
        disabled && "cursor-not-allowed opacity-55 hover:border-line hover:shadow-none",
      )}
    >
      <div className="h-40 overflow-hidden bg-[#efeae2] px-3 py-3">
        <WaBubble compact text={renderPreview(tpl, {})} buttons={tpl.buttons} media={tpl.mediaHeader} footer={tpl.footer} />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 border-t border-line p-3">
        <p className="line-clamp-2 text-sm font-semibold text-ink group-hover:text-forest-700">{humanTemplateName(tpl.name)}</p>
        <div className="mt-auto flex flex-wrap items-center gap-1.5">
          <Badge tone={tpl.category === "MARKETING" ? "gold" : "sky"}>{tpl.category || "—"}</Badge>
          <span className="text-[11px] text-faint">
            {tpl.slots.length ? `${tpl.slots.length} ${t.vars}` : t.noVars} · {tpl.language.toUpperCase()}
          </span>
        </div>
        {disabled && <p className="text-[11px] text-[#8a6512]">{t.unsupported}</p>}
      </div>
    </button>
  );
}

const STATUS_TONE: Record<string, "sky" | "matcha" | "gold" | "clay" | "neutral"> = {
  sending: "sky", done: "matcha", partial: "gold", failed: "clay", cancelled: "neutral",
};

function statusLabel(status: string, t: Record<string, string>): string {
  const m: Record<string, string> = {
    sending: t.statusSending, done: t.statusDone, partial: t.statusPartial, failed: t.statusFailed, cancelled: t.statusCancelled,
  };
  return m[status] ?? status;
}

interface HistoryItem {
  id: string; name: string; template_name: string; status: string; created_by_name: string | null; created_at: string; counts: Counts;
}

export function WaBlastView() {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [tab, setTab] = useState<"new" | "history">("new");
  const [meta, setMeta] = useState<TemplatesResp | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [tplQuery, setTplQuery] = useState("");
  const [tpl, setTpl] = useState<WaTemplate | null>(null);

  const [grid, setGrid] = useState<Grid | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [drag, setDrag] = useState(false);
  const [phoneCol, setPhoneCol] = useState(0);
  const [nameCol, setNameCol] = useState(-1);
  const [slotMap, setSlotMap] = useState<Record<string, SlotSource>>({});
  const [media, setMedia] = useState("");
  const [creating, setCreating] = useState(false);
  const [campaignIds, setCampaignIds] = useState<string[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);

  const loadMeta = useCallback(async (refresh = false) => {
    setMetaLoading(true);
    try {
      const res = await fetch(`/api/wa-blast/templates${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error("tpl"), { code: json?.error, status: res.status });
      setMeta(json as TemplatesResp);
    } catch (e) {
      const err = e as { code?: string; status?: number };
      toastRef.current.error(apiErrorMessage(err.code, locale, err.status));
    } finally {
      setMetaLoading(false);
    }
  }, [locale]);

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/wa-blast/campaigns", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setHistory(json.campaigns ?? []);
    else toastRef.current.error(apiErrorMessage(json?.error, locale, res.status));
  }, [locale]);

  useEffect(() => { void loadMeta(); }, [loadMeta]);
  useEffect(() => { if (tab === "history") void loadHistory(); }, [tab, loadHistory]);

  // Grid / template berubah → pemetaan ditebak ulang.
  useEffect(() => {
    if (!grid || !tpl) return;
    const pc = guessPhoneCol(grid);
    const nc = grid.header.findIndex((h, i) => i !== pc && NAME_HDR.test(norm(h)));
    setPhoneCol(pc);
    setNameCol(nc);
    const m: Record<string, SlotSource> = {};
    for (const s of tpl.slots) m[slotId(s)] = guessSlot(grid, s, pc, nc);
    setSlotMap(m);
  }, [grid, tpl]);

  const built = useMemo(
    () => (grid && tpl ? buildRecipients(grid, tpl, phoneCol, nameCol, slotMap, locale) : null),
    [grid, tpl, phoneCol, nameCol, slotMap, locale],
  );
  const fixedCount = built?.ok.filter((r) => r.fixes.length).length ?? 0;
  const fixTally = useMemo(() => {
    const m = new Map<PhoneFix, number>();
    for (const r of built?.ok ?? []) for (const f of r.fixes) m.set(f, (m.get(f) ?? 0) + 1);
    return [...m];
  }, [built]);
  const badGroups = useMemo(() => {
    const m = new Map<string, Built["bad"]>();
    for (const b of built?.bad ?? []) m.set(b.reason, [...(m.get(b.reason) ?? []), b]);
    return [...m];
  }, [built]);

  const templates = useMemo(() => {
    const q = tplQuery.trim().toLowerCase();
    const list = (meta?.templates ?? []).filter((x) => !q || x.name.toLowerCase().includes(q) || x.body.toLowerCase().includes(q));
    return [...list].sort((a, b) => Number(Boolean(a.unsupported)) - Number(Boolean(b.unsupported)));
  }, [meta, tplQuery]);

  async function readFile(file: File) {
    try {
      const isXlsx = /\.xlsx$/i.test(file.name);
      const isCsv = /\.(csv|txt|tsv)$/i.test(file.name);
      if (!isXlsx && !isCsv) { toast.error(t.unsupportedFile); return; }
      const raw = isXlsx ? await parseXlsx(await file.arrayBuffer()) : parseCsv(await file.text());
      const g = toGrid(raw);
      if (!g) { toast.error(t.noFile); return; }
      setGrid(g);
      setFileName(file.name);
    } catch {
      toast.error(t.noFile);
    }
  }

  function applyPastedText() {
    const g = toGrid(parseCsv(paste));
    if (!g) { toast.error(t.noFile); return; }
    setGrid(g);
    setFileName(null);
  }

  async function createDraft() {
    if (!tpl || !built?.ok.length) return;
    setCreating(true);
    try {
      const res = await fetch("/api/wa-blast/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "upload",
          templateId: tpl.id,
          media: tpl.mediaHeader ? { url: media.trim(), filename: media.trim().split("/").pop() ?? "" } : null,
          recipients: built.ok.map((r) => ({ phone: r.phone, name: r.name, awb: r.awb, vals: r.vals })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error("create"), { code: json?.error, status: res.status });
      setCampaignIds([json.id]);
    } catch (e) {
      const err = e as { code?: string; status?: number };
      toast.error(apiErrorMessage(err.code, locale, err.status));
    } finally {
      setCreating(false);
    }
  }

  function reset() {
    setTpl(null); setGrid(null); setFileName(null); setPaste(""); setSlotMap({}); setMedia(""); setCampaignIds(null);
  }

  const step = campaignIds ? 3 : tpl ? 2 : 1;
  const mediaOk = !tpl?.mediaHeader || /^https:\/\/\S+$/.test(media.trim());
  const colOptions = grid?.header.map((h, i) => ({ value: i, label: h })) ?? [];
  const sample = built?.ok[0];

  return (
    <div className="space-y-5">
      {/* Tab */}
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-line bg-panel p-1" role="tablist">
          {([["new", t.tabNew, MessageSquareText], ["history", t.tabHistory, History]] as const).map(([k, label, Icon]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                "inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium transition-colors",
                tab === k ? "bg-forest-600 text-cream shadow-sm" : "text-muted hover:text-ink",
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
        {meta?.channel?.phone && (
          <p className="hidden items-center gap-1.5 text-xs text-muted sm:flex">
            <span className="h-2 w-2 rounded-full bg-[#25d366]" aria-hidden /> {t.from}{" "}
            <span className="font-mono font-medium text-ink">{displayWaPhone(meta.channel.phone.replace(/\D/g, ""))}</span>
          </p>
        )}
      </div>

      {tab === "history" ? (
        <section className="space-y-2">
          {!history ? (
            <div className="hf-checking flex items-center gap-2 rounded-2xl px-4 py-10 text-sm text-forest-700"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : !history.length ? (
            <p className="rounded-2xl border border-dashed border-line px-4 py-12 text-center text-sm text-muted">{t.historyEmpty}</p>
          ) : (
            history.map((h, i) => (
              <button
                key={h.id}
                type="button"
                onClick={() => setOpenHistory(h.id)}
                style={{ ["--i" as string]: Math.min(i, 8) }}
                className="stagger-item flex w-full cursor-pointer flex-col gap-2 rounded-2xl border border-line bg-panel p-4 text-left transition-colors hover:border-forest-300 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{h.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {humanTemplateName(h.template_name)} · {new Date(h.created_at).toLocaleString(locale === "en" ? "en-GB" : "id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {h.created_by_name ? ` · ${t.by} ${h.created_by_name}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-2 text-xs tabular-nums">
                  <span className="text-forest-700"><b>{h.counts.sent}</b> {t.sent}</span>
                  <span className="text-forest-700"><b>{h.counts.delivered}</b> {t.delivered}</span>
                  {h.counts.failed + h.counts.unknown + h.counts.undelivered > 0 && (
                    <span className="text-[#8c3c1f]"><b>{h.counts.failed + h.counts.unknown + h.counts.undelivered}</b> {t.failedN}</span>
                  )}
                  <Badge tone={STATUS_TONE[h.status] ?? "neutral"} dot>
                    {statusLabel(h.status, t)}
                  </Badge>
                </span>
              </button>
            ))
          )}
          <Sheet open={Boolean(openHistory)} onClose={() => { setOpenHistory(null); void loadHistory(); }} title={t.detail} width="lg">
            {openHistory && <CampaignRunner campaignIds={[openHistory]} mode="status" />}
          </Sheet>
        </section>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-panel px-4 py-3">
            <Steps step={step} t={t} />
            {step > 1 && (
              <Button variant="ghost" size="sm" onClick={() => (step === 3 ? setCampaignIds(null) : setTpl(null))}>
                <ArrowLeft className="h-3.5 w-3.5" /> {t.back}
              </Button>
            )}
          </div>

          {meta && !meta.bulk && step < 3 && (
            <p className="flex items-start gap-2 rounded-xl bg-sky-soft/60 px-3 py-2 text-xs leading-relaxed text-[#2c5775]">
              <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t.slowLane}
            </p>
          )}

          {/* ── LANGKAH 1: TEMPLATE ── */}
          {step === 1 && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-ink">{t.pickTpl}</h2>
                  <p className="text-xs text-muted">{t.pickTplHint}</p>
                </div>
                <div className="flex w-full items-center gap-2 sm:w-auto">
                  <div className="relative min-w-0 flex-1 sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                    <label htmlFor="tpl-search" className="sr-only">{t.searchTpl}</label>
                    <input
                      id="tpl-search"
                      value={tplQuery}
                      onChange={(e) => setTplQuery(e.target.value)}
                      placeholder={t.searchTpl}
                      className="h-10 w-full rounded-xl border border-line bg-panel pl-9 pr-3 text-sm text-ink placeholder:text-faint focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-200"
                    />
                  </div>
                  <Button variant="outline" size="icon" aria-label="Muat ulang template" onClick={() => loadMeta(true)} disabled={metaLoading}>
                    <RefreshCw className={cn("h-4 w-4", metaLoading && "animate-spin")} />
                  </Button>
                </div>
              </div>
              {metaLoading && !meta ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, i) => <div key={i} className="hf-checking h-56 rounded-2xl" />)}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {templates.map((x, i) => (
                    <div key={x.id} style={{ ["--i" as string]: Math.min(i, 8) }}>
                      <TemplateCard tpl={x} t={t} onPick={() => setTpl(x)} />
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ── LANGKAH 2: PENERIMA ── */}
          {step === 2 && tpl && (
            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
              <div className="min-w-0 space-y-4">
                <div className="flex items-center justify-between gap-2 rounded-2xl border border-forest-200 bg-forest-50/60 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block text-[11px] font-medium uppercase tracking-wide text-forest-700">{t.step1}</span>
                    <span className="block truncate text-sm font-semibold text-ink">{humanTemplateName(tpl.name)}</span>
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setTpl(null)}>{t.change}</Button>
                </div>

                {!grid ? (
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                      onDragLeave={() => setDrag(false)}
                      onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) void readFile(f); }}
                      className={cn(
                        "flex w-full cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors",
                        drag ? "border-forest-500 bg-forest-50" : "border-forest-200 bg-panel hover:border-forest-400 hover:bg-forest-50/40",
                      )}
                    >
                      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-forest-100 text-forest-700"><Upload className="h-5 w-5" /></span>
                      <span className="text-sm font-semibold text-ink">{t.dropTitle}</span>
                      <span className="text-xs text-muted">{t.dropHint}</span>
                    </button>
                    <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,.xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = ""; }} />
                    <div className="space-y-2 rounded-2xl border border-line bg-panel p-3">
                      <label htmlFor="wa-paste" className="flex items-center gap-1.5 text-xs font-medium text-muted"><ClipboardPaste className="h-3.5 w-3.5" /> {t.orPaste}</label>
                      <textarea
                        id="wa-paste"
                        value={paste}
                        onChange={(e) => setPaste(e.target.value)}
                        placeholder={t.pastePh}
                        rows={5}
                        className="w-full rounded-xl border border-line bg-cream/40 px-3 py-2 font-mono text-xs text-ink placeholder:text-faint focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-200"
                      />
                      <div className="flex justify-end">
                        <Button size="sm" variant="secondary" onClick={applyPastedText} disabled={!paste.trim()}>{t.usePaste}</Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2 rounded-2xl border border-line bg-panel px-4 py-3">
                      <span className="flex min-w-0 items-center gap-2 text-sm">
                        <FileSpreadsheet className="h-4 w-4 shrink-0 text-forest-600" />
                        <span className="truncate font-medium text-ink">{fileName ?? "Teks tempel"}</span>
                        <span className="shrink-0 text-xs text-faint">· {grid.rows.length} {t.line}</span>
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => { setGrid(null); setFileName(null); }}>
                        <X className="h-3.5 w-3.5" /> {t.clear}
                      </Button>
                    </div>

                    {/* Pemetaan kolom */}
                    <div className="space-y-3 rounded-2xl border border-line bg-panel p-4">
                      <div>
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink"><Sparkles className="h-4 w-4 text-forest-600" /> {t.mapping}</p>
                        <p className="text-xs text-muted">{t.mappingHint}</p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <MapSelect id="map-phone" label={t.colPhone} value={phoneCol} options={colOptions} onChange={(v) => setPhoneCol(v)} />
                        <MapSelect id="map-name" label={t.colName} value={nameCol} options={[{ value: -1, label: "—" }, ...colOptions]} onChange={(v) => setNameCol(v)} />
                        {tpl.slots.map((s) => {
                          const id = slotId(s);
                          const src = slotMap[id];
                          const label = `${s.part === "button" ? `Tombol ${(s.buttonIndex ?? 0) + 1}` : `{{${s.key}}}`}${s.context ? ` · ${s.context}` : ""}`;
                          return (
                            <div key={id} className="space-y-1.5">
                              <MapSelect
                                id={`map-${id}`}
                                label={label}
                                value={src?.kind === "col" ? src.col : -2}
                                options={[{ value: -2, label: t.sameForAll }, ...colOptions]}
                                onChange={(v) => setSlotMap((m) => ({ ...m, [id]: v === -2 ? { kind: "const", value: "" } : { kind: "col", col: v } }))}
                              />
                              {src?.kind === "const" && (
                                <input
                                  aria-label={`${label} — ${t.constPh}`}
                                  value={src.value}
                                  onChange={(e) => setSlotMap((m) => ({ ...m, [id]: { kind: "const", value: e.target.value } }))}
                                  placeholder={t.constPh}
                                  className="h-10 w-full rounded-xl border border-gold bg-gold-soft/30 px-3 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-gold/40"
                                />
                              )}
                            </div>
                          );
                        })}
                        {tpl.mediaHeader && (
                          <div className="space-y-1.5 sm:col-span-2">
                            <label htmlFor="wa-media" className="block text-xs font-medium text-muted">{t.mediaUrl}</label>
                            <input
                              id="wa-media"
                              value={media}
                              onChange={(e) => setMedia(e.target.value)}
                              inputMode="url"
                              placeholder="https://"
                              className={cn("h-10 w-full rounded-xl border px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-forest-200", mediaOk ? "border-line" : "border-gold bg-gold-soft/30")}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Hasil pemeriksaan */}
                    {built && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                          <Stat n={built.ok.length} label={t.ready} tone="text-forest-700" icon={<CheckCircle2 className="h-3.5 w-3.5" />} />
                          <Stat n={fixedCount} label={t.fixed} tone="text-[#2c5775]" icon={<Sparkles className="h-3.5 w-3.5" />} />
                          <Stat n={built.bad.length} label={t.invalid} tone={built.bad.length ? "text-[#8c3c1f]" : "text-ink"} icon={<AlertTriangle className="h-3.5 w-3.5" />} />
                        </div>
                        {fixTally.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {fixTally.map(([f, n]) => (
                              <span key={f} className="inline-flex items-center gap-1 rounded-full bg-sky-soft px-2.5 py-1 text-[11px] font-medium text-[#2c5775]">
                                <Sparkles className="h-3 w-3" /> {PHONE_FIX_TEXT[f][locale]} · {n}
                              </span>
                            ))}
                          </div>
                        )}
                        {badGroups.map(([reason, rows]) => (
                          <details key={reason} className="group rounded-2xl border border-[#ecd2c4] bg-clay-soft/30 px-4 py-3">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-[#8c3c1f]">
                              <span className="flex min-w-0 items-center gap-1.5"><AlertTriangle className="h-4 w-4 shrink-0" /> <span className="truncate">{reason}</span></span>
                              <span className="shrink-0 tabular-nums">{rows.length}</span>
                            </summary>
                            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
                              {rows.slice(0, 200).map((b) => (
                                <li key={b.line} className="flex justify-between gap-2 rounded-lg bg-panel/80 px-2.5 py-1.5">
                                  <span className="truncate text-ink">{t.line} {b.line} · {b.name || "—"}</span>
                                  <span className="shrink-0 font-mono text-muted">{b.raw || "∅"}</span>
                                </li>
                              ))}
                            </ul>
                          </details>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Contoh pesan untuk penerima pertama */}
              <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
                <p className="text-xs font-semibold uppercase tracking-wide text-faint">{t.preview}</p>
                <div className="rounded-2xl bg-[#efeae2] p-3">
                  <WaBubble text={renderPreview(tpl, sample?.vals ?? {})} buttons={tpl.buttons} media={tpl.mediaHeader} footer={tpl.footer} />
                </div>
                {sample && (
                  <p className="text-xs text-muted">
                    → <span className="font-medium text-ink">{sample.name || "—"}</span> <span className="font-mono">{displayWaPhone(sample.phone)}</span>
                  </p>
                )}
                <Button size="lg" className="w-full" onClick={createDraft} disabled={!built?.ok.length || !mediaOk || creating}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {creating ? t.preparing : `${t.next} (${built?.ok.length ?? 0})`}
                </Button>
              </aside>
            </section>
          )}

          {/* ── LANGKAH 3: PRATINJAU & KIRIM ── */}
          {step === 3 && campaignIds && (
            <div className="space-y-4">
              <CampaignRunner campaignIds={campaignIds} />
              <div className="flex justify-center">
                <Button variant="ghost" size="sm" onClick={reset}>{t.newAgain}</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MapSelect({
  id, label, value, options, onChange,
}: { id: string; label: string; value: number; options: { value: number; label: string }[]; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block truncate text-xs font-medium text-muted">{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-10 w-full cursor-pointer rounded-xl border border-line bg-panel px-3 text-sm text-ink focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-200"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Stat({ n, label, tone, icon }: { n: number; label: string; tone: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-3 py-2.5">
      <p className={cn("flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide", tone)}>{icon} {label}</p>
      <p className={cn("text-2xl font-bold tabular-nums", tone)}>{n}</p>
    </div>
  );
}
