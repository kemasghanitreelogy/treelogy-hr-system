"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Pencil, Plus, ReceiptText, Search } from "lucide-react";
import type { TravelReimbursement } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { apiErrorMessage } from "@/lib/api-error";
import { cn, formatDate, rupiah } from "@/lib/utils";
import { REIMB_CATEGORIES, REIMB_CATEGORY_LABEL } from "@/lib/reimbursement";
import { useLocale } from "@/components/layout/locale-context";
import { ApprovalStatus } from "@/components/ui/approval-status";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { RejectDialog } from "@/components/ui/reject-dialog";
import { ScopeTabs, defaultScopeFor, inScope, scopeOptionsFor, type Scope } from "@/components/ui/scope-tabs";
import { Sheet } from "@/components/ui/sheet";
import { useStickyTab } from "@/lib/use-sticky-tab";
import { useToast } from "@/components/ui/toast";
import { ReimbursementDetail } from "./reimbursement-detail";
import { ReimbursementForm, type ReimbEmployeeOption } from "./reimbursement-form";

const STR: Record<Locale, Record<string, string>> = {
  id: {
    searchPh: "Cari deskripsi, keperluan, nama…",
    allCategories: "Semua kategori",
    allStatuses: "Semua status",
    submit: "Ajukan",
    formTitle: "Ajukan Reimbursement Perjalanan",
    detailTitle: "Detail Reimbursement",
    count: "klaim",
    filteredOf: "dari",
    waitingOps: "menunggu tahap 1",
    waitingFinal: "menunggu finance",
    approvedSum: "disetujui",
    colClaim: "Klaim",
    colCategory: "Kategori",
    colDate: "Tanggal biaya",
    colAmount: "Nominal",
    colStatus: "Status",
    empty: "Belum ada klaim reimbursement.",
    emptyHint: "Isi keperluan perjalanan, rincian biaya, dan lampirkan kuitansinya. Persetujuan berjalan otomatis: Ops lalu Finance.",
    emptyCta: "Ajukan klaim pertama",
    emptyFiltered: "Tidak ada klaim yang cocok.",
    reset: "Hapus filter",
    fab: "Ajukan klaim",
    created: "Klaim terkirim — menunggu persetujuan tahap 1 ✓",
    approvedOk: "Klaim disetujui ✓",
    rejectedOk: "Klaim ditolak.",
    resetOk: "Klaim dikembalikan ke menunggu ✓",
    connection: "Koneksi bermasalah. Coba lagi.",
    rejectTitle: "Tolak klaim reimbursement",
    reviseTitle: "Revisi Klaim Reimbursement",
    reviseShort: "Revisi",
    revisedOk: "Klaim diperbaiki & dikirim ulang ✓",
  },
  en: {
    searchPh: "Search description, purpose, name…",
    allCategories: "All categories",
    allStatuses: "All statuses",
    submit: "Submit",
    formTitle: "Submit Travel Reimbursement",
    detailTitle: "Reimbursement Detail",
    count: "claims",
    filteredOf: "of",
    waitingOps: "awaiting step 1",
    waitingFinal: "awaiting finance",
    approvedSum: "approved",
    colClaim: "Claim",
    colCategory: "Category",
    colDate: "Expense date",
    colAmount: "Amount",
    colStatus: "Status",
    empty: "No reimbursement claims yet.",
    emptyHint: "Fill in the trip purpose, expense details, and attach the receipt. Approval runs Ops then Finance.",
    emptyCta: "Submit the first claim",
    emptyFiltered: "No matching claims.",
    reset: "Clear filters",
    fab: "Submit claim",
    created: "Claim submitted — awaiting step-1 approval ✓",
    approvedOk: "Claim approved ✓",
    rejectedOk: "Claim rejected.",
    resetOk: "Claim reset to pending ✓",
    connection: "Connection problem. Try again.",
    rejectTitle: "Reject reimbursement claim",
    reviseTitle: "Revise Reimbursement Claim",
    reviseShort: "Revise",
    revisedOk: "Claim revised & resubmitted ✓",
  },
};

