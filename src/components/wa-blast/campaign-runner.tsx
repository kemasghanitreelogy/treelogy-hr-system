"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Check, ChevronLeft, ChevronRight, Clock, Loader2, RotateCcw, Search, Send, ShieldCheck, Square, Users,
} from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { apiErrorMessage } from "@/lib/api-error";
import { displayWaPhone } from "@/lib/qontak/phone";
import { humanTemplateName, renderPreview } from "@/lib/qontak/template";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/layout/locale-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { WaBubble, WaPhone } from "./wa-bubble";

export interface Counts {
  total: number; queued: number; sending: number; sent: number; failed: number; skipped: number; unknown: number;
  delivered: number; read: number; undelivered: number;
}
interface Campaign {
  id: string; name: string; template_name: string; template_body: string; status: string; stop_reason: string | null;
  channel_phone: string | null; created_at: string; started_at: string | null; finished_at: string | null;
}
export interface RecipientRow {
  id: string; seq: number; phone: string; name: string; awb: string; vals: Record<string, string>;
  status: string; last_error: string | null; attempts: number; sent_at: string | null;
  delivery_status: string | null; delivery_error: string | null;
}
interface Loaded {
  campaign: Campaign;
  counts: Counts;
  recipients?: RecipientRow[];
  recent?: RecipientRow[];
  problems?: RecipientRow[];
}

const PAGE = 50;
/** Laju antrean di server (engine PER_MINUTE) — dasar perkiraan waktu. */
const RATE = 55;

const STR: Record<Locale, Record<string, string>> = {
  id: {
    loading: "Menyiapkan pratinjau…",
    recipient: "Penerima",
    of: "dari",
    search: "Cari nama, nomor, atau resi…",
    more: "Tampilkan lebih banyak",
    willSend: "akan dikirim",
    skipped: "dilewati",
    skippedHint: "Resi ini sudah pernah dikirimi dalam 14 hari terakhir — dilewati supaya pelanggan tidak menerima pesan ganda.",
    eta: "Perkiraan",
    etaNote: "Qontak membatasi 60 pesan/menit per akun",
    send: "Kirim",
    messages: "pesan",
    confirmTitle: "Kirim {n} pesan WhatsApp?",
    confirmMsg: "Dari {from} memakai template {tpl}. Pesan yang sudah terkirim tidak bisa ditarik kembali. Perkiraan selesai: {eta}.",
    sending: "Mengirim",
    sentQontak: "Diterima Qontak",
    delivered: "Sampai di WA",
    failed: "Gagal",
    queued: "Antre",
    closeOk: "Halaman ini boleh ditutup — pengiriman tetap berjalan di server.",
    remaining: "sisa ±",
    retry: "Kirim ulang yang gagal",
    stop: "Hentikan sisa antrean",
    stopTitle: "Hentikan sisa antrean?",
    stopMsg: "Pesan yang belum terkirim tidak akan dikirim. Yang sudah terkirim tetap terkirim.",
    stopped: "Sisa antrean dihentikan.",
    problems: "Perlu perhatian",
    doneTitle: "Selesai",
    doneAll: "Semua pesan sudah diterima Qontak.",
    donePartial: "Sebagian pesan gagal — lihat alasannya di bawah.",
    stoppedBy: "Pengiriman berhenti:",
    activity: "Aktivitas terakhir",
    nothing: "Tidak ada yang perlu dikirim — semua penerima dilewati.",
    started: "Pengiriman dimulai",
    lessMinute: "< 1 menit",
    minutes: "menit",
    seconds: "detik",
    unknownHint: "Status tidak pasti (koneksi terputus saat mengirim) — mungkin sudah sampai. Tidak dikirim ulang otomatis.",
    statusQueued: "Antre", statusSending: "Mengirim", statusSent: "Terkirim", statusFailed: "Gagal", statusSkipped: "Dilewati", statusUnknown: "Tidak pasti",
    deliveredBadge: "Sampai", readBadge: "Dibaca", undeliveredBadge: "Ditolak WA",
  },
  en: {
    loading: "Preparing preview…",
    recipient: "Recipient",
    of: "of",
    search: "Search name, number, or tracking…",
    more: "Show more",
    willSend: "will be sent",
    skipped: "skipped",
    skippedHint: "This tracking number was already messaged in the last 14 days — skipped so the customer doesn't get a duplicate.",
    eta: "Estimate",
    etaNote: "Qontak allows 60 messages/min per account",
    send: "Send",
    messages: "messages",
    confirmTitle: "Send {n} WhatsApp messages?",
    confirmMsg: "From {from} using template {tpl}. Sent messages can't be recalled. Estimated finish: {eta}.",
    sending: "Sending",
    sentQontak: "Accepted by Qontak",
    delivered: "Delivered",
    failed: "Failed",
    queued: "Queued",
    closeOk: "You can close this page — sending continues on the server.",
    remaining: "≈",
    retry: "Resend failed",
    stop: "Stop the rest",
    stopTitle: "Stop the remaining queue?",
    stopMsg: "Messages not yet sent won't be sent. Already-sent ones stay sent.",
    stopped: "Remaining queue stopped.",
    problems: "Needs attention",
    doneTitle: "Done",
    doneAll: "Every message was accepted by Qontak.",
    donePartial: "Some messages failed — see why below.",
    stoppedBy: "Sending stopped:",
    activity: "Latest activity",
    nothing: "Nothing to send — every recipient was skipped.",
    started: "Sending started",
    lessMinute: "< 1 min",
    minutes: "min",
    seconds: "sec",
    unknownHint: "Uncertain (connection dropped mid-send) — it may have arrived. Not resent automatically.",
    statusQueued: "Queued", statusSending: "Sending", statusSent: "Sent", statusFailed: "Failed", statusSkipped: "Skipped", statusUnknown: "Uncertain",
    deliveredBadge: "Delivered", readBadge: "Read", undeliveredBadge: "Rejected by WA",
  },
};

