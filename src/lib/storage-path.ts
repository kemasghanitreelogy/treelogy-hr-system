/**
 * Server-side validation for a storage path a client claims to have uploaded
 * directly (via lib/upload.ts). The path must be exactly
 * `<employeeId>/<uuid>.<ext>` — this blocks path traversal and prevents a user
 * from attaching another employee's folder to their own record.
 *
 * The object's existence + the user's right to write it are already enforced by
 * Storage RLS at upload time; this is a cheap, defensive shape check.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUploadedPath(
  path: unknown,
  employeeId: string,
  exts: string[],
): path is string {
  if (typeof path !== "string") return false;
  const segs = path.split("/");
  if (segs.length !== 2) return false;
  if (segs[0] !== employeeId) return false;
  const dot = segs[1].lastIndexOf(".");
  if (dot <= 0) return false;
  const name = segs[1].slice(0, dot);
  const ext = segs[1].slice(dot + 1).toLowerCase();
  return UUID.test(name) && exts.includes(ext);
}