const MAX_STAGGER = 8;
const COLS =
  "grid-cols-[minmax(0,1fr)_auto] " +
  "xl:grid-cols-[minmax(0,1fr)_minmax(0,140px)_minmax(0,110px)_minmax(0,140px)_minmax(0,150px)_16px]";

const STATUSES = ["pending", "approved", "rejected"] as const;

export function ReimbursementsView({
  requests,
  employees,
  currentEmployeeId,
  canApproveOps,
  canFinalize,
  canRequestForOthers,
}: {
  requests: TravelReimbursement[];
  employees: ReimbEmployeeOption[];
  currentEmployeeId: string | null;
  /** Penyetuju tahap 1 (reimbursement.approve — Ops/GA). */
  canApproveOps: boolean;
  /** Penyetuju tahap akhir (reimbursement.finalize — Finance). */
  canFinalize: boolean;
  canRequestForOthers: boolean;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const router = useRouter();
  const toast = useToast();

  const [list, setList] = useState(requests);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [rejecting, setRejecting] = useState<TravelReimbursement | null>(null);
  /** Klaim yang sedang diperbaiki pengaju (setelah ditolak / masih menunggu). */
  const [revising, setRevising] = useState<TravelReimbursement | null>(null);
  const [busy, setBusy] = useState(false);

  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const scopeOpts = scopeOptionsFor(canApproveOps || canFinalize, false);
  const [scope, setScope] = useStickyTab<Scope>(
    "reimbursement.scope",
    defaultScopeFor(scopeOpts),
    scopeOpts.length ? scopeOpts : ["mine"],
  );

  const scoped = useMemo(
    () =>
      list.filter((r) =>
        scopeOpts.length === 0
          ? r.employeeId === currentEmployeeId
          : inScope(scope, r.employeeId, null, currentEmployeeId),
      ),
    [list, scope, scopeOpts.length, currentEmployeeId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped.filter((r) => {
      if (category !== "all" && r.category !== category) return false;
      if (status !== "all" && r.status !== status) return false;
      if (!q) return true;
      const name = empMap.get(r.employeeId)?.name ?? "";
      return [r.description, r.purpose, name, r.receiptNumber ?? "", r.code]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q));
    });
  }, [scoped, query, category, status, empMap]);

  const stats = useMemo(
    () => ({
      ops: filtered.filter((r) => r.status === "pending" && !r.managerApprover).length,
      finance: filtered.filter((r) => r.status === "pending" && !!r.managerApprover).length,
      // Hanya klaim DISETUJUI yang dijumlahkan — sisanya belum jadi komitmen biaya.
      approved: filtered.filter((r) => r.status === "approved").reduce((s, r) => s + r.amount, 0),
    }),
    [filtered],
  );

  const selected = list.find((r) => r.id === selectedId) ?? null;
  const isFiltered = query.trim() !== "" || category !== "all" || status !== "all";

  /**
   * Boleh memutus tahap yang SEDANG berjalan — dan tidak pernah untuk klaim
   * sendiri (four-eyes; server menegakkan hal yang sama).
   */
  /** Pengaju sendiri & klaim belum final-disetujui → boleh diperbaiki. */
  function canRevise(r: TravelReimbursement): boolean {
    return r.employeeId === currentEmployeeId && r.status === "rejected";
  }

  function canDecide(r: TravelReimbursement): boolean {
    if (r.status !== "pending") return false;
    if (r.employeeId === currentEmployeeId) return false;
    return r.managerApprover ? canFinalize : canApproveOps || canFinalize;
  }

  async function decide(r: TravelReimbursement, action: "approve" | "reject" | "reset", reason?: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/reimbursements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, action, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.request) {
        toast.error(apiErrorMessage(data?.error, locale, res.status));
        return;
      }
      const saved = data.request as TravelReimbursement;
      setList((cur) => cur.map((x) => (x.id === saved.id ? saved : x)));
      toast.success(action === "approve" ? t.approvedOk : action === "reject" ? t.rejectedOk : t.resetOk);
      router.refresh();
    } catch {
      toast.error(t.connection);
    } finally {
      setBusy(false);
      setRejecting(null);
    }
  }

  function clearFilters() {
    setQuery("");
    setCategory("all");
    setStatus("all");
  }

  const statusLabel: Record<string, string> = {
    pending: locale === "id" ? "Menunggu" : "Pending",
    approved: locale === "id" ? "Disetujui" : "Approved",
    rejected: locale === "id" ? "Ditolak" : "Rejected",
  };

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
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label={t.allCategories}
            className="min-w-0 sm:w-40"
          >
            <option value="all">{t.allCategories}</option>
            {REIMB_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {REIMB_CATEGORY_LABEL[locale][c]}
              </option>
            ))}
          </Select>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label={t.allStatuses}
            className="min-w-0 sm:w-36"
          >
            <option value="all">{t.allStatuses}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel[s]}
              </option>
            ))}
          </Select>
          <Button onClick={() => setRequesting(true)} className="shrink-0" disabled={!currentEmployeeId}>
            <Plus className="h-4 w-4" /> {t.submit}
          </Button>
        </div>
      </div>

      {/* Ringkasan satu baris */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span key={filtered.length} className="animate-count-up font-semibold text-ink tabular-nums">
          {filtered.length} {t.count}
        </span>
        {isFiltered && (
          <span className="text-faint">
            {t.filteredOf} {scoped.length}
          </span>
        )}
        {stats.approved > 0 && (
          <>
            <span className="text-line">·</span>
            <span key={stats.approved} className="animate-count-up text-muted tabular-nums">
              {rupiah(stats.approved, { compact: true })} {t.approvedSum}
            </span>
          </>
        )}
        {stats.ops > 0 && (
          <>
            <span className="text-line">·</span>
            <span className="font-medium text-[#8a6512] tabular-nums">
              {stats.ops} {t.waitingOps}
            </span>
          </>
        )}
        {stats.finance > 0 && (
          <>
            <span className="text-line">·</span>
            <span className="font-medium text-sky tabular-nums">
              {stats.finance} {t.waitingFinal}
            </span>
          </>
        )}
        {isFiltered && (
          <button
            onClick={clearFilters}
            className="ml-auto cursor-pointer rounded-lg px-2 py-1 font-medium text-muted transition-colors hover:bg-sand hover:text-ink"
          >
            {t.reset}
          </button>
        )}
      </div>

      {/* Daftar padat */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-cream/40 px-5 py-12 text-center">
          <ReceiptText className="mx-auto h-8 w-8 text-faint" />
          <p className="mt-2 text-sm text-faint">{scoped.length === 0 ? t.empty : t.emptyFiltered}</p>
          {scoped.length === 0 && currentEmployeeId && (
            <>
              <p className="mx-auto mt-1 max-w-md text-xs text-faint">{t.emptyHint}</p>
              <Button className="mt-4" onClick={() => setRequesting(true)}>
                <Plus className="h-4 w-4" /> {t.emptyCta}
              </Button>
            </>
          )}
          {scoped.length > 0 && isFiltered && (
            <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
              {t.reset}
            </Button>
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
            <span>{t.colClaim}</span>
            <span>{t.colCategory}</span>
            <span>{t.colDate}</span>
            <span className="text-right">{t.colAmount}</span>
            <span>{t.colStatus}</span>
            <span />
          </div>
          <div className="divide-y divide-line">
            {filtered.map((r, i) => (
              // Tombol revisi harus bisa diklik tanpa membuka detail dulu →
              // dijadikan SAUDARA baris, bukan tombol di dalam tombol.
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
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0 font-mono text-[11px] font-semibold text-faint tabular-nums">
                      {r.code}
                    </span>
                    <span className="truncate text-sm font-medium text-ink">{r.description}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-faint">
                    {empMap.get(r.employeeId)?.name ?? "—"} · {r.purpose}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted tabular-nums xl:hidden">
                    {REIMB_CATEGORY_LABEL[locale][r.category]} · {rupiah(r.amount)}
                  </span>
                </span>

                <span className="hidden min-w-0 truncate text-sm text-muted xl:block">
                  {REIMB_CATEGORY_LABEL[locale][r.category]}
                </span>
                <span className="hidden min-w-0 truncate text-sm text-muted tabular-nums xl:block">
                  {formatDate(r.expenseDate, "short", locale)}
                </span>
                <span className="hidden min-w-0 truncate text-right text-sm text-ink tabular-nums xl:block">
                  {rupiah(r.amount)}
                </span>
                <span className="hidden min-w-0 xl:block">
                  <ApprovalStatus request={r} align="start" twoStep />
                </span>

                <span className="shrink-0 xl:hidden">
                  <ApprovalStatus request={r} twoStep />
                </span>
                <ChevronRight className="hidden h-4 w-4 shrink-0 text-faint xl:block" />
              </button>
              {canRevise(r) && (
                <button
                  type="button"
                  onClick={() => setRevising(r)}
                  className="mr-20 inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-forest-600 px-2.5 py-1.5 text-xs font-semibold text-cream transition-colors hover:bg-forest-700 lg:mr-3"
                >
                  <Pencil className="h-3.5 w-3.5" /> {t.reviseShort}
                </button>
              )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tombol ajukan mengambang — aksi utama di zona jempol. */}
      {currentEmployeeId && list.length > 0 && (
        <button
          onClick={() => setRequesting(true)}
          aria-label={t.fab}
          className="fixed bottom-20 right-4 z-30 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-forest-600 text-cream shadow-pop transition-transform hover:bg-forest-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-400 focus-visible:ring-offset-2 focus-visible:ring-offset-cream lg:hidden"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {/* Detail */}
      <Sheet open={selected !== null} onClose={() => setSelectedId(null)} title={t.detailTitle} width="lg">
        {selected && (
          <ReimbursementDetail
            request={selected}
            employeeName={empMap.get(selected.employeeId)?.name ?? "—"}
            canDecide={canDecide(selected)}
            canReset={canFinalize && selected.status !== "pending"}
            canRevise={selected.employeeId === currentEmployeeId && selected.status !== "approved"}
            busy={busy}
            onApprove={() => decide(selected, "approve")}
            onReject={() => setRejecting(selected)}
            onReset={() => decide(selected, "reset")}
            onRevise={() => {
              setSelectedId(null);
              setRevising(selected);
            }}
          />
        )}
      </Sheet>

      {/* Ajukan */}
      <Sheet open={requesting} onClose={() => setRequesting(false)} title={t.formTitle} width="lg">
        {requesting && currentEmployeeId && (
          <ReimbursementForm
            employees={employees}
            defaultEmployeeId={currentEmployeeId}
            canPickEmployee={canRequestForOthers}
            onSaved={(saved) => {
              setRequesting(false);
              setList((cur) => [saved, ...cur]);
              toast.success(t.created);
              router.refresh();
            }}
            onCancel={() => setRequesting(false)}
          />
        )}
      </Sheet>

      {/* Revisi oleh pengaju — form yang sama, terisi data lama. */}
      <Sheet
        open={revising !== null}
        onClose={() => setRevising(null)}
        title={t.reviseTitle}
        width="lg"
      >
        {revising && currentEmployeeId && (
          <ReimbursementForm
            item={revising}
            employees={employees}
            defaultEmployeeId={currentEmployeeId}
            canPickEmployee={false}
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
        title={t.rejectTitle}
        busy={busy}
        onCancel={() => setRejecting(null)}
        onConfirm={(reason) => rejecting && decide(rejecting, "reject", reason)}
      />
    </div>
  );
}
