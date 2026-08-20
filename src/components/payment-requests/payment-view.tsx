"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronRight, Download, Layers, Pencil, Plane, Plus, ReceiptText, RefreshCw, Search, Zap } from "lucide-react";
import type { PaymentFlow, PaymentRequest } from "@/lib/types";
import type { FlowFilter } from "@/lib/payment-xlsx";
import type { Locale } from "@/lib/i18n";
import { apiErrorMessage } from "@/lib/api-error";
import { cn, formatDate, rupiah } from "@/lib/utils";
import {
  APPROVAL_LABEL, APPROVAL_STATUSES, APPROVAL_TONE, DEPT_LABEL, FLOW_LABEL, KIND_LABEL,
  composeInvoiceLine, eligibleForSheet,
} from "@/lib/payment-request";
import { useLocale } from "@/components/layout/locale-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { PaymentDetail } from "./payment-detail";
import { PaymentExport } from "./payment-export";
import { PaymentForm } from "./payment-form";
import { FlowChooser } from "./flow-chooser";
import { RejectDialog } from "@/components/ui/reject-dialog";

/** Tautan lampiran bertanda tangan, dihitung di server, dikunci per pengajuan. */
export type PaymentFileLinks = Record<string, { invoices: string[]; approval: string }>;

const STR: Record<Locale, Record<string, any>> = {
  id: {
    searchPh: "Cari deskripsi, vendor, nama…",
    allDept: "Semua departemen",
    submit: "Ajukan",
    formTitle: "Pengajuan Pembayaran",
    empty: "Belum ada pengajuan pembayaran.",
    emptyHint: "Nama & email terisi otomatis. Anda cukup melengkapi rincian dan melampirkan faktur.",
    emptyCta: "Buat pengajuan pertama",
    emptyFiltered: "Tidak ada pengajuan yang cocok.",
    colRequest: "Pengajuan", colDept: "Departemen", colAmount: "Nominal", colSheet: "Google Sheet",
    synced: "Masuk sheet", failed: "Belum masuk sheet",
    retry: "Kirim ulang ke sheet", retried: "Berhasil masuk Google Sheet ✓",
    alreadyInSheet: "Ternyata sudah masuk sheet — tampilan diperbarui ✓",
    retryAll: "Kirim ulang semua", retryingAll: "Mengirim ulang…",
    retryAllDone: (ok: number, n: number) => `${ok} dari ${n} baris masuk sheet ✓`,
    retryAllFail: "Belum ada yang berhasil masuk sheet — periksa koneksi sheet.",
    createdSheetOk: "Pengajuan terkirim & masuk Google Sheet ✓",
    createdSheetFail: "Pengajuan tersimpan, tapi belum masuk Google Sheet.",
    notConfigured: "Google Sheet belum tersambung — pengajuan tetap tersimpan dan bisa dikirim ke sheet begitu kredensial diisi.",
    chooseTitle: "Jenis Pengajuan",
    createdDinas: "Pengajuan dinas terkirim — menunggu persetujuan Ops ✓",
    reviseTitle: "Revisi Pengajuan Dinas",
    reviseShort: "Revisi",
    revisedOk: "Pengajuan diperbaiki & dikirim ulang ✓",
    allStatus: "Semua status",
    allFlows: "Semua",
    // Label pendek untuk layar sempit — nama panjang di sana berakhir jadi
    // "Rei…" / "Reim…", yang justru membuat tabnya mustahil dibedakan.
    shortAll: "Semua", shortBiasa: "Biasa", shortDinas: "Dinas",
    filterFlow: "Saring menurut jalur pengajuan",
    waitingOpsShort: "menunggu ops",
    waitingFinanceShort: "menunggu finance",
    approvedOk: "Disetujui ✓",
    rejectedOk: "Pengajuan ditolak.",
    opsApprovedOk: "Disetujui — diteruskan ke Finance ✓",
    created: "Pengajuan tercatat ✓",
    connection: "Koneksi bermasalah. Coba lagi.",
    count: "pengajuan",
    detailTitle: "Detail Pengajuan",
    export: "Ekspor", exportTitle: "Ekspor ke Excel",
  },
  en: {
    searchPh: "Search description, vendor, name…",
    allDept: "All departments",
    submit: "Request",
    formTitle: "Payment Request",
    empty: "No payment requests yet.",
    emptyHint: "Name & email fill themselves in. You only add the details and attach the invoice.",
    emptyCta: "Create the first request",
    emptyFiltered: "No matching requests.",
    colRequest: "Request", colDept: "Department", colAmount: "Amount", colSheet: "Google Sheet",
    synced: "In sheet", failed: "Not in sheet",
    retry: "Resend to sheet", retried: "Written to Google Sheet ✓",
    alreadyInSheet: "It was already in the sheet — the view has caught up ✓",
    retryAll: "Resend all", retryingAll: "Resending…",
    retryAllDone: (ok: number, n: number) => `${ok} of ${n} rows written to the sheet ✓`,
    retryAllFail: "None made it into the sheet — check the sheet connection.",
    createdSheetOk: "Submitted & written to Google Sheet ✓",
    createdSheetFail: "Saved, but not yet written to the Google Sheet.",
    notConfigured: "Google Sheet isn't connected — requests are still stored and can be pushed once credentials are set.",
    chooseTitle: "Request Type",
    createdDinas: "Business-trip request submitted — awaiting Ops approval ✓",
    reviseTitle: "Revise Business-Trip Request",
    reviseShort: "Revise",
    revisedOk: "Request revised & resubmitted ✓",
    allStatus: "All statuses",
    allFlows: "All",
    shortAll: "All", shortBiasa: "Regular", shortDinas: "Trip",
    filterFlow: "Filter by request flow",
    waitingOpsShort: "awaiting ops",
    waitingFinanceShort: "awaiting finance",
    approvedOk: "Approved ✓",
    rejectedOk: "Request rejected.",
    opsApprovedOk: "Approved — forwarded to Finance ✓",
    created: "Request recorded ✓",
    connection: "Connection problem. Try again.",
    count: "requests",
    detailTitle: "Request Detail",
    export: "Export", exportTitle: "Export to Excel",
  },
};

