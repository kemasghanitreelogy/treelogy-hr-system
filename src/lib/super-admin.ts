/**
 * Super-admin tier — an orthogonal elevation on top of the normal RBAC roles.
 * The root email is always a super admin; the super admin may grant/revoke the
 * flag for other accounts (persisted as `profiles.is_super_admin` in Supabase).
 *
 * Gating reuses the existing permission plumbing: a super admin's session carries
 * a synthetic `SUPERADMIN_PERM`, so nav items, `can()`, and route guards all work
 * unchanged. Menu items meant only for super admins use `perm: SUPERADMIN_PERM`.
 */

/** Fixed root super admin — can never be revoked. */
export const SUPER_ADMIN_EMAIL = "kemasghani123@gmail.com";

/** Synthetic permission injected into a super admin's session. */
export const SUPERADMIN_PERM = "superadmin";

/** One account row shown on the super-admin management page. */
export interface SuperAdminAccount {
  /** profiles.id (auth user id). */
  id: string;
  employeeId: string | null;
  name: string;
  email: string;
  isSuperAdmin: boolean;
  /** The fixed root — rendered locked-on. */
  isRoot: boolean;
}
