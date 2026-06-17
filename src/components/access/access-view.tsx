"use client";

import { useMemo, useState } from "react";
import { Lock, Pencil, Plus, Search, Shield, ShieldCheck, Trash2, Users } from "lucide-react";
import type { Role, SystemUser } from "@/lib/rbac";
import type { Employee } from "@/lib/types";
import { ALL_PERMISSION_IDS } from "@/lib/rbac";
import { cn, formatDate } from "@/lib/utils";
import { apiErrorMessage } from "@/lib/api-error";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { RoleForm } from "./role-form";

type Tab = "roles" | "users";
type EmpLite = Pick<Employee, "id" | "name" | "position" | "team">;

export function AccessView({
  roles: initialRoles,
  users: initialUsers,
  employees,
}: {
  roles: Role[];
  users: SystemUser[];
  employees: EmpLite[];
}) {
  const [tab, setTab] = useState<Tab>("roles");
  const [roles, setRoles] = useState(initialRoles);
  const [users, setUsers] = useState(initialUsers);
  const toast = useToast();

  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const countByRole = useMemo(() => {
    const m = new Map<string, number>();
    users.forEach((u) => m.set(u.roleId, (m.get(u.roleId) ?? 0) + 1));
    return m;
  }, [users]);

  // role editor + delete state
  const [editing, setEditing] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<Role | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  function saveRole(r: Role) {
    const isEdit = roles.some((x) => x.id === r.id);
    setRoles((prev) => (isEdit ? prev.map((x) => (x.id === r.id ? r : x)) : [...prev, r]));
    setEditing(null);
    setCreating(false);
    toast.success(isEdit ? `Peran "${r.name}" diperbarui ✓` : `Peran "${r.name}" ditambahkan ✓`);
  }
  function deleteRole(r: Role) {
    setRoles((prev) => prev.filter((x) => x.id !== r.id));
    setToDelete(null);
    toast.success(`Peran "${r.name}" dihapus ✓`);
  }
  async function assignRole(userId: string, roleId: string) {
    const target = users.find((u) => u.id === userId);
    if (!target || target.roleId === roleId) return;
    const prevRoleId = target.roleId;
    // Optimistic — revert if the server rejects.
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, roleId } : u)));
    setAssignError(null);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: target.employeeId, roleId }),
      });
      if (!res.ok) {
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, roleId: prevRoleId } : u)));
        const data = await res.json().catch(() => ({}));
        setAssignError(apiErrorMessage(data?.error, "id", res.status));
      } else {
        const roleName = roles.find((r) => r.id === roleId)?.name ?? "baru";
        toast.success(`Peran diubah ke "${roleName}" ✓`);
      }
    } catch {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, roleId: prevRoleId } : u)));
      setAssignError("Koneksi bermasalah. Coba lagi.");
    }
  }

  return (
    <div className="space-y-4 fade-up">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-xl bg-sand p-1">
          <TabBtn active={tab === "roles"} onClick={() => setTab("roles")}>
            <Shield className="h-4 w-4" /> Peran ({roles.length})
          </TabBtn>
          <TabBtn active={tab === "users"} onClick={() => setTab("users")}>
            <Users className="h-4 w-4" /> Pengguna ({users.length})
          </TabBtn>
        </div>
        {tab === "roles" && (
          <Button onClick={() => setCreating(true)} className="shrink-0">
            <Plus className="h-4 w-4" /> Tambah Peran
          </Button>
        )}
      </div>

      {tab === "roles" ? (
        <div className="grid gap-4 md:grid-cols-2">
          {roles.map((r) => {
            const members = countByRole.get(r.id) ?? 0;
            const full = r.permissionIds.length >= ALL_PERMISSION_IDS.length;
            return (
              <Card key={r.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: r.color + "22", color: r.color }}>
                      <ShieldCheck className="h-5 w-5" />
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-ink">{r.name}</h3>
                        {r.system && (
                          <span className="flex items-center gap-1 rounded-full bg-sand px-2 py-0.5 text-[10px] font-medium text-muted">
                            <Lock className="h-3 w-3" /> Sistem
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-faint">{members} pengguna</p>
                    </div>
                  </div>
                </div>

                <p className="mt-3 text-sm text-muted">{r.description}</p>

                <div className="mt-3 flex items-center gap-2">
                  <Badge tone={full ? "forest" : "olive"}>
                    {full ? "Akses penuh" : `${r.permissionIds.length} hak akses`}
                  </Badge>
                </div>

                <div className="mt-4 flex gap-2 border-t border-line pt-4">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditing(r)}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn("flex-1", r.system ? "text-faint" : "text-clay hover:bg-clay-soft")}
                    disabled={r.system}
                    onClick={() => setToDelete(r)}
                    title={r.system ? "Peran sistem tidak dapat dihapus" : "Hapus peran"}
                  >
                    <Trash2 className="h-4 w-4" /> Hapus
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <UsersTab users={users} roles={roles} empMap={empMap} onAssign={assignRole} error={assignError} />
      )}

      {/* Create / edit role drawer */}
      <Sheet
        open={creating || !!editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        title={editing ? `Edit ${editing.name}` : "Tambah Peran"}
        description="Atur nama, deskripsi, dan hak akses per modul"
        width="lg"
      >
        <RoleForm
          role={editing}
          onSubmit={saveRole}
          onCancel={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      </Sheet>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!toDelete}
        tone="danger"
        icon={<Trash2 className="h-6 w-6" />}
        confirmLabel="Hapus peran"
        title={`Hapus peran "${toDelete?.name}"?`}
        message={
          (countByRole.get(toDelete?.id ?? "") ?? 0) > 0
            ? `Peran ini masih dipakai ${countByRole.get(toDelete!.id)} pengguna. Mereka akan otomatis dipindah ke "Karyawan".`
            : "Tindakan ini tidak dapat dibatalkan."
        }
        onConfirm={() => {
          if (!toDelete) return;
          // reassign affected users to the default employee role
          setUsers((prev) => prev.map((u) => (u.roleId === toDelete.id ? { ...u, roleId: "role-employee" } : u)));
          deleteRole(toDelete);
        }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

function UsersTab({
  users,
  roles,
  empMap,
  onAssign,
  error,
}: {
  users: SystemUser[];
  roles: Role[];
  empMap: Map<string, EmpLite>;
  onAssign: (userId: string, roleId: string) => void;
  error?: string | null;
}) {
  const [q, setQ] = useState("");
  const roleMap = new Map(roles.map((r) => [r.id, r]));
  const filtered = users.filter((u) => {
    const e = empMap.get(u.employeeId);
    return !q || `${e?.name} ${u.email} ${e?.position}`.toLowerCase().includes(q.toLowerCase());
  });

  const statusTone: Record<string, "matcha" | "gold" | "clay"> = {
    active: "matcha",
    invited: "gold",
    suspended: "clay",
  };
  const statusLabel: Record<string, string> = { active: "Aktif", invited: "Diundang", suspended: "Ditangguhkan" };

  return (
    <div className="space-y-4">
      <div className="relative sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari pengguna…" className="pl-9" aria-label="Cari pengguna" />
      </div>

      {error && (
        <p className="rounded-xl bg-clay-soft px-3 py-2 text-sm text-[#8c3c1f]">{error}</p>
      )}

      <Card className="overflow-hidden">
        {/* Desktop */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-cream/50 text-left text-xs font-semibold uppercase tracking-wide text-faint">
                <th className="px-5 py-3">Pengguna</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Aktif terakhir</th>
                <th className="px-5 py-3">Peran</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((u) => {
                const e = empMap.get(u.employeeId);
                const role = roleMap.get(u.roleId);
                return (
                  <tr key={u.id} className="transition-colors hover:bg-cream/60">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={e?.name ?? "?"} size="sm" />
                        <div>
                          <p className="font-medium text-ink">{e?.name}</p>
                          <p className="text-xs text-faint">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={statusTone[u.status]} dot>{statusLabel[u.status]}</Badge>
                    </td>
                    <td className="px-5 py-3 text-muted">{formatDate(u.lastActive)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: role?.color }} />
                        <Select value={u.roleId} onChange={(ev) => onAssign(u.id, ev.target.value)} className="h-9 max-w-[200px]">
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </Select>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile */}
        <div className="divide-y divide-line md:hidden">
          {filtered.map((u) => {
            const e = empMap.get(u.employeeId);
            const role = roleMap.get(u.roleId);
            return (
              <div key={u.id} className="p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={e?.name ?? "?"} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{e?.name}</p>
                    <p className="truncate text-xs text-faint">{u.email}</p>
                  </div>
                  <Badge tone={statusTone[u.status]} dot>{statusLabel[u.status]}</Badge>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: role?.color }} />
                  <Select value={u.roleId} onChange={(ev) => onAssign(u.id, ev.target.value)} className="h-9">
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </Select>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-panel text-ink shadow-sm" : "text-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
