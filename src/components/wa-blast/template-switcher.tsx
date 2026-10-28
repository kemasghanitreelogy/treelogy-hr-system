"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Loader2, Search, Sparkles, X } from "lucide-react";
import { humanTemplateName, renderPreview, slotId, type WaTemplate } from "@/lib/qontak/template";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/layout/locale-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WaBubble, WaPhone } from "./wa-bubble";

const T = {
  id: {
    title: "Ganti template",
    back: "Kembali ke pratinjau",
    forN: "untuk {n} penerima",
    now: "Dipakai sekarang",
    search: "Cari nama atau isi template…",
    count: "{n} template",
    none: "Tidak ada template yang cocok dengan “{q}”.",
    clear: "Hapus pencarian",
    name: "Nama",
    awb: "Resi",
    fill: "isi manual",
    auto: "Terisi otomatis",
    unsupported: "Belum bisa dikirim dari sini",
    constTitle: "Isian yang sama untuk semua penerima",
    constHint: "Variabel ini tidak ada di data resi, jadi isinya dipakai untuk semua pesan.",
    media: "URL gambar/berkas header (https://…)",
    apply: "Pakai template ini",
    same: "Template ini sedang dipakai",
    previewFor: "Contoh untuk",
    keys: "↑↓ pilih · Enter pakai · Esc kembali",
  },
  en: {
    title: "Change template",
    back: "Back to preview",
    forN: "for {n} recipients",
    now: "In use",
    search: "Search template name or text…",
    count: "{n} templates",
    none: "No template matches “{q}”.",
    clear: "Clear search",
    name: "Name",
    awb: "Tracking",
    fill: "manual input",
    auto: "Filled automatically",
    unsupported: "Can't be sent from here yet",
    constTitle: "Same value for every recipient",
    constHint: "These variables aren't in the shipping data, so this value is used for every message.",
    media: "Header image/file URL (https://…)",
    apply: "Use this template",
    same: "This template is already in use",
    previewFor: "Example for",
    keys: "↑↓ select · Enter apply · Esc back",
  },
};

export interface SwitchSample { name: string; awb: string; phone: string }

/** Nilai satu variabel untuk satu penerima — menurut MAKNA, bukan urutan. */
export function slotValue(s: WaTemplate["slots"][number], r: { name: string; awb: string }, consts: Record<string, string>): string {
  if (s.meaning === "name") return r.name;
  if (s.meaning === "awb") return r.awb;
  return consts[slotId(s)] ?? "";
}

/** Template yang semua variabelnya terisi dari data resi naik ke atas. */
function rank(tpl: WaTemplate): number {
  if (tpl.unsupported) return 3;
  if (tpl.mediaHeader) return 2;
  return tpl.slots.some((s) => s.meaning === "custom") ? 1 : 0;
}

function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="rounded bg-gold-soft px-0.5 text-ink">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

/**
 * Ganti template satu kampanye draft tanpa keluar dari pratinjau: cari →
 * lihat langsung di ponsel dengan data penerima sungguhan → pakai.
 * Variabel yang tidak bisa diisi dari data resi diminta SEKALI (berlaku untuk
 * semua penerima) — tidak pernah dibiarkan kosong sampai ditolak Qontak.
 */
