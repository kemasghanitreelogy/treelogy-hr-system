"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Download, MapPin, Plane, Plus, Search } from "lucide-react";
import type { TravelRequest } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { apiErrorMessage } from "@/lib/api-error";
import { cn, formatDate, rupiah } from "@/lib/utils";
import { TRANSPORT_LABEL, isOngoing, isUpcoming } from "@/lib/travel";
import { useLocale } from "@/components/layout/locale-context";
import { ApprovalStatus } from "@/components/ui/approval-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { RejectDialog } from "@/components/ui/reject-dialog";
import { ScopeTabs, defaultScopeFor, inScope, scopeOptionsFor, type Scope } from "@/components/ui/scope-tabs";
import { Sheet } from "@/components/ui/sheet";
import { useStickyTab } from "@/lib/use-sticky-tab";
import { useToast } from "@/components/ui/toast";
import { TravelDetail } from "./travel-detail";
import { TravelExport } from "./travel-export";
import { TravelForm, type TravelEmployeeOption } from "./travel-form";

export interface TravelEmployee extends TravelEmployeeOption {
  managerId: string | null;
}

const STR: Record<
  Locale,
  {
    searchPh: string;
    allStatuses: string;
    pending: string;
    approved: string;
    rejected: string;
    request: string;
    fab: string;
    sumRequests: (n: number) => string;
    sumOngoing: (n: number) => string;
    sumUpcoming: (n: number) => string;
    sumCost: string;
    filteredOf: (total: number) => string;
    reset: string;
    colTrip: string;
    colDates: string;
    colDuration: string;
    colCost: string;
    colStatus: string;
    empty: string;
    emptyHint: string;
    emptyCta: string;
    emptyFiltered: string;
    detailTitle: string;
    formTitle: string;
    ongoing: string;
    upcoming: string;
    created: string;
    approvedOk: string;
    rejectedOk: string;
    resetOk: string;
    returnedOk: string;
    returnTitle: (dest: string) => string;
    returnDesc: string;
    fixTitle: string;
    exportBtn: string;
    exportTitle: string;
    connection: string;
    rejectTitle: (dest: string) => string;
    days: (n: number) => string;
    daysUnit: string;
  }
> = {
  id: {
    searchPh: "Cari tujuan, keperluan, nama…",
    allStatuses: "Semua status",
    pending: "Menunggu",
    approved: "Disetujui",
    rejected: "Ditolak",
    request: "Ajukan",
    fab: "Ajukan perjalanan dinas",
    sumRequests: (n) => `${n} pengajuan`,
    sumOngoing: (n) => `${n} sedang berjalan`,
    sumUpcoming: (n) => `${n} akan berangkat`,
    sumCost: "estimasi disetujui",
    filteredOf: (total) => `dari ${total}`,
    reset: "Hapus filter",
    colTrip: "Perjalanan",
    colDates: "Tanggal",
    colDuration: "Lama",
    colCost: "Estimasi",
    colStatus: "Status",
    empty: "Belum ada pengajuan perjalanan dinas.",
    emptyHint: "Nama, jabatan, lama perjalanan, dan total biaya diisi otomatis — Anda cukup mengisi tujuan dan rinciannya.",
    emptyCta: "Ajukan yang pertama",
    emptyFiltered: "Tidak ada pengajuan yang cocok.",
    detailTitle: "Detail Perjalanan Dinas",
    formTitle: "Ajukan Perjalanan Dinas",
    ongoing: "Berjalan",
    upcoming: "Akan berangkat",
    created: "Pengajuan terkirim ✓",
    approvedOk: "Pengajuan disetujui ✓",
    rejectedOk: "Pengajuan ditolak ✓",
    resetOk: "Dikembalikan ke menunggu ✓",
    returnedOk: "Dikembalikan untuk revisi ✓",
    returnTitle: (dest) => `Kembalikan pengajuan ke ${dest}?`,
    returnDesc: "Tulis apa yang perlu diperbaiki. Pengaju bisa memperbaiki datanya lalu mengirim ulang.",
    fixTitle: "Perbaiki Pengajuan",
    exportBtn: "Ekspor",
    exportTitle: "Ekspor Perjalanan Dinas",
    connection: "Koneksi bermasalah. Coba lagi.",
    rejectTitle: (dest) => `Tolak perjalanan ke ${dest}?`,
    days: (n) => `${n} hari`,
    daysUnit: "hr",
  },
  en: {
    searchPh: "Search destination, purpose, name…",
    allStatuses: "All statuses",
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    request: "Request",
    fab: "Request business travel",
    sumRequests: (n) => `${n} requests`,
    sumOngoing: (n) => `${n} ongoing`,
    sumUpcoming: (n) => `${n} upcoming`,
    sumCost: "approved estimate",
    filteredOf: (total) => `of ${total}`,
    reset: "Clear filters",
    colTrip: "Trip",
    colDates: "Dates",
    colDuration: "Length",
    colCost: "Estimate",
    colStatus: "Status",
    empty: "No business travel requests yet.",
    emptyHint: "Name, job title, duration, and total cost fill themselves in — you only enter the destination and details.",
    emptyCta: "Submit the first one",
    emptyFiltered: "No matching requests.",
    detailTitle: "Business Travel Detail",
    formTitle: "Request Business Travel",
    ongoing: "Ongoing",
    upcoming: "Upcoming",
    created: "Request submitted ✓",
    approvedOk: "Request approved ✓",
    rejectedOk: "Request rejected ✓",
    resetOk: "Reset to pending ✓",
    returnedOk: "Returned for revision ✓",
    returnTitle: (dest) => `Return the request to ${dest}?`,
    returnDesc: "Describe what needs fixing. The requester can correct the data and resubmit.",
    fixTitle: "Fix Request",
    exportBtn: "Export",
    exportTitle: "Export Business Travel",
    connection: "Connection problem. Try again.",
    rejectTitle: (dest) => `Reject the trip to ${dest}?`,
    days: (n) => `${n} day${n === 1 ? "" : "s"}`,
    daysUnit: "d",
  },
};