export function formatEta(n: number, t: Record<string, string>): string {
  const secs = Math.ceil((n * 60) / RATE);
  if (secs < 60) return n ? `${secs} ${t.seconds}` : "—";
  const min = Math.ceil(secs / 60);
  return `${min} ${t.minutes}`;
}

function skippedReason(r: RecipientRow, locale: Locale): string | null {
  if (r.last_error?.startsWith("already_sent:")) {
    const d = new Date(r.last_error.slice("already_sent:".length));
    const tgl = Number.isFinite(+d) ? d.toLocaleDateString(locale === "en" ? "en-GB" : "id-ID", { day: "numeric", month: "short" }) : "";
    return locale === "en" ? `already messaged ${tgl}` : `sudah dikirimi ${tgl}`;
  }
  if (r.last_error === "cancelled") return locale === "en" ? "stopped" : "dihentikan";
  return null;
}

function StatusBadge({ r, t }: { r: RecipientRow; t: Record<string, string> }) {
  if (r.status === "sent") {
    if (r.delivery_status === "read") return <Badge tone="forest" dot>{t.readBadge}</Badge>;
    if (r.delivery_status === "delivered") return <Badge tone="matcha" dot>{t.deliveredBadge}</Badge>;
    if (r.delivery_status === "failed") return <Badge tone="clay" dot>{t.undeliveredBadge}</Badge>;
    return <Badge tone="sky" dot>{t.statusSent}</Badge>;
  }
  const map: Record<string, ["neutral" | "gold" | "clay" | "sky", string]> = {
    queued: ["neutral", t.statusQueued], sending: ["sky", t.statusSending], failed: ["clay", t.statusFailed],
    skipped: ["neutral", t.statusSkipped], unknown: ["gold", t.statusUnknown],
  };
  const [tone, label] = map[r.status] ?? ["neutral", r.status];
  return <Badge tone={tone}>{r.status === "sending" && <Loader2 className="h-3 w-3 animate-spin" />}{label}</Badge>;
}

/**
 * Pratinjau → konfirmasi → progres live untuk satu atau beberapa kampanye
 * DRAFT (blast resi campuran kurir = satu kampanye per kurir, satu tombol).
 * Mode "status" langsung ke progres — dipakai dari riwayat.
 */
