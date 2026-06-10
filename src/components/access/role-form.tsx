"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { ALL_PERMISSION_IDS, PERMISSION_GROUPS, type Role } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

const COLORS = ["#3d5a2e", "#6b7548", "#8ba859", "#4a7ba6", "#e0a82e", "#c2603f"];

export function RoleForm({
  role,
  onSubmit,
  onCancel,
}: {
  role: Role | null; // null = create
  onSubmit: (r: Role) => void;
  onCancel: () => void;
}) {
  const adminLocked = role?.id === "role-admin";
  const toast = useToast();
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [color, setColor] = useState(role?.color ?? COLORS[0]);
  const [perms, setPerms] = useState<Set<string>>(
    new Set(role?.permissionIds ?? ["dashboard.view"]),
  );

  function toggle(id: string) {
    if (adminLocked) return;
    setPerms((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleGroup(ids: string[], allOn: boolean) {
    if (adminLocked) return;
    setPerms((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
      return next;
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // Validation — gives a real "tidak berhasil" path via toast.
    if (!name.trim()) {
      toast.error("Nama peran wajib diisi.");
      return;
    }
    if (!adminLocked && perms.size === 0) {
      toast.error("Pilih minimal satu hak akses.");
      return;
    }
    onSubmit({
      id: role?.id ?? "role-" + Date.now().toString(36),
      name: name.trim(),
      description,
      color,
      system: role?.system,
      permissionIds: adminLocked ? [...ALL_PERMISSION_IDS] : Array.from(perms),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Field label="Nama peran" htmlFor="r-name">
        <Input id="r-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="cth. Supervisor Pabrik" disabled={role?.system} />
      </Field>
      <Field label="Deskripsi">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ringkasan tanggung jawab peran ini…" />
      </Field>
      <Field label="Warna label">
        <div className="flex gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Warna ${c}`}
              className={cn(
                "h-8 w-8 cursor-pointer rounded-full ring-2 ring-offset-2 ring-offset-cream transition",
                color === c ? "ring-ink" : "ring-transparent",
              )}
              style={{ background: c }}
            />
          ))}
        </div>
      </Field>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Hak Akses</h3>
          <span className="text-xs text-faint">
            {adminLocked ? "Semua (terkunci)" : `${perms.size} dari ${ALL_PERMISSION_IDS.length} dipilih`}
          </span>
        </div>
        {adminLocked && (
          <p className="mb-3 flex items-center gap-2 rounded-xl bg-forest-100 px-3 py-2 text-xs text-forest-700">
            <Lock className="h-3.5 w-3.5" /> Peran Administrator selalu memiliki seluruh hak akses.
          </p>
        )}
        <div className="space-y-3">
          {PERMISSION_GROUPS.map((g) => {
            const ids = g.permissions.map((p) => p.id);
            const allOn = ids.every((id) => perms.has(id));
            const someOn = ids.some((id) => perms.has(id));
            return (
              <div key={g.module} className="rounded-2xl border border-line bg-panel p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">{g.label}</span>
                  <button
                    type="button"
                    onClick={() => toggleGroup(ids, allOn)}
                    disabled={adminLocked}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                      adminLocked ? "cursor-not-allowed text-faint" : "cursor-pointer text-forest-600 hover:bg-forest-100",
                    )}
                  >
                    {allOn ? "Hapus semua" : someOn ? "Pilih semua" : "Pilih semua"}
                  </button>
                </div>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {g.permissions.map((p) => {
                    const on = perms.has(p.id) || adminLocked;
                    return (
                      <label
                        key={p.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-colors",
                          on ? "bg-[#e9f0d8] text-forest-700" : "text-muted hover:bg-sand/60",
                          adminLocked && "cursor-not-allowed",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(p.id)}
                          disabled={adminLocked}
                          className="h-4 w-4 shrink-0 cursor-pointer accent-[#3d5a2e]"
                        />
                        {p.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
          Batal
        </Button>
        <Button type="submit" className="flex-1">
          {role ? "Simpan perubahan" : "Buat peran"}
        </Button>
      </div>
    </form>
  );
}