const MAX_STAGGER = 8;

const COLS =
  "grid-cols-[minmax(0,1fr)_auto] " +
  "xl:grid-cols-[minmax(0,1fr)_minmax(0,190px)_minmax(0,72px)_minmax(0,130px)_minmax(0,130px)_16px]";

export function TravelView({
  requests,
  employees,
  currentEmployeeId,
  canApproveAll,
  canFinalize,
  canRequestForOthers,
  today,
}: {
  requests: TravelRequest[];
  employees: TravelEmployee[];
  currentEmployeeId: string | null;
  /** Penyetuju tahap 1 (travel.approve — Ops/GA). */
  canApproveAll: boolean;
  /** Penyetuju tahap akhir (travel.finalize — HR/Admin). */
  canFinalize: boolean;
  canRequestForOthers: boolean;
  today: string;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const router = useRouter();
  const toast = useToast();

  const [list, setList] = useState(requests);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [rejecting, setRejecting] = useState<TravelRequest | null>(null);
  const [returning, setReturning] = useState<TravelRequest | null>(null);
  const [fixing, setFixing] = useState<TravelRequest | null>(null);
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState(false);

  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const hasTeam = useMemo(
    () => employees.some((e) => e.managerId != null && e.managerId === currentEmployeeId),
    [employees, currentEmployeeId],
  );
  const scopeOpts = scopeOptionsFor(canApproveAll, hasTeam);
  const [scope, setScope] = useStickyTab<Scope>(
    "travel.scope",
    defaultScopeFor(scopeOpts),
    scopeOpts.length ? scopeOpts : ["mine"],
  );

  const scoped = useMemo(
    () =>
      list.filter((r) =>
        scopeOpts.length === 0
          ? r.employeeId === currentEmployeeId
          : inScope(scope, r.employeeId, empMap.get(r.employeeId)?.managerId ?? null, currentEmployeeId),
      ),
    [list, scope, scopeOpts.length, empMap, currentEmployeeId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (!q) return true;
      const name = empMap.get(r.employeeId)?.name ?? "";
      return [r.destination, r.purpose, name, r.jobTitle]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q));
    });
  }, [scoped, query, status, empMap]);

  const stats = useMemo(
    () => ({
      ongoing: filtered.filter((r) => isOngoing(r, today)).length,
      upcoming: filtered.filter((r) => isUpcoming(r, today)).length,
      // Hanya yang DISETUJUI yang dijumlahkan — pengajuan menunggu belum jadi komitmen biaya.
      approvedCost: filtered.filter((r) => r.status === "approved").reduce((s, r) => s + r.costTotal, 0),
    }),
    [filtered, today],
  );

  const selected = list.find((r) => r.id === selectedId) ?? null;
  const isFiltered = query.trim() !== "" || status !== "all";

  /**
   * Boleh memutuskan tahap yang SEDANG berjalan — dan tidak pernah untuk
   * pengajuan milik sendiri (four-eyes; server menegakkan hal yang sama).
   * Tahap 1 (belum ada tanda tangan): travel.approve, atau finalize sebagai
   * cadangan. Tahap 2: hanya travel.finalize.
   */
  function canDecide(r: TravelRequest): boolean {
    if (r.status !== "pending") return false;
    if (r.employeeId === currentEmployeeId) return false;
    return r.managerApprover ? canFinalize : canApproveAll || canFinalize;
  }

  async function decide(
    r: TravelRequest,
    action: "approve" | "reject" | "reset" | "revise",
    reason?: string,
  ) {
    setBusy(true);
    try {
      const res = await fetch("/api/travel", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, action, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.request) {
        toast.error(apiErrorMessage(data?.error, locale, res.status));
        return;
      }
      const saved = data.request as TravelRequest;
      setList((cur) => cur.map((x) => (x.id === saved.id ? saved : x)));
      toast.success(
        action === "approve"
          ? t.approvedOk
          : action === "reject"
            ? t.rejectedOk
            : action === "revise"
              ? t.returnedOk
              : t.resetOk,
      );
      router.refresh();
    } catch {
      toast.error(t.connection);
    } finally {
      setBusy(false);
      setRejecting(null);
      setReturning(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* Baris aksi */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        {scopeOpts.length > 0 && <ScopeTabs options={scopeOpts} value={scope} onChange={setScope} />}
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
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label={t.allStatuses}
            className="min-w-0 sm:w-40"
          >
            <option value="all">{t.allStatuses}</option>
            <option value="pending">{t.pending}</option>
            <option value="approved">{t.approved}</option>
            <option value="rejected">{t.rejected}</option>
          </Select>
          <Button variant="outline" onClick={() => setExporting(true)} className="shrink-0">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">{t.exportBtn}</span>
          </Button>
          <Button onClick={() => setRequesting(true)} className="shrink-0">
            <Plus className="h-4 w-4" /> {t.request}
          </Button>
        </div>
      </div>

      {/* Ringkasan satu baris */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span key={`r-${filtered.length}`} className="animate-count-up font-semibold text-ink tabular-nums">
          {t.sumRequests(filtered.length)}
        </span>
        {isFiltered && <span className="text-faint">{t.filteredOf(scoped.length)}</span>}
        {stats.ongoing > 0 && (
          <>
            <span className="text-line">·</span>
            <span className="font-medium text-forest-600 tabular-nums">{t.sumOngoing(stats.ongoing)}</span>
          </>
        )}
        {stats.upcoming > 0 && (
          <>
            <span className="text-line">·</span>
            <span className="text-muted tabular-nums">{t.sumUpcoming(stats.upcoming)}</span>
          </>
        )}
        <span className="text-line">·</span>
        <span key={`c-${stats.approvedCost}`} className="animate-count-up text-muted tabular-nums">
          {rupiah(stats.approvedCost, { compact: true })} {t.sumCost}
        </span>
        {isFiltered && (
          <button
            onClick={() => {
              setQuery("");
              setStatus("all");
            }}
            className="ml-auto cursor-pointer rounded-lg px-2 py-1 font-medium text-muted transition-colors hover:bg-sand hover:text-ink"
          >
            {t.reset}
          </button>
        )}
      </div>

      {/* Daftar */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-cream/40 px-5 py-12 text-center">
          <Plane className="mx-auto h-8 w-8 text-faint" />
          <p className="mt-2 text-sm text-faint">{scoped.length === 0 ? t.empty : t.emptyFiltered}</p>
          {scoped.length === 0 && (
            <>
              <p className="mx-auto mt-1 max-w-md text-xs text-faint">{t.emptyHint}</p>
              <Button className="mt-4" onClick={() => setRequesting(true)}>
                <Plus className="h-4 w-4" /> {t.emptyCta}
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-panel">
          <div
            className={cn(
              "hidden items-center gap-3 border-b border-line bg-cream/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-faint xl:grid",
              COLS,
            )}
          >
            <span>{t.colTrip}</span>
            <span>{t.colDates}</span>
            <span className="text-right">{t.colDuration}</span>
            <span className="text-right">{t.colCost}</span>
            <span>{t.colStatus}</span>
            <span />
          </div>

          <div className="divide-y divide-line">
            {filtered.map((r, i) => {
              const emp = empMap.get(r.employeeId);
              const ongoing = isOngoing(r, today);
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  style={{ ["--i" as string]: Math.min(i, MAX_STAGGER) }}
                  className={cn(
                    "stagger-item grid w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-cream/60 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-forest-400",
                    COLS,
                  )}
                >
                  <span className="block min-w-0">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-faint" />
                      <span className="truncate text-sm font-medium text-ink">{r.destination}</span>
                      {ongoing && (
                        <Badge tone="forest" className="shrink-0 !px-1.5 !py-0 !text-[9px]">
                          {t.ongoing}
                        </Badge>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-faint">
                      {emp?.name ?? "—"} · {r.purpose}
                    </span>
                    {/* Ponsel: tanggal & biaya ikut di baris meta karena kolomnya disembunyikan */}
                    <span className="mt-0.5 block truncate text-xs text-muted tabular-nums xl:hidden">
                      {formatDate(r.departureDate, "short", locale)} · {t.days(r.durationDays)} ·{" "}
                      {rupiah(r.costTotal, { compact: true })}
                    </span>
                  </span>

                  <span className="hidden min-w-0 truncate text-sm text-muted tabular-nums xl:block">
                    {formatDate(r.departureDate, "short", locale)}
                    <span className="block text-xs text-faint">
                      {TRANSPORT_LABEL[locale][r.transport]}
                    </span>
                  </span>
                  <span className="hidden min-w-0 truncate text-right text-sm text-muted tabular-nums xl:block">
                    {r.durationDays}
                    <span className="text-faint"> {t.daysUnit}</span>
                  </span>
                  <span className="hidden min-w-0 truncate text-right text-sm text-ink tabular-nums xl:block">
                    {rupiah(r.costTotal, { compact: true })}
                  </span>
                  <span className="hidden min-w-0 xl:block">
                    <ApprovalStatus request={r} align="start" twoStep />
                  </span>

                  <span className="shrink-0 xl:hidden">
                    <ApprovalStatus request={r} twoStep />
                  </span>
                  <ChevronRight className="hidden h-4 w-4 shrink-0 text-faint xl:block" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Detail + keputusan */}
      <Sheet open={selected !== null} onClose={() => setSelectedId(null)} title={t.detailTitle} width="lg">
        {selected && (
          <TravelDetail
            request={selected}
            employeeName={empMap.get(selected.employeeId)?.name ?? "—"}
            canDecide={canDecide(selected)}
            canReset={canFinalize && selected.status !== "pending"}
            canRevise={selected.employeeId === currentEmployeeId && selected.status !== "approved"}
            busy={busy}
            onApprove={() => decide(selected, "approve")}
            onReject={() => setRejecting(selected)}
            onReset={() => decide(selected, "reset")}
            onReturnForRevision={() => setReturning(selected)}
            onFix={() => {
              setFixing(selected);
              setSelectedId(null);
            }}
          />
        )}
      </Sheet>

      {/* Form pengajuan */}
      <Sheet open={requesting} onClose={() => setRequesting(false)} title={t.formTitle} width="lg">
        {requesting && (
          <TravelForm
            employees={employees}
            defaultEmployeeId={currentEmployeeId ?? employees[0]?.id ?? ""}
            canPickEmployee={canRequestForOthers}
            onSaved={(saved) => {
              setRequesting(false);
              setList((cur) => [saved, ...cur]);
              setSelectedId(saved.id);
              toast.success(t.created);
              router.refresh();
            }}
            onCancel={() => setRequesting(false)}
          />
        )}
      </Sheet>

      {/* Ekspor — cakupan "semua" memakai data yang tampil menurut scope aktif,
          sehingga isi berkas selalu cocok dengan yang dilihat pengguna. */}
      <Sheet open={exporting} onClose={() => setExporting(false)} title={t.exportTitle}>
        {exporting && (
          <TravelExport
            requests={scoped}
            employees={employees}
            today={today}
            onClose={() => setExporting(false)}
          />
        )}
      </Sheet>

      {/* Perbaikan oleh pengaju — form yang sama, terisi data lamanya */}
      <Sheet open={fixing !== null} onClose={() => setFixing(null)} title={t.fixTitle} width="lg">
        {fixing && (
          <TravelForm
            item={fixing}
            employees={employees}
            defaultEmployeeId={fixing.employeeId}
            canPickEmployee={false}
            onSaved={(saved) => {
              setFixing(null);
              setList((cur) => cur.map((x) => (x.id === saved.id ? saved : x)));
              setSelectedId(saved.id);
              toast.success(t.created);
              router.refresh();
            }}
            onCancel={() => setFixing(null)}
          />
        )}
      </Sheet>

      {/* Kembalikan untuk revisi — memakai dialog beralasan yang sama dengan tolak */}
      <RejectDialog
        open={returning !== null}
        title={returning ? t.returnTitle(returning.destination) : undefined}
        description={t.returnDesc}
        busy={busy}
        onConfirm={(reason) => returning && decide(returning, "revise", reason)}
        onCancel={() => setReturning(null)}
      />

      <RejectDialog
        open={rejecting !== null}
        title={rejecting ? t.rejectTitle(rejecting.destination) : undefined}
        busy={busy}
        onConfirm={(reason) => rejecting && decide(rejecting, "reject", reason)}
        onCancel={() => setRejecting(null)}
      />
    </div>
  );
}