export function CampaignRunner({
  campaignIds,
  mode = "preview",
  onFinished,
}: {
  campaignIds: string[];
  mode?: "preview" | "status";
  onFinished?: () => void;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();

  const [data, setData] = useState<Record<string, Loaded>>({});
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<"preview" | "running">(mode === "status" ? "running" : "preview");
  const [tab, setTab] = useState(campaignIds[0]);
  const [cursor, setCursor] = useState(0);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [ask, setAsk] = useState(false);
  const [askStop, setAskStop] = useState(false);
  const [busy, setBusy] = useState(false);
  const doneAnnounced = useRef(false);
  // Toast & daftar id distabilkan: objek toast dibuat ulang tiap kali
  // provider-nya render (yaitu setiap toast muncul), dan array prop bisa
  // berganti identitas — keduanya tidak boleh memicu muat ulang.
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const idsKey = campaignIds.join(",");

  const load = useCallback(
    async (full: boolean) => {
      const entries = await Promise.all(
        idsKey.split(",").filter(Boolean).map(async (id) => {
          const res = await fetch(`/api/wa-blast/campaigns/${id}${full ? "?full=1" : ""}`, { cache: "no-store" });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) throw Object.assign(new Error("load"), { code: json?.error, status: res.status });
          return [id, json as Loaded] as const;
        }),
      );
      setData((prev) => {
        const next = { ...prev };
        for (const [id, d] of entries) next[id] = { ...prev[id], ...d, recipients: d.recipients ?? prev[id]?.recipients };
        return next;
      });
    },
    [idsKey],
  );

  useEffect(() => {
    let alive = true;
    load(true)
      .catch((e) => alive && toastRef.current.error(apiErrorMessage(e?.code, locale, e?.status)))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [load, locale]);

  const all = useMemo(() => campaignIds.map((id) => data[id]).filter(Boolean) as Loaded[], [campaignIds, data]);
  const total = useMemo(() => {
    const c = { queued: 0, sending: 0, sent: 0, failed: 0, skipped: 0, unknown: 0, delivered: 0, undelivered: 0, total: 0 };
    for (const d of all) for (const k of Object.keys(c) as (keyof typeof c)[]) c[k] += d.counts[k] ?? 0;
    return c;
  }, [all]);
  const running = all.some((d) => d.campaign.status === "sending");
  const finished = phase === "running" && all.length > 0 && !running;

  // Poll: cepat saat antrean jalan, lebih santai sesudahnya untuk menunggu
  // status "sampai di WA" yang datang belakangan, lalu berhenti.
  useEffect(() => {
    if (phase !== "running") return;
    let stop = false;
    const startedIdle = Date.now();
    const tick = async () => {
      if (stop) return;
      try { await load(false); } catch { /* jaringan sesaat — coba lagi di putaran berikut */ }
      if (stop) return;
      const idleFor = Date.now() - startedIdle;
      if (!running && idleFor > 3 * 60_000) return;
      setTimeout(tick, running ? 2000 : 5000);
    };
    const h = setTimeout(tick, 1200);
    return () => { stop = true; clearTimeout(h); };
  }, [phase, running, load]);

  useEffect(() => {
    if (finished && !doneAnnounced.current) {
      doneAnnounced.current = true;
      onFinished?.();
    }
  }, [finished, onFinished]);

  const cur = data[tab];
  const recipients = useMemo(() => cur?.recipients ?? [], [cur]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recipients;
    const qd = q.replace(/\D/g, "");
    return recipients.filter((r) => r.name.toLowerCase().includes(q) || r.awb.toLowerCase().includes(q) || (qd && r.phone.includes(qd)));
  }, [recipients, query]);
  const focus = filtered[Math.min(cursor, Math.max(0, filtered.length - 1))];
  const channel = all.find((d) => d.campaign.channel_phone)?.campaign.channel_phone ?? null;
  const fromLabel = channel ? displayWaPhone(String(channel).replace(/\D/g, "")) : "Qontak";
  const tplNames = [...new Set(all.map((d) => d.campaign.template_name))].join(", ");

  async function sendAll() {
    setBusy(true);
    try {
      for (const id of campaignIds) {
        const res = await fetch(`/api/wa-blast/campaigns/${id}/send`, { method: "POST" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw Object.assign(new Error("send"), { code: json?.error, status: res.status });
      }
      setAsk(false);
      setPhase("running");
      toast.success(`${t.started} — ${total.queued} ${t.messages}`);
      await load(false);
    } catch (e) {
      const err = e as { code?: string; status?: number };
      toast.error(apiErrorMessage(err.code, locale, err.status));
    } finally {
      setBusy(false);
    }
  }

  async function retryFailed() {
    setBusy(true);
    try {
      let n = 0;
      for (const d of all) {
        if (!d.counts.failed && !d.counts.unknown && !d.counts.undelivered && d.campaign.status !== "failed") continue;
        const res = await fetch(`/api/wa-blast/campaigns/${d.campaign.id}/retry`, { method: "POST" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw Object.assign(new Error("retry"), { code: json?.error, status: res.status });
        n += json.requeued ?? 0;
      }
      doneAnnounced.current = false;
      toast.success(locale === "en" ? `${n} queued again` : `${n} pesan masuk antrean lagi`);
      await load(false);
    } catch (e) {
      const err = e as { code?: string; status?: number };
      toast.error(apiErrorMessage(err.code, locale, err.status));
    } finally {
      setBusy(false);
    }
  }

  async function stopAll() {
    setBusy(true);
    try {
      for (const d of all) {
        if (d.campaign.status !== "sending") continue;
        await fetch(`/api/wa-blast/campaigns/${d.campaign.id}`, { method: "DELETE" });
      }
      setAskStop(false);
      toast.toast(t.stopped, "info");
      await load(false);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="hf-checking flex items-center justify-center gap-2 rounded-2xl px-4 py-16 text-sm font-medium text-forest-700" role="status">
        <Loader2 className="h-4 w-4 animate-spin" /> {t.loading}
      </div>
    );
  }
  if (!all.length) return null;

  // ── PROGRES ────────────────────────────────────────────────────
  if (phase === "running") {
    const resolved = total.sent + total.failed + total.skipped + total.unknown;
    const pct = total.total ? resolved / total.total : 0;
    const problems = all.flatMap((d) => d.problems ?? []);
    const recent = all.flatMap((d) => d.recent ?? []).slice(0, 8);
    const stopReason = all.find((d) => d.campaign.stop_reason)?.campaign.stop_reason;
    const allGood = finished && !total.failed && !total.unknown && !total.undelivered && !stopReason;

    return (
      <div className="space-y-4">
        <section className={cn("rounded-2xl border border-line bg-panel p-4 sm:p-5", finished && "hf-done-panel")}>
          <div className="flex items-start gap-4">
            <div className="relative grid h-16 w-16 shrink-0 place-items-center">
              <svg viewBox="0 0 48 48" className={cn("absolute inset-0 h-16 w-16", finished && allGood && "hf-done-ring")} aria-hidden>
                <circle cx="24" cy="24" r="20" fill="none" stroke="var(--color-sand, #ece6d9)" strokeWidth="4" />
                <circle
                  cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"
                  className={cn("text-forest-600 transition-[stroke-dashoffset] duration-500", !finished && "origin-center -rotate-90")}
                  strokeDasharray={126}
                  strokeDashoffset={finished && allGood ? undefined : 126 * (1 - pct)}
                />
                {finished && allGood && <path d="M16 24.5l5.5 5.5L32.5 19" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="text-forest-600" />}
              </svg>
              {!(finished && allGood) && <span className="text-sm font-bold tabular-nums text-ink">{Math.round(pct * 100)}%</span>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-ink">
                {finished ? t.doneTitle : `${t.sending}…`}
                <span className="ml-2 text-sm font-normal text-muted">{tplNames}</span>
              </p>
              <p className="mt-0.5 text-sm text-muted">
                {finished
                  ? stopReason ? `${t.stoppedBy} ${stopReason}` : allGood ? t.doneAll : t.donePartial
                  : <>{t.remaining} {formatEta(total.queued + total.sending, t)} · {t.closeOk}</>}
              </p>
              <div className="hf-progress-track mt-3 h-1.5 rounded-full bg-sand">
                <div className="hf-progress-fill h-full rounded-full bg-forest-500" style={{ transform: `scaleX(${pct})` }} />
              </div>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: t.sentQontak, n: total.sent, tone: "text-forest-700" },
              { label: t.delivered, n: total.delivered, tone: "text-forest-700" },
              { label: t.failed, n: total.failed + total.unknown + total.undelivered, tone: total.failed + total.unknown + total.undelivered ? "text-[#8c3c1f]" : "text-ink" },
              { label: t.queued, n: total.queued + total.sending, tone: "text-ink" },
            ].map((s, i) => (
              <div key={s.label} className="hf-done-row rounded-xl bg-cream/60 px-3 py-2" style={{ ["--i" as string]: i }}>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-faint">{s.label}</dt>
                <dd className={cn("text-xl font-bold tabular-nums", s.tone)}>{s.n}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            {(total.failed > 0 || total.unknown > 0 || total.undelivered > 0 || stopReason) && (
              <Button variant="secondary" size="sm" onClick={retryFailed} disabled={busy}>
                <RotateCcw className="h-3.5 w-3.5" /> {t.retry}
              </Button>
            )}
            {running && (
              <Button variant="ghost" size="sm" onClick={() => setAskStop(true)} disabled={busy}>
                <Square className="h-3.5 w-3.5" /> {t.stop}
              </Button>
            )}
          </div>
        </section>

        {problems.length > 0 && (
          <section className="rounded-2xl border border-[#ecd2c4] bg-clay-soft/40 p-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[#8c3c1f]">
              <AlertTriangle className="h-4 w-4" /> {t.problems} ({problems.length})
            </p>
            <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {problems.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-panel/80 px-3 py-2 text-xs">
                  <span className="min-w-0">
                    <span className="font-medium text-ink">{r.name || "—"}</span>{" "}
                    <span className="font-mono text-muted">{displayWaPhone(r.phone)}</span>
                    <span className="block text-[#8c3c1f]">
                      {r.status === "unknown" ? t.unknownHint : r.delivery_error || r.last_error || r.delivery_status}
                    </span>
                  </span>
                  <StatusBadge r={r} t={t} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {recent.length > 0 && (
          <section className="rounded-2xl border border-line bg-panel p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">{t.activity}</p>
            <ul className="space-y-1">
              {recent.map((r) => (
                <li key={r.id} className={cn("flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm", r.status === "sending" && "hf-checking")}>
                  <span className="flex min-w-0 items-center gap-2">
                    {r.status === "sent" ? (
                      <span className="hf-check-draw grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#e9f0d8] text-forest-700"><Check className="h-3 w-3" /></span>
                    ) : r.status === "sending" ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-forest-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-[#8c3c1f]" />
                    )}
                    <span className="truncate text-ink">{r.name || displayWaPhone(r.phone)}</span>
                    {r.awb && <span className="hidden truncate font-mono text-xs text-faint sm:inline">{r.awb}</span>}
                  </span>
                  <StatusBadge r={r} t={t} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <ConfirmDialog
          open={askStop}
          title={t.stopTitle}
          message={t.stopMsg}
          confirmLabel={t.stop}
          tone="danger"
          busy={busy}
          onConfirm={stopAll}
          onCancel={() => setAskStop(false)}
        />
      </div>
    );
  }

  // ── PRATINJAU ──────────────────────────────────────────────────
  const curCounts = cur?.counts;
  return (
    <div className="space-y-4">
      {/* Ringkasan — angka pasti sebelum apa pun dikirim. */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-forest-200 bg-forest-50/70 px-3 py-2.5">
          <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-forest-700"><Send className="h-3 w-3" /> {t.willSend}</p>
          <p className="text-2xl font-bold tabular-nums text-forest-700">{total.queued}</p>
        </div>
        <div className="rounded-xl border border-line bg-panel px-3 py-2.5" title={t.skippedHint}>
          <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-faint"><ShieldCheck className="h-3 w-3" /> {t.skipped}</p>
          <p className="text-2xl font-bold tabular-nums text-ink">{total.skipped}</p>
        </div>
        <div className="rounded-xl border border-line bg-panel px-3 py-2.5" title={t.etaNote}>
          <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-faint"><Clock className="h-3 w-3" /> {t.eta}</p>
          <p className="text-2xl font-bold tabular-nums text-ink">{formatEta(total.queued, t)}</p>
        </div>
      </div>

      {all.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist">
          {all.map((d) => (
            <button
              key={d.campaign.id}
              type="button"
              role="tab"
              aria-selected={tab === d.campaign.id}
              onClick={() => { setTab(d.campaign.id); setCursor(0); setQuery(""); setShown(PAGE); }}
              className={cn(
                "shrink-0 cursor-pointer rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
                tab === d.campaign.id ? "border-forest-600 bg-forest-600 text-cream" : "border-line bg-panel text-ink hover:bg-sand/60",
              )}
            >
              {humanTemplateName(d.campaign.template_name)} · {d.counts.queued}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        {/* Ponsel — persis yang diterima pelanggan. */}
        <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <WaPhone title={focus?.name || (focus ? displayWaPhone(focus.phone) : "—")} subtitle={focus ? displayWaPhone(focus.phone) : undefined}>
            {focus && cur && (
              <div key={focus.id} className="fulfill-pop">
                <WaBubble text={renderPreview({ body: cur.campaign.template_body }, focus.vals)} />
              </div>
            )}
          </WaPhone>
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="icon" aria-label="Sebelumnya" onClick={() => setCursor((c) => Math.max(0, c - 1))} disabled={cursor <= 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <p className="text-sm text-muted tabular-nums">
              {t.recipient} <span className="font-semibold text-ink">{filtered.length ? Math.min(cursor, filtered.length - 1) + 1 : 0}</span> {t.of} {filtered.length}
            </p>
            <Button variant="outline" size="icon" aria-label="Berikutnya" onClick={() => setCursor((c) => Math.min(filtered.length - 1, c + 1))} disabled={cursor >= filtered.length - 1}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Daftar penerima */}
        <div className="min-w-0 rounded-2xl border border-line bg-panel">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
            <Users className="h-4 w-4 shrink-0 text-faint" />
            <label className="sr-only" htmlFor="wa-search">{t.search}</label>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
              <input
                id="wa-search"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setCursor(0); setShown(PAGE); }}
                placeholder={t.search}
                className="h-9 w-full rounded-lg border border-line bg-cream/40 pl-8 pr-3 text-sm text-ink placeholder:text-faint focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-200"
              />
            </div>
            {curCounts && <span className="shrink-0 text-xs text-faint tabular-nums">{curCounts.total}</span>}
          </div>
          <ul className="max-h-[520px] divide-y divide-line overflow-y-auto">
            {filtered.slice(0, shown).map((r, i) => {
              const why = r.status === "skipped" ? skippedReason(r, locale) : null;
              return (
                <li key={r.id} style={{ contentVisibility: "auto", containIntrinsicSize: "56px" }}>
                  <button
                    type="button"
                    onClick={() => setCursor(i)}
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-sand/40",
                      focus?.id === r.id && "bg-forest-50",
                      r.status === "skipped" && "opacity-70",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{r.name || "—"}</span>
                      <span className="block truncate text-xs text-muted">
                        <span className="font-mono">{displayWaPhone(r.phone)}</span>
                        {r.awb && <> · <span className="font-mono">{r.awb}</span></>}
                        {why && <> · <span className="text-[#8a6512]">{why}</span></>}
                      </span>
                    </span>
                    <StatusBadge r={r} t={t} />
                  </button>
                </li>
              );
            })}
          </ul>
          {filtered.length > shown && (
            <button type="button" onClick={() => setShown((s) => s + PAGE)} className="w-full cursor-pointer border-t border-line py-2.5 text-sm font-medium text-forest-700 hover:bg-sand/40">
              {t.more} ({filtered.length - shown})
            </button>
          )}
        </div>
      </div>

      {/* Tombol kirim — berlabel tindakan dan angkanya, bukan "OK". */}
      <div className="sticky bottom-0 -mx-1 flex flex-col gap-2 rounded-2xl border border-line bg-panel/95 p-3 shadow-[0_-8px_24px_-16px_rgba(29,42,34,0.35)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">
          {total.queued ? <>{t.etaNote}. </> : t.nothing}
        </p>
        <Button size="lg" onClick={() => setAsk(true)} disabled={!total.queued || busy} className="sm:min-w-56">
          <Send className="h-4 w-4" /> {t.send} {total.queued} {t.messages}
        </Button>
      </div>

      <ConfirmDialog
        open={ask}
        title={t.confirmTitle.replace("{n}", String(total.queued))}
        message={t.confirmMsg.replace("{from}", fromLabel).replace("{tpl}", tplNames).replace("{eta}", formatEta(total.queued, t))}
        confirmLabel={`${t.send} ${total.queued} ${t.messages}`}
        icon={<Send className="h-5 w-5" />}
        busy={busy}
        onConfirm={sendAll}
        onCancel={() => setAsk(false)}
      />
    </div>
  );
}
