/**
 * Client-side upload preparation.
 *
 * Goal: shrink every upload enough to clear the serverless request-body limit
 * (~4.5 MB; base64 inflates bytes ~33%) WITHOUT visible quality loss.
 *
 * Images → re-encoded to WebP at high quality in a Web Worker (browser-image-
 * compression handles EXIF rotation + iterative quality search). WebP keeps the
 * same perceived quality as JPEG/PNG at a fraction of the size, and small images
 * are passed through untouched so nothing is ever needlessly degraded.
 *
 * Non-images (PDF, etc.) can't be image-compressed, so they're passed through
 * losslessly as a data URL. The library is imported dynamically to keep it out
 * of the initial page bundle.
 */

// Re-encode only when the source is bigger than this — smaller files keep their
// original bytes (zero quality loss).
const RECOMPRESS_ABOVE_MB = 1.5;
// Target ceiling for re-encoded images: comfortably under the body limit even
// after base64 (1.8 MB → ~2.4 MB on the wire).
const TARGET_MAX_MB = 1.8;
// Keep generous resolution so scanned text (e.g. KTP) stays crisp & readable.
const MAX_DIMENSION = 2560;
// Visually lossless starting quality; the library only drops it if needed to
// reach TARGET_MAX_MB, and high-res WebP almost never needs to.
const INITIAL_QUALITY = 0.92;

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

/** Compress an image File → data URL ready for upload. Near-lossless WebP. */
export async function compressImageFile(file: File): Promise<string> {
  // Already small enough → don't touch it (preserve original quality exactly).
  if (file.size <= RECOMPRESS_ABOVE_MB * 1024 * 1024 && file.type !== "image/heic") {
    return fileToDataUrl(file);
  }
  const { default: imageCompression } = await import("browser-image-compression");
  let chosen: File | Blob = file;
  try {
    const out = await imageCompression(file, {
      maxSizeMB: TARGET_MAX_MB,
      maxWidthOrHeight: MAX_DIMENSION,
      initialQuality: INITIAL_QUALITY,
      useWebWorker: true,
      fileType: "image/webp",
    });
    // Never emit something larger than the original.
    if (out.size < file.size) chosen = out;
  } catch {
    /* compression failed → use original; the server still validates size */
  }
  return fileToDataUrl(chosen);
}

/**
 * Prepare any picked file for upload. Images are compressed (near-lossless);
 * every other type is returned as-is. Returns a `data:` URL.
 */
export async function prepareUpload(file: File): Promise<string> {
  if (file.type.startsWith("image/")) return compressImageFile(file);
  return fileToDataUrl(file);
}
