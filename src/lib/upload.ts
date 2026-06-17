"use client";

/**
 * Direct-to-Supabase-Storage upload from the browser.
 *
 * Uploading straight to the private bucket bypasses the API route entirely, so
 * it isn't bound by the serverless ~4.5MB request-body limit — large PDFs (and
 * any file) upload at full size with no quality loss. Only the resulting storage
 * PATH is then sent to the API (a tiny string), which stores it on the record.
 *
 * RLS still applies: the browser client carries the user's session, so the same
 * bucket policies (authenticated / is_hr) that gate server uploads gate these.
 *
 * When Supabase isn't configured (demo mode), we fall back to a base64 data URL
 * so the existing API-side upload path keeps working unchanged.
 */

import { createClient } from "@/lib/supabase/client";
import { compressImageBlob, prepareUpload } from "@/lib/image";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

// Hard client-side ceiling (Supabase Storage default is 50MB; keep margin).
const MAX_BYTES = 25 * 1024 * 1024;

export interface PreparedFile {
  /** Storage path when uploaded directly to the bucket (e.g. "<empId>/<uuid>.pdf"). */
  path: string | null;
  /** Base64 data URL fallback (only when Supabase isn't configured). */
  dataUrl: string | null;
}

/**
 * Prepare a picked file for a private bucket. Images are compressed to
 * near-lossless WebP; PDFs/others are uploaded as-is. `folder` should be the
 * employee id the file belongs to (matches the bucket's path policy).
 *
 * Throws Error("file_too_large") / Error("upload_failed") — map with apiErrorMessage.
 */
export async function prepareFileForBucket(
  bucket: string,
  folder: string,
  file: File,
): Promise<PreparedFile> {
  const blob: Blob = file.type.startsWith("image/") ? await compressImageBlob(file) : file;
  if (blob.size > MAX_BYTES) throw new Error("file_too_large");

  const supabase = createClient();
  // No Supabase (demo) → hand the API a base64 data URL like before.
  if (!supabase) return { path: null, dataUrl: await prepareUpload(file) };

  const contentType = blob.type || file.type || "application/octet-stream";
  const ext = EXT[contentType] ?? EXT[file.type] ?? "bin";
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType, upsert: false });
  if (error) throw new Error("upload_failed");
  return { path, dataUrl: null };
}