const MAX_STAGGER = 8;
const COLS =
  "grid-cols-[minmax(0,1fr)_auto] " +
  "xl:grid-cols-[minmax(0,1fr)_minmax(0,140px)_minmax(0,150px)_minmax(0,140px)_16px]";

export function PaymentView({
  requests,
  fileLinks,
  today,
  employeeId,
  name,
  email,
  canManage,
  canApproveOps,
  sheetsConnected,
}: {
  requests: PaymentRequest[];
  fileLinks: PaymentFileLinks;
  today: string;
  employeeId: string | null;
  name: string;
  email: string;
  /** Finance/HR — melihat semua, memutus tahap AKHIR, & kirim ulang ke sheet. */
  canManage: boolean;
  /** Penyetuju tahap 1 jalur dinas (payment.approve_ops — Ops/GA). */
  canApproveOps: boolean;
  sheetsConnected: boolean;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const router = useRouter();
  const toast = useToast();

  const [list, setList] = useState(requests);
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState("all");
  const [status, setStatus] = useState("all");
  /** Jalur yang sedang dilihat: reimburse biasa, dinas, atau keduanya. */
  const [flowFilter, setFlowFilter] = useState<FlowFilter>("all");
  const [open, setOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);
  /** Jalur yang dipilih di persimpangan; null = pemilih masih tampil. */
  const [flow, setFlow] = useState<PaymentFlow | null>(null);
  /** Pengajuan dinas yang sedang diperbaiki pengaju setelah ditolak. */
  const [revising, setRevising] = useState<PaymentRequest | null>(null);
  const [rejecting, setRejecting] = useState<PaymentRequest | null>(null);
  const [decideBusyId, setDecideBusyId] = useState<string | null>(null);

  // Disaring dua tahap: hasil TANPA saringan jalur dipakai untuk menghitung
  // isi tiap tab, supaya angkanya tetap benar saat satu tab sedang aktif.
  const seDeptStatus = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((r) => {
      if (dept !== "all" && r.department !== dept) return false;
      if (status !== "all" && r.approvalStatus !== status) return false;
      if (!q) return true;
      return [r.description, r.vendorName ?? "", r.requesterName, r.email].some((f) => f.toLowerCase().includes(q));
    });
  }, [list, query, dept, status]);

  const filtered = useMemo(
    () => (flowFilter === "all" ? seDeptStatus : seDeptStatus.filter((r) => r.flow === flowFilter)),
    [seDeptStatus, flowFilter],
  );

  const perJalur = useMemo(
    () => ({
      all: seDeptStatus.length,
      biasa: seDeptStatus.filter((r) => r.flow === "biasa").length,
      dinas: seDeptStatus.filter((r) => r.flow === "dinas").length,
    }),
    [seDeptStatus],
  );

  const total = useMemo(() => filtered.reduce((s, r) => s + r.totalAmount, 0), [filtered]);
  const selected = list.find((x) => x.id === selectedId) ?? null;
  const belum = useMemo(
    () => filtered.filter((r) => eligibleForSheet(r) && r.sheetStatus !== "synced").length,
    [filtered],
  );
  const antre = useMemo(
    () => ({
      ops: filtered.filter((r) => r.approvalStatus === "waiting_ops").length,
      finance: filtered.filter((r) => r.approvalStatus === "waiting_finance").length,
    }),
    [filtered],
  );

  /** Pengaju sendiri & pengajuan dinas ditolak → boleh diperbaiki. */
  function canRevise(r: PaymentRequest): boolean {
    return r.flow === "dinas" && r.approvalStatus === "rejected" && r.employeeId === employeeId;
  }

  /**
   * Boleh memutus tahap yang SEDANG berjalan — hanya untuk jalur dinas, dan
   * tidak pernah untuk pengajuan sendiri (server menegakkan hal yang sama).
   */
  function canDecide(r: PaymentRequest): boolean {
    if (r.flow !== "dinas" || r.employeeId === employeeId) return false;
    if (r.approvalStatus === "waiting_ops") return canApproveOps;
    if (r.approvalStatus === "waiting_finance") return canManage;
    return false;
  }

  async function decide(r: PaymentRequest, action: "approve" | "reject", reason?: string) {
    setDecideBusyId(r.id);
    try {
      const res = await fetch("/api/payment-requests/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, action, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.request) {
        toast.error(apiErrorMessage(data?.error, locale, res.status));
        return;
      }
      const saved = data.request as PaymentRequest;
      setList((cur) => cur.map((x) => (x.id === saved.id ? saved : x)));
      if (action === "reject") toast.success(t.rejectedOk);
      else if (saved.approvalStatus === "waiting_finance") toast.success(t.opsApprovedOk);
      else if (data.sheet?.ok === false) toast.error(t.createdSheetFail);
      else toast.success(t.approvedOk);
      router.refresh();
    } catch {
      toast.error(t.connection);
    } finally {
      setDecideBusyId(null);
      setRejecting(null);
    }
  }

  /** Kirim ulang baris yang gagal masuk sheet (anti-duplikat dijaga server). */
  async function retry(r: PaymentRequest) {
    setBusyId(r.id);
    try {
      const res = await fetch("/api/payment-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.request) {
        toast.error(apiErrorMessage(data?.error, locale, res.status));
        return;
      }
      setList((cur) => cur.map((x) => (x.id === r.id ? (data.request as PaymentRequest) : x)));
      if (data.error === "already_synced") {
        // Layarnya yang tertinggal, bukan datanya. Barisnya sudah ikut
        // diperbarui di atas, jadi tandanya berubah hijau saat itu juga.
        toast.success(t.alreadyInSheet);
      } else if (data.ok) {
        toast.success(t.retried);
      } else {
        // Sebab kegagalan diterjemahkan, bukan ditempel mentah. Kode seperti
        // "claim_failed" tidak berarti apa-apa bagi orang yang membacanya.
        toast.error(`${t.createdSheetFail} ${apiErrorMessage(data.reason, locale)}`.trim());
      }
      router.refresh();
    } catch {
      toast.error(t.connection);
    } finally {
      setBusyId(null);
    }
  }

  /**
   * Kirim ulang SEMUA baris yang belum masuk sheet, satu per satu (berurutan —
   * webhook Apps Script tidak suka diserbu paralel, dan urutan baris di sheet
   * jadi ikut rapi sesuai waktu pengajuan).
   */
  async function retryAll() {
    const antre = list.filter((r) => eligibleForSheet(r) && r.sheetStatus !== "synced");
    if (antre.length === 0) return;
    setRetryingAll(true);
    let ok = 0;
    try {
      for (const r of antre) {
        try {
          const res = await fetch("/api/payment-requests", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: r.id }),
          });
          const data = await res.json().catch(() => ({}));
          if (data.request) {
            const saved = data.request as PaymentRequest;
            setList((cur) => cur.map((x) => (x.id === saved.id ? saved : x)));
            // "Sudah masuk sheet" bukan kegagalan — barisnya memang sudah ada
            // di sana, dan layar inilah yang baru saja menyusul kebenarannya.
            if (data.ok || data.error === "already_synced") ok++;
          }
        } catch {
          /* lanjut ke baris berikutnya — satu gagal tidak menghentikan sisanya */
        }
      }
      if (ok > 0) toast.success(t.retryAllDone(ok, antre.length));
      else toast.error(t.retryAllFail);
      router.refresh();
    } finally {
      setRetryingAll(false);
    }
  }
  return (
    <div className="space-y-3">
      {!sheetsConnected && (
        <p className="flex items-start gap-2 rounded-2xl border border-gold/40 bg-gold-soft/50 px-3.5 py-2.5 text-xs text-[#8a6512]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {t.notConfigured}
        </p>
      )}

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.searchPh} aria-label={t.searchPh} className="pl-9" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <Select value={dept} onChange={(e) => setDept(e.target.value)} aria-label={t.allDept} className="min-w-0 sm:w-40">
            <option value="all">{t.allDept}</option>
            {Object.entries(DEPT_LABEL[locale]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
          {/* Status persetujuan hanya ada pada jalur dinas — menyodorkannya saat
              tab "Reimburse Biasa" aktif hanya akan membingungkan. */}
          {flowFilter !== "biasa" && (
            <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t.allStatus} className="min-w-0 sm:w-44">
              <option value="all">{t.allStatus}</option>
              {APPROVAL_STATUSES.map((v) => (
                <option key={v} value={v}>{APPROVAL_LABEL[locale][v]}</option>
              ))}
            </Select>
          )}
          <Button
            variant="outline"
            onClick={() => setExportOpen(true)}
            className="shrink-0"
            disabled={list.length === 0}
          >
            <Download className="h-4 w-4" /> {t.export}
          </Button>
          <Button onClick={() => setOpen(true)} className="shrink-0" disabled={!employeeId}>
            <Plus className="h-4 w-4" /> {t.submit}
          </Button>
        </div>
      </div>

      {/* Pemisah jalur dibuat sebagai tab, bukan dropdown ketiga: ini pembagian
          utama daftar ini, dan angkanya harus terbaca tanpa membuka apa pun. */}
      <div
        role="tablist"
        aria-label={t.filterFlow}
        className="flex gap-1.5 overflow-x-auto rounded-2xl border border-line bg-panel p-1"
      >
        {([
          ["all", Layers, t.allFlows, t.shortAll, perJalur.all],
          ["biasa", Zap, FLOW_LABEL[locale].biasa, t.shortBiasa, perJalur.biasa],
          ["dinas", Plane, FLOW_LABEL[locale].dinas, t.shortDinas, perJalur.dinas],
        ] as const).map(([id, Icon, label, pendek, jml]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={flowFilter === id}
            onClick={() => {
              setFlowFilter(id);
              // Saringan status ikut disembunyikan pada jalur biasa — jangan
              // tinggalkan saringan tak terlihat yang diam-diam menyembunyikan baris.
              if (id === "biasa") setStatus("all");
            }}
            className={cn(
              // min-h-11 = 44px, ambang nyaman untuk ditekan jempol di ponsel.
              // px lebih rapat di ponsel: sepertiga lebar layar hanya cukup
              // untuk label + jumlah bila bantalannya tidak boros.
              "flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-400 sm:min-h-0 sm:px-3",
              flowFilter === id
                ? "bg-forest-50 text-forest-700 ring-1 ring-forest-200"
                : "text-muted hover:bg-cream/70 hover:text-ink",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate sm:hidden">{pendek}</span>
            <span className="hidden truncate sm:inline">{label}</span>
            <span
              className={cn(
                "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] tabular-nums",
                flowFilter === id ? "bg-forest-100 text-forest-700" : "bg-sand text-faint",
              )}
            >
              {jml}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span key={filtered.length} className="animate-count-up font-semibold text-ink tabular-nums">
          {filtered.length} {t.count}
        </span>
        <span className="text-line">·</span>
        <span key={total} className="animate-count-up text-muted tabular-nums">{rupiah(total, { compact: true })}</span>
        {antre.ops > 0 && (
          <>
            <span className="text-line">·</span>
            <span className="font-medium text-[#8a6512] tabular-nums">{antre.ops} {t.waitingOpsShort}</span>
          </>
        )}
        {antre.finance > 0 && (
          <>
            <span className="text-line">·</span>
            <span className="font-medium text-sky tabular-nums">{antre.finance} {t.waitingFinanceShort}</span>
          </>
        )}
        {belum > 0 && (
          <>
            <span className="text-line">·</span>
            <span className="font-medium text-clay tabular-nums">{belum} {t.failed.toLowerCase()}</span>
            {/* Satu klik membereskan seluruh sisa — tak perlu buka baris satu-satu. */}
            {canManage && (
              <button
                onClick={retryAll}
                disabled={retryingAll}
                className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 font-medium text-muted transition-colors hover:bg-sand hover:text-ink disabled:opacity-50"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", retryingAll && "animate-spin")} />
                {retryingAll ? t.retryingAll : t.retryAll}
              </button>
            )}
          </>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-cream/40 px-5 py-12 text-center">
          <ReceiptText className="mx-auto h-8 w-8 text-faint" />
          <p className="mt-2 text-sm text-faint">{list.length === 0 ? t.empty : t.emptyFiltered}</p>
          {list.length === 0 && employeeId && (
            <>
              <p className="mx-auto mt-1 max-w-md text-xs text-faint">{t.emptyHint}</p>
              <Button className="mt-4" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" /> {t.emptyCta}
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-panel">
          <div className={cn("hidden items-center gap-3 border-b border-line bg-cream/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-faint xl:grid", COLS)}>
            <span>{t.colRequest}</span>
            <span>{t.colDept}</span>
            <span className="text-right">{t.colAmount}</span>
            <span>{t.colSheet}</span>
            <span />
          </div>
          <div className="divide-y divide-line">
            {filtered.map((r, i) => (
              // Tombol revisi jadi SAUDARA baris (tombol di dalam tombol tidak sah).
              <div key={r.id} className="flex items-center">
              <button
                type="button"
                onClick={() => setSelectedId(r.id)}
                style={{ ["--i" as string]: Math.min(i, MAX_STAGGER) }}
                className={cn(
                  "stagger-item grid min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-cream/60 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-forest-400",
                  COLS,
                )}
              >
                <span className="block min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{composeInvoiceLine(r)}</span>
                  <span className="mt-0.5 block truncate text-xs text-faint">
                    {r.requesterName} · {KIND_LABEL[locale][r.kind]}
                    {r.kind === "other" && r.kindOther ? `: ${r.kindOther}` : ""} ·{" "}
                    {formatDate(r.submittedAt, "short", locale)}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted tabular-nums xl:hidden">
                    {DEPT_LABEL[locale][r.department]} · {rupiah(r.totalAmount)}
                  </span>
                </span>

                <span className="hidden min-w-0 truncate text-sm text-muted xl:block">{DEPT_LABEL[locale][r.department]}</span>
                <span className="hidden min-w-0 truncate text-right text-sm text-ink tabular-nums xl:block">
                  {rupiah(r.totalAmount)}
                </span>

                {/* Status per baris: sudah masuk sheet keuangan atau belum. */}
                <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 xl:justify-start">
                  {/* Jalur dinas: status persetujuan dulu — itu yang menentukan
                      kapan barisnya boleh masuk sheet. */}
                  {r.flow === "dinas" && r.approvalStatus !== "approved" && (
                    <Badge tone={APPROVAL_TONE[r.approvalStatus]} dot className="!px-2 !py-0.5 !text-[10px]">
                      {APPROVAL_LABEL[locale][r.approvalStatus]}
                    </Badge>
                  )}
                  {!eligibleForSheet(r) ? null : r.sheetStatus === "synced" ? (
                    <Badge tone="matcha" className="!px-2 !py-0.5 !text-[10px]">
                      <CheckCircle2 className="h-3 w-3" /> {t.synced}
                    </Badge>
                  ) : (
                    <>
                      <Badge tone="clay" className="!px-2 !py-0.5 !text-[10px]">{t.failed}</Badge>
                      {canManage && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            retry(r);
                          }}
                          disabled={busyId === r.id}
                          title={r.sheetError ?? undefined}
                          aria-label={t.retry}
                          className="cursor-pointer rounded-lg p-1 text-muted transition-colors hover:bg-sand hover:text-ink disabled:opacity-50"
                        >
                          <RefreshCw className={cn("h-3.5 w-3.5", busyId === r.id && "animate-spin")} />
                        </button>
                      )}
                    </>
                  )}
                </span>
                <ChevronRight className="hidden h-4 w-4 shrink-0 text-faint xl:block" />
              </button>
              {canRevise(r) && (
                <button
                  type="button"
                  onClick={() => setRevising(r)}
                  className="mr-3 inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-forest-600 px-2.5 py-1.5 text-xs font-semibold text-cream transition-colors hover:bg-forest-700"
                >
                  <Pencil className="h-3.5 w-3.5" /> {t.reviseShort}
                </button>
              )}
              </div>
            ))}
          </div>
        </div>
      )}

      <Sheet
        open={selected !== null}
        onClose={() => setSelectedId(null)}
        title={t.detailTitle}
        width="lg"
      >
        {selected && (
          <PaymentDetail
            request={selected}
            canManage={canManage}
            canDecide={canDecide(selected)}
            canRevise={canRevise(selected)}
            busy={busyId === selected.id}
            decideBusy={decideBusyId === selected.id}
            onResend={() => retry(selected)}
            onApprove={() => decide(selected, "approve")}
            onReject={() => setRejecting(selected)}
            onRevise={() => {
              setSelectedId(null);
              setRevising(selected);
            }}
          />
        )}
      </Sheet>

      <Sheet open={exportOpen} onClose={() => setExportOpen(false)} title={t.exportTitle}>
        {exportOpen && (
          <PaymentExport
            requests={list}
            fileLinks={fileLinks}
            today={today}
            initialFlow={flowFilter}
            onClose={() => setExportOpen(false)}
          />
        )}
      </Sheet>

      {/* Persimpangan → formulir. Judul ikut jalur yang dipilih supaya pengaju
          selalu tahu pengajuan ini akan lewat jalur mana. */}
      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
          setFlow(null);
        }}
        title={flow ? `${t.formTitle} · ${FLOW_LABEL[locale][flow]}` : t.chooseTitle}
        width="lg"
      >
        {open && !flow && <FlowChooser onPick={setFlow} />}
        {open && flow && employeeId && (
          <PaymentForm
            flow={flow}
            employeeId={employeeId}
            name={name}
            email={email}
            onSaved={(saved, sheet) => {
              setOpen(false);
              setFlow(null);
              setList((cur) => [saved, ...cur]);
              if (saved.flow === "dinas") toast.success(t.createdDinas);
              else if (sheet.ok) toast.success(t.createdSheetOk);
              else toast.error(t.createdSheetFail);
              router.refresh();
            }}
            onCancel={() => {
              setOpen(false);
              setFlow(null);
            }}
          />
        )}
      </Sheet>

      {/* Revisi pengajuan dinas yang ditolak — form sama, terisi data lama. */}
      <Sheet open={revising !== null} onClose={() => setRevising(null)} title={t.reviseTitle} width="lg">
        {revising && employeeId && (
          <PaymentForm
            flow="dinas"
            item={revising}
            employeeId={employeeId}
            name={name}
            email={email}
            onSaved={(saved) => {
              setRevising(null);
              setList((cur) => cur.map((x) => (x.id === saved.id ? saved : x)));
              toast.success(t.revisedOk);
              router.refresh();
            }}
            onCancel={() => setRevising(null)}
          />
        )}
      </Sheet>

      <RejectDialog
        open={rejecting !== null}
        busy={decideBusyId !== null}
        onCancel={() => setRejecting(null)}
        onConfirm={(reason) => rejecting && decide(rejecting, "reject", reason)}
      />
    </div>
  );
}
