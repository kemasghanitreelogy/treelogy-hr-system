"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Loader2 } from "lucide-react";
import { apiErrorMessage } from "@/lib/api-error";
import { normalizeWaPhone, PHONE_PROBLEM_TEXT } from "@/lib/qontak/phone";
import { courierKey, RESI_TEMPLATE_BY_COURIER, slotId, type WaTemplate } from "@/lib/qontak/template";
import { useLocale } from "@/components/layout/locale-context";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { CampaignRunner } from "./campaign-runner";

export interface ResiBlastItem {
  page: number;
  name: string;
  phone: string;
  awb: string;
  courier: string | null;
  /** Nomor resi dari barcode/teks PDF, atau sudah dicentang "diperiksa". */
  awbConfirmed: boolean;
}

/** "SITI AMINAH" → "Siti Aminah" — label kurir mencetak huruf besar semua,
 *  dan "Halo Kak SITI AMINAH!" terasa seperti dibentak. Nama yang sudah
 *  bercampur huruf besar-kecil dibiarkan apa adanya. */
export function tidyName(s: string): string {
  const v = s.trim().replace(/\s+/g, " ");
  if (!v || v !== v.toUpperCase()) return v;
  return v.toLowerCase().replace(/(^|[\s'.-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
}

const T = {
  id: {
    title: "Blast WhatsApp resi",
    desc: "Template dipilih otomatis per kurir. Periksa pesannya, lalu kirim.",
    preparing: "Menyusun daftar penerima…",
    excluded: "tidak ikut dikirim",
    noPhone: "tanpa nomor HP",
    noName: "nama penerima kosong",
    noAwb: "nomor resi kosong",
    unconfirmed: "resi hasil OCR belum dicentang “sudah diperiksa”",
    noCourier: "kurir tidak dikenali (hanya J&T, Lion, JNE)",
    noTemplate: "template resi kurir ini tidak ada di Qontak",
    nothing: "Tidak ada halaman yang bisa dikirimi.",
    page: "hal.",
  },
  en: {
    title: "WhatsApp tracking blast",
    desc: "Templates are picked per courier automatically. Check the message, then send.",
    preparing: "Building the recipient list…",
    excluded: "not included",
    noPhone: "no phone number",
    noName: "recipient name is empty",
    noAwb: "tracking number is empty",
    unconfirmed: "OCR tracking number not marked “verified”",
    noCourier: "unknown courier (only J&T, Lion, JNE)",
    noTemplate: "this courier's tracking template isn't in Qontak",
    nothing: "No page can be messaged.",
    page: "p.",
  },
};

/**
 * Blast resi dari hasil Receipt Sales — tiga ketukan: buka, "Kirim N pesan",
 * konfirmasi. Draft dibuat otomatis saat sheet dibuka (draft tidak mengirim
 * apa pun; yang ditinggal dibersihkan server setelah sehari).
 */
export function ResiBlastSheet({ open, onClose, items }: { open: boolean; onClose: () => void; items: ResiBlastItem[] }) {
  const locale = useLocale();
  const t = T[locale];
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [ids, setIds] = useState<string[] | null>(null);
  const [excluded, setExcluded] = useState<{ page: number; name: string; reason: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);
  // Satu batch draft per pembukaan sheet — bukan per render.
  const started = useRef(false);
  const snapshot = useMemo(() => (open ? items : []), [open, items]);

  useEffect(() => {
    if (!open) {
      started.current = false;
      setIds(null); setExcluded([]); setError(null); setShowExcluded(false);
      return;
    }
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        const res = await fetch("/api/wa-blast/templates", { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw Object.assign(new Error("tpl"), { code: json?.error, status: res.status });
        const byName = new Map((json.templates as WaTemplate[]).map((x) => [x.name, x]));

        const out: { page: number; name: string; reason: string }[] = [];
        const groups = new Map<string, { tpl: WaTemplate; recipients: { phone: string; name: string; awb: string; vals: Record<string, string> }[] }>();
        for (const it of snapshot) {
          const name = tidyName(it.name);
          const awb = it.awb.trim().toUpperCase();
          const skip = (reason: string) => out.push({ page: it.page, name, reason });
          const p = normalizeWaPhone(it.phone);
          if (!it.phone.trim()) { skip(t.noPhone); continue; }
          if (!p.ok) { skip(PHONE_PROBLEM_TEXT[p.problem][locale]); continue; }
          if (!awb) { skip(t.noAwb); continue; }
          if (!it.awbConfirmed) { skip(t.unconfirmed); continue; }
          const ck = courierKey(it.courier);
          if (!ck) { skip(t.noCourier); continue; }
          const tpl = byName.get(RESI_TEMPLATE_BY_COURIER[ck]);
          if (!tpl) { skip(t.noTemplate); continue; }
          if (!name && tpl.slots.some((s) => s.meaning === "name")) { skip(t.noName); continue; }
          // Variabel diisi menurut MAKNANYA — urutan {{1}}/{{2}} Lion
          // kebalikan J&T/JNE, dan menebak dari urutan pasti salah di satunya.
          const vals: Record<string, string> = {};
          for (const s of tpl.slots) vals[slotId(s)] = s.meaning === "name" ? name : s.meaning === "awb" ? awb : "";
          const g = groups.get(tpl.id) ?? { tpl, recipients: [] };
          // "+" wajib: server menormalisasi ulang, dan tanpa "+" nomor
          // luar negeri (65…, 60…) tak bisa dibedakan dari nomor lokal rusak.
          g.recipients.push({ phone: "+" + p.phone, name, awb, vals });
          groups.set(tpl.id, g);
        }
        setExcluded(out);
        if (!groups.size) { setIds([]); return; }

        const created: string[] = [];
        for (const g of groups.values()) {
          const r = await fetch("/api/wa-blast/campaigns", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source: "receipt", templateId: g.tpl.id, recipients: g.recipients }),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw Object.assign(new Error("create"), { code: j?.error, status: r.status });
          created.push(j.id);
          // Penolakan server (mis. duplikat) ikut disebut, tidak disembunyikan.
          for (const rej of j.rejected ?? []) out.push({ page: 0, name: rej.name, reason: rej.reason });
        }
        setExcluded([...out]);
        setIds(created);
      } catch (e) {
        const err = e as { code?: string; status?: number };
        const msg = apiErrorMessage(err.code, locale, err.status);
        setError(msg);
        toastRef.current.error(msg);
      }
    })();
  }, [open, snapshot, locale, t]);

  const groupsExcluded = useMemo(() => {
    const m = new Map<string, typeof excluded>();
    for (const x of excluded) m.set(x.reason, [...(m.get(x.reason) ?? []), x]);
    return [...m];
  }, [excluded]);

  return (
    <Sheet open={open} onClose={onClose} title={t.title} description={t.desc} width="lg">
      <div className="space-y-4">
        {excluded.length > 0 && (
          <div className="rounded-2xl border border-[#e8d9a8] bg-gold-soft/60 px-4 py-3 text-sm text-[#8a6512]">
            <button type="button" onClick={() => setShowExcluded((v) => !v)} className="flex w-full cursor-pointer items-center justify-between gap-2 text-left font-medium" aria-expanded={showExcluded}>
              <span className="flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> {excluded.length} {t.excluded}</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showExcluded ? "rotate-180" : ""}`} />
            </button>
            {showExcluded && (
              <ul className="mt-2 space-y-1.5 text-xs">
                {groupsExcluded.map(([reason, rows]) => (
                  <li key={reason}>
                    <span className="font-semibold">{reason}</span> ({rows.length}):{" "}
                    {rows.slice(0, 30).map((r) => (r.page ? `${t.page} ${r.page}` : r.name || "—")).join(", ")}
                    {rows.length > 30 ? "…" : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {error ? (
          <p className="rounded-2xl bg-clay-soft/50 px-4 py-6 text-center text-sm text-[#8c3c1f]">{error}</p>
        ) : ids === null ? (
          <div className="hf-checking flex items-center justify-center gap-2 rounded-2xl px-4 py-16 text-sm font-medium text-forest-700" role="status">
            <Loader2 className="h-4 w-4 animate-spin" /> {t.preparing}
          </div>
        ) : ids.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">{t.nothing}</p>
        ) : (
          <CampaignRunner campaignIds={ids} />
        )}
      </div>
    </Sheet>
  );
}