export function TemplateSwitcher({
  templates, currentId, count, sample, busy, onCancel, onApply,
}: {
  templates: WaTemplate[];
  currentId: string;
  count: number;
  sample: SwitchSample | null;
  busy: boolean;
  onCancel: () => void;
  onApply: (tpl: WaTemplate, consts: Record<string, string>, media: string | null) => void;
}) {
  const locale = useLocale();
  const t = T[locale];
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(currentId);
  const [consts, setConsts] = useState<Record<string, string>>({});
  const [media, setMedia] = useState("");

  useEffect(() => { inputRef.current?.focus(); }, []);

  const q = query.trim().toLowerCase();
  const list = useMemo(() => {
    const words = q.split(/\s+/).filter(Boolean);
    return templates
      .filter((x) => {
        const hay = `${x.name} ${humanTemplateName(x.name)} ${x.body}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId) || rank(a) - rank(b) || humanTemplateName(a.name).localeCompare(humanTemplateName(b.name)));
  }, [templates, q, currentId]);

  // Sorotan selalu menunjuk template yang terlihat; saat pencarian
  // menyembunyikannya, pindah ke hasil teratas yang bisa dipakai.
  useEffect(() => {
    if (list.some((x) => x.id === activeId)) return;
    const first = list.find((x) => !x.unsupported) ?? list[0];
    if (first) setActiveId(first.id);
  }, [list, activeId]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-tpl="${CSS.escape(activeId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  const active = templates.find((x) => x.id === activeId) ?? null;
  const custom = active?.slots.filter((s) => s.meaning === "custom") ?? [];
  const mediaOk = !active?.mediaHeader || /^https:\/\/\S+$/.test(media.trim());
  const ready = Boolean(active && !active.unsupported && active.id !== currentId && mediaOk && custom.every((s) => (consts[slotId(s)] ?? "").trim()));
  const vals = useMemo(() => {
    const v: Record<string, string> = {};
    if (active) for (const s of active.slots) v[slotId(s)] = slotValue(s, sample ?? { name: "", awb: "" }, consts);
    return v;
  }, [active, sample, consts]);

  function apply() {
    if (!active || !ready || busy) return;
    onApply(active, Object.fromEntries(custom.map((s) => [slotId(s), (consts[slotId(s)] ?? "").trim()])), active.mediaHeader ? media.trim() : null);
  }

  function onKey(e: React.KeyboardEvent) {
    const usable = list.filter((x) => !x.unsupported);
    const i = usable.findIndex((x) => x.id === activeId);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = usable[(i + (e.key === "ArrowDown" ? 1 : -1) + usable.length) % usable.length];
      if (next) setActiveId(next.id);
    } else if (e.key === "Enter") {
      e.preventDefault();
      apply();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (query) setQuery(""); else onCancel();
    }
  }

  return (
    <div className="fulfill-pop space-y-4">
      <div className="flex items-start gap-3">
        <Button variant="outline" size="icon" aria-label={t.back} onClick={onCancel}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <p className="text-base font-semibold text-ink">{t.title}</p>
          <p className="text-sm text-muted">{t.forN.replace("{n}", String(count))}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <div className="min-w-0 rounded-2xl border border-line bg-panel">
          <div className="border-b border-line p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <input
                ref={inputRef}
                role="combobox"
                aria-expanded
                aria-controls={listId}
                aria-activedescendant={`${listId}-${activeId}`}
                aria-label={t.search}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKey}
                placeholder={t.search}
                className="h-11 w-full rounded-xl border border-line bg-cream/40 pl-9 pr-10 text-base text-ink placeholder:text-faint focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-200 sm:text-sm"
              />
              {query && (
                <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus(); }} aria-label={t.clear}
                  className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-faint hover:bg-sand/60 hover:text-ink">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="mt-2 flex justify-between text-[11px] text-faint">
              <span aria-live="polite">{t.count.replace("{n}", String(list.length))}</span>
              <span className="hidden sm:inline">{t.keys}</span>
            </p>
          </div>

          {list.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted">
              <p>{t.none.replace("{q}", query.trim())}</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setQuery("")}>{t.clear}</Button>
            </div>
          ) : (
            <ul ref={listRef} id={listId} role="listbox" aria-label={t.title} className="max-h-[52vh] space-y-1 overflow-y-auto p-2 lg:max-h-[480px]">
              {list.map((x, i) => {
                const on = x.id === activeId;
                const isNow = x.id === currentId;
                return (
                  <li
                    key={x.id}
                    id={`${listId}-${x.id}`}
                    data-tpl={x.id}
                    role="option"
                    aria-selected={on}
                    aria-disabled={Boolean(x.unsupported)}
                    onClick={() => !x.unsupported && setActiveId(x.id)}
                    className={cn(
                      "stagger-item relative rounded-xl border px-3 py-2.5 transition-[background-color,border-color,box-shadow] duration-200",
                      x.unsupported ? "cursor-not-allowed border-transparent opacity-55" : "cursor-pointer",
                      on ? "border-forest-500 bg-forest-50 shadow-[0_0_0_3px_rgba(61,90,46,0.12)]" : !x.unsupported && "border-transparent hover:bg-sand/50",
                    )}
                    style={{ ["--i" as string]: Math.min(i, 8) }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink"><Highlight text={humanTemplateName(x.name)} q={q} /></p>
                        <p className="truncate font-mono text-[11px] text-faint"><Highlight text={x.name} q={q} /></p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {isNow && <Badge tone="neutral">{t.now}</Badge>}
                        <span className={cn("grid h-5 w-5 place-items-center rounded-full border transition-colors", on ? "border-forest-600 bg-forest-600 text-cream" : "border-line")}>
                          {on && <Check className="h-3 w-3" />}
                        </span>
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted">{x.body}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {x.unsupported ? (
                        <span className="text-[11px] text-[#8a6512]">{t.unsupported}</span>
                      ) : (
                        x.slots.map((s) => (
                          <span key={slotId(s)} className={cn(
                            "rounded-full px-2 py-0.5 text-[10.5px] font-medium",
                            s.meaning === "custom" ? "bg-gold-soft text-[#8a6512]" : "bg-[#e9f0d8] text-forest-700",
                          )}>
                            {s.meaning === "name" ? `${t.name} ✓` : s.meaning === "awb" ? `${t.awb} ✓` : `{{${s.key}}} ${t.fill}`}
                          </span>
                        ))
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Ponsel — template terpilih dengan data penerima sungguhan. */}
        <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <WaPhone title={sample?.name || "—"} subtitle={sample ? `${t.previewFor} ${sample.phone}` : undefined}>
            {active && (
              <div key={active.id} className="fulfill-pop">
                <WaBubble text={renderPreview(active, vals)} buttons={active.buttons} media={active.mediaHeader} footer={active.footer} />
              </div>
            )}
          </WaPhone>

          {active && !active.unsupported && custom.length === 0 && !active.mediaHeader && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-forest-700"><Sparkles className="h-3.5 w-3.5" /> {t.auto}</p>
          )}

          {active && !active.unsupported && (custom.length > 0 || active.mediaHeader) && (
            <div key={active.id} className="fulfill-pop space-y-2.5 rounded-2xl border border-[#e8d9a8] bg-gold-soft/40 p-3">
              <div>
                <p className="text-sm font-semibold text-ink">{t.constTitle}</p>
                <p className="text-xs text-muted">{t.constHint}</p>
              </div>
              {custom.map((s) => (
                <label key={slotId(s)} className="block">
                  <span className="mb-1 block text-xs font-medium text-ink">
                    {`{{${s.key}}}`}{s.context ? <span className="font-normal text-muted"> · {s.context}</span> : null}
                  </span>
                  <input
                    value={consts[slotId(s)] ?? ""}
                    onChange={(e) => setConsts((c) => ({ ...c, [slotId(s)]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } }}
                    className="h-10 w-full rounded-lg border border-line bg-panel px-3 text-base text-ink focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-200 sm:text-sm"
                  />
                </label>
              ))}
              {active.mediaHeader && (
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-ink">{t.media}</span>
                  <input
                    value={media}
                    onChange={(e) => setMedia(e.target.value)}
                    inputMode="url"
                    placeholder="https://"
                    aria-invalid={Boolean(media) && !mediaOk}
                    className="h-10 w-full rounded-lg border border-line bg-panel px-3 font-mono text-base text-ink focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-200 aria-[invalid=true]:border-clay sm:text-sm"
                  />
                </label>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 -mx-1 flex flex-col gap-2 rounded-2xl border border-line bg-panel/95 p-3 shadow-[0_-8px_24px_-16px_rgba(29,42,34,0.35)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0 truncate text-xs text-muted">
          {active ? (active.id === currentId ? t.same : humanTemplateName(active.name)) : ""}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>{t.back}</Button>
          <Button size="lg" onClick={apply} disabled={!ready || busy} className="sm:min-w-52">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {t.apply}
          </Button>
        </div>
      </div>
    </div>
  );
}
