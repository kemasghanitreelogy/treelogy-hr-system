"use client";

import { useMemo, useState } from "react";
import { Crown, Search, ShieldCheck } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { apiErrorMessage } from "@/lib/api-error";
import type { SuperAdminAccount } from "@/lib/super-admin";
import type { Locale } from "@/lib/i18n";

const STR = {
  id: {
    title: "Super Admin",
    desc: "Kelola siapa saja yang punya akses super admin. Menu khusus super admin hanya muncul untuk mereka.",
    search: "Cari nama atau email…",
    root: "Root",
    you: "Anda",
    on: "Aktif",
    off: "Nonaktif",
    empty: "Tidak ada akun.",
    grantTitle: (n: string) => `Jadikan ${n} super admin?`,
    grantMsg: "Mereka akan bisa melihat & mengakses semua menu khusus super admin.",
    revokeTitle: (n: string) => `Cabut akses super admin ${n}?`,
    revokeMsg: "Menu khusus super admin akan langsung hilang untuk mereka.",
    grantConfirm: "Ya, jadikan",
    revokeConfirm: "Ya, cabut",
    granted: "Akses super admin diberikan ✓",
    revoked: "Akses super admin dicabut ✓",
    rootLocked: "Akun root tidak bisa diubah.",
    fail: "Gagal memperbarui akses.",
  },
  en: {
    title: "Super Admin",
    desc: "Manage who has super-admin access. Super-admin-only menus appear only for them.",
    search: "Search name or email…",
    root: "Root",
    you: "You",
    on: "On",
    off: "Off",
    empty: "No accounts.",
    grantTitle: (n: string) => `Make ${n} a super admin?`,
    grantMsg: "They'll be able to see and use every super-admin-only menu.",
    revokeTitle: (n: string) => `Revoke ${n}'s super-admin access?`,
    revokeMsg: "Super-admin-only menus disappear for them immediately.",
    grantConfirm: "Yes, grant",
    revokeConfirm: "Yes, revoke",
    granted: "Super-admin access granted ✓",
    revoked: "Super-admin access revoked ✓",
    rootLocked: "The root account can't be changed.",
    fail: "Failed to update access.",
  },
} as const;

export function SuperAdminView({
  accounts,
  currentUserId,
  locale,
}: {
  accounts: SuperAdminAccount[];
  currentUserId: string;
  locale: Locale;
}) {
  const t = STR[locale];
  const toast = useToast();
  const [list, setList] = useState(accounts);
  const [q, setQ] = useState("");
  const [pending, setPending] = useState<SuperAdminAccount | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter((a) => a.name.toLowerCase().includes(term) || a.email.toLowerCase().includes(term));
  }, [list, q]);

  async function apply(target: SuperAdminAccount) {
    const value = !target.isSuperAdmin;
    setBusy(true);
    try {
      const res = await fetch("/api/super-admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: target.id, value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        toast.error(data?.error === "root_locked" ? t.rootLocked : apiErrorMessage(data?.error, locale, res.status));
        return;
      }
      setList((cur) => cur.map((a) => (a.id === target.id ? { ...a, isSuperAdmin: value } : a)));
      toast.success(value ? t.granted : t.revoked);
      setPending(null);
    } catch {
      toast.error(t.fail);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 fade-up">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold text-ink sm:text-2xl">
          <Crown className="h-6 w-6 text-gold" /> {t.title}
        </h2>
        <p className="max-w-2xl text-sm text-muted">{t.desc}</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.search}
          className="w-full rounded-xl border border-line bg-panel py-2 pl-9 pr-3 text-sm text-ink outline-none focus:border-forest-400"
        />
      </div>

      <div className="card divide-y divide-line overflow-hidden">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-faint">{t.empty}</p>
        ) : (
          filtered.map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cream text-xs font-bold text-forest-700">
                {a.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink">
                  {a.name}
                  {a.isRoot && <Badge tone="gold">{t.root}</Badge>}
                  {a.id === currentUserId && !a.isRoot && <Badge tone="neutral">{t.you}</Badge>}
                </p>
                <p className="truncate text-xs text-muted">{a.email || "—"}</p>
              </div>
              {a.isSuperAdmin && !a.isRoot && <ShieldCheck className="h-4 w-4 shrink-0 text-forest-600" />}
              <Toggle
                on={a.isSuperAdmin}
                disabled={a.isRoot || busy}
                label={t.title}
                onClick={() => setPending(a)}
              />
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={pending ? (pending.isSuperAdmin ? t.revokeTitle(pending.name) : t.grantTitle(pending.name)) : ""}
        message={pending ? (pending.isSuperAdmin ? t.revokeMsg : t.grantMsg) : ""}
        confirmLabel={pending?.isSuperAdmin ? t.revokeConfirm : t.grantConfirm}
        tone={pending?.isSuperAdmin ? "danger" : "primary"}
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => pending && apply(pending)}
      />
    </div>
  );
}

function Toggle({ on, disabled, label, onClick }: { on: boolean; disabled?: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-forest-600" : "bg-line"} ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${on ? "translate-x-[22px]" : "translate-x-0.5"}`} />
    </button>
  );
}
