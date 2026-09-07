"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, XCircle } from "lucide-react";
import { apiErrorMessage } from "@/lib/api-error";
import { saveBlobAsFile } from "@/lib/download";
import type { Locale } from "@/lib/i18n";
import { ImportParseError, parseImportFile, templateCsv, type ImportRow, type ParsedImport } from "@/lib/eligible-customers/parse";
import type { EligibleState, GrantInput, GrantResult } from "@/lib/eligible-customers/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { runBulk, tally } from "./run-bulk";
import { STR } from "./strings";

type Step =
  | { kind: "pick"; error?: string }
  | { kind: "parsing" }
  | { kind: "preview"; parsed: ParsedImport; fileName: string }
  | { kind: "running"; rows: ImportRow[]; done: number; total: number; results: GrantResult[] }
  | { kind: "done"; rows: ImportRow[]; results: GrantResult[] };

const ACCEPT = ".csv,.tsv,.txt,.xlsx,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function ImportSheet({
  locale,
  open,
  onClose,
  onState,
}: {
  locale: Locale;
  open: boolean;
  onClose: () => void;
  onState: (s: EligibleState) => void;
}) {
  const t = STR[locale];
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>({ kind: "pick" });

  const busy = step.kind === "running" || step.kind === "parsing";

  function close() {
    if (busy) return;
    setStep({ kind: "pick" });
    onClose();
  }

  async function pick(file: File | null) {
    if (!file) return;
    setStep({ kind: "parsing" });
    try {
      const parsed = await parseImportFile(file);
      setStep({ kind: "preview", parsed, fileName: file.name });
    } catch (e) {
      const code = e instanceof ImportParseError ? e.code : "failed";
      const msg =
        code === "empty" ? t.parseEmpty
        : code === "no_email_column" ? t.parseNoEmail
        : code === "unsupported" ? t.parseUnsupported
        : t.parseFailed;
      setStep({ kind: "pick", error: msg });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function process(parsed: ParsedImport) {
    const rows = parsed.rows.filter((r) => !r.problem);
    if (!rows.length) return;
    const inputs: GrantInput[] = rows.map((r) => ({
      email: r.email,
      firstName: r.firstName,
      lastName: r.lastName,
      tags: r.tags,
      source: "import",
    }));
    setStep({ kind: "running", rows, done: 0, total: rows.length, results: [] });
    const results = await runBulk(
      inputs,
      (p) => setStep({ kind: "running", rows, done: p.done, total: p.total, results: p.results }),
      onState,
    );
    setStep({ kind: "done", rows, results });
    const n = tally(results);
    toast.success(`${t.importDone}: ${n.seeded} ${t.resSeeded}, ${n.pending} ${t.resPending}, ${n.failedSeed + n.error} ${t.filterFailed.toLowerCase()}`);
  }

  function downloadTemplate() {
    saveBlobAsFile(new Blob([templateCsv()], { type: "text/csv;charset=utf-8" }), "contoh-pelanggan-eligible.csv");
  }

  function downloadReport(rows: ImportRow[], results: GrantResult[]) {
    const esc = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const lines = ["email,nama_depan,nama_belakang,status,keterangan"];
    results.forEach((r, i) => {
      const row = rows[i];
      const status = !r.ok ? "error" : r.customer?.seedStatus ?? "pending";
      const note = !r.ok
        ? [apiErrorMessage(r.error, locale), r.detail].filter(Boolean).join(" ")
        : r.customer?.seedError ? apiErrorMessage(r.customer.seedError, locale) : "";
      lines.push([r.email, row?.firstName ?? "", row?.lastName ?? "", status, note].map(esc).join(","));
    });
    saveBlobAsFile(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }), "laporan-impor-pelanggan-eligible.csv");
  }

  return (
    <Sheet open={open} onClose={close} title={t.importTitle} description={t.importLead} width="lg">
      <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} />

      {(step.kind === "pick" || step.kind === "parsing") && (
        <div className="space-y-3">
          <button
            type="button"
            disabled={step.kind === "parsing"}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0] ?? null); }}
            className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line bg-cream/40 px-4 py-10 text-center transition hover:border-forest-300 hover:bg-forest-100/40 disabled:opacity-60"
          >
            {step.kind === "parsing" ? (
              <Loader2 className="h-8 w-8 animate-spin text-forest-600" />
            ) : (
              <FileSpreadsheet className="h-8 w-8 text-forest-600" />
            )}
            <span className="text-sm font-semibold text-ink">{step.kind === "parsing" ? t.parsing : t.pickFile}</span>
            <span className="max-w-sm text-xs text-muted">{t.dropHint}</span>
          </button>
          {step.kind === "pick" && step.error && (
            <p role="alert" className="rounded-xl bg-clay-soft px-3 py-2 text-sm text-[#8c3c1f]">{step.error}</p>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={downloadTemplate}>
            <Download className="h-4 w-4" /> {t.template}
          </Button>
        </div>
      )}

      {step.kind === "preview" && <Preview t={t} parsed={step.parsed} fileName={step.fileName}
        onChange={() => fileRef.current?.click()} onProcess={() => process(step.parsed)} />}

      {step.kind === "running" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-ink">{t.running}</span>
            <span className="tabular-nums text-muted">{step.done}/{step.total} {t.progress}</span>
          </div>
          <Progress value={step.done} max={step.total} />
          <p className="text-xs text-faint">{t.runningHint}</p>
          <ResultList t={t} locale={locale} rows={step.rows} results={step.results} />
        </div>
      )}

      {step.kind === "done" && (
        <div className="space-y-3">
          <Summary t={t} results={step.results} />
          <ResultList t={t} locale={locale} rows={step.rows} results={step.results} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => downloadReport(step.rows, step.results)}>
              <Download className="h-4 w-4" /> {t.downloadReport}
            </Button>
            <Button type="button" size="sm" onClick={close}>{t.close}</Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function Preview({
  t, parsed, fileName, onChange, onProcess,
}: {
  t: Record<string, string>;
  parsed: ParsedImport;
  fileName: string;
  onChange: () => void;
  onProcess: () => void;
}) {
  const valid = parsed.rows.filter((r) => !r.problem).length;
  const invalid = parsed.rows.filter((r) => r.problem === "invalid_email").length;
  const dup = parsed.rows.filter((r) => r.problem === "duplicate").length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <FileSpreadsheet className="h-4 w-4 text-forest-600" />
        <span className="min-w-0 flex-1 truncate font-medium text-ink">{fileName}</span>
        <Button type="button" variant="ghost" size="sm" onClick={onChange}>{t.changeFile}</Button>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-[#e9f0d8] px-2.5 py-1 font-medium text-forest-700">{valid} {t.previewValid}</span>
        {invalid > 0 && <span className="rounded-full bg-clay-soft px-2.5 py-1 font-medium text-[#8c3c1f]">{invalid} {t.previewInvalid}</span>}
        {dup > 0 && <span className="rounded-full bg-gold-soft px-2.5 py-1 font-medium text-[#8a6512]">{dup} {t.previewDup}</span>}
      </div>

      <div className="max-h-[45vh] overflow-auto rounded-xl border border-line">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-panel text-faint">
            <tr>
              <th className="px-2 py-1.5 font-medium">#</th>
              <th className="px-2 py-1.5 font-medium">{t.email}</th>
              <th className="px-2 py-1.5 font-medium">{t.firstName} / {t.lastName}</th>
            </tr>
          </thead>
          <tbody>
            {parsed.rows.map((r) => (
              <tr key={r.line} className={cn("border-t border-line", r.problem && "bg-clay-soft/40")}>
                <td className="px-2 py-1.5 tabular-nums text-faint">{r.line}</td>
                <td className="px-2 py-1.5">
                  <div className="font-medium text-ink break-all">{r.email || "—"}</div>
                  {r.problem && (
                    <div className="mt-0.5 inline-flex items-center gap-1 text-[#8c3c1f]">
                      <AlertTriangle className="h-3 w-3" />
                      {r.problem === "invalid_email" ? t.problemInvalid : t.problemDup}
                    </div>
                  )}
                </td>
                <td className="px-2 py-1.5 text-ink-soft">{[r.firstName, r.lastName].filter(Boolean).join(" ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button type="button" className="w-full" disabled={valid === 0} onClick={onProcess}>
        <Upload className="h-4 w-4" /> {t.process} {valid} {t.rows}
      </Button>
    </div>
  );
}

function Summary({ t, results }: { t: Record<string, string>; results: GrantResult[] }) {
  const n = tally(results);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat tone="matcha" icon={CheckCircle2} n={n.seeded} label={t.resSeeded} />
      <Stat tone="gold" icon={AlertTriangle} n={n.pending} label={t.resPending} />
      <Stat tone="clay" icon={AlertTriangle} n={n.failedSeed} label={t.resFailedSeed} />
      <Stat tone="clay" icon={XCircle} n={n.error} label={t.resError} />
    </div>
  );
}

function Stat({ tone, icon: Icon, n, label }: { tone: "matcha" | "gold" | "clay"; icon: typeof CheckCircle2; n: number; label: string }) {
  const cls = { matcha: "bg-[#e9f0d8] text-forest-700", gold: "bg-gold-soft text-[#8a6512]", clay: "bg-clay-soft text-[#8c3c1f]" }[tone];
  return (
    <div className={cn("rounded-xl px-3 py-2", cls)}>
      <div className="flex items-center gap-1.5 text-lg font-bold tabular-nums"><Icon className="h-4 w-4" />{n}</div>
      <div className="text-xs font-medium opacity-80">{label}</div>
    </div>
  );
}

function ResultList({
  t, locale, rows, results,
}: { t: Record<string, string>; locale: Locale; rows: ImportRow[]; results: GrantResult[] }) {
  if (!results.length) return null;
  return (
    <ul className="max-h-[40vh] space-y-1 overflow-auto rounded-xl border border-line bg-panel p-2 text-xs">
      {results.map((r, i) => {
        const ok = r.ok && r.customer?.seedStatus === "seeded";
        const warn = r.ok && r.customer?.seedStatus !== "seeded";
        const note = !r.ok
          ? [apiErrorMessage(r.error, locale), r.detail].filter(Boolean).join(" ")
          : warn ? apiErrorMessage(r.customer?.seedError, locale) : null;
        return (
          <li key={`${r.email}-${i}`} className="flex items-start gap-2 rounded-lg px-2 py-1.5">
            {ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-forest-600" />
              : warn ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8a6512]" />
              : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8c3c1f]" />}
            <div className="min-w-0 flex-1">
              <div className="break-all font-medium text-ink">
                {r.email}
                <span className="ml-1 text-faint">{t.previewLine} {rows[i]?.line}</span>
              </div>
              {note && <div className="text-muted">{note}</div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
