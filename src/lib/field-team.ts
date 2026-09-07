import type { Team } from "./types";

/**
 * Izin yang melekat pada TIM lapangan, bukan pada peran.
 *
 * Permintaan produk (7 Sep 2026): "setiap karyawan farm dan factory selalu
 * dapat menu Surat Keluar". Peran bisa diganti per orang, izinnya bisa diedit
 * di halaman Peran & Akses, dan peran baru bisa lahir tanpa letters.view —
 * jadi menggantungkannya pada peran saja berarti aturan itu bisa hilang tanpa
 * ada yang sadar. Di sini izinnya diturunkan dari `employees.team`, dan
 * pasangannya di database adalah `is_field_team()` (migration 0084) yang
 * membaca kolom yang sama untuk RLS berkas surat.
 */
export const FIELD_TEAMS: readonly Team[] = ["farm", "factory"];

export const FIELD_TEAM_PERMS: readonly string[] = ["letters.view"];

export function isFieldTeam(team: string | null | undefined): boolean {
  return Boolean(team) && (FIELD_TEAMS as readonly string[]).includes(team as string);
}

/** Izin tambahan untuk tim ini — kosong untuk tim lain. */
export function fieldTeamPerms(team: string | null | undefined): string[] {
  return isFieldTeam(team) ? [...FIELD_TEAM_PERMS] : [];
}
