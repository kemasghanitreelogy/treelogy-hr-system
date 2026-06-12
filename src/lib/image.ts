/**
 * Kompresi gambar di sisi klien sebelum upload (browser-image-compression):
 * berjalan di Web Worker (UI tidak macet), menangani rotasi EXIF foto HP,
 * dan iteratif menekan sampai target ukuran — foto 3–5 MB menjadi ±300 KB.
 * Library di-import dinamis agar tidak membebani bundle awal halaman.
 */

const MAX_SIZE_MB = 0.4;
const MAX_DIMENSION = 1600;

/** Kompres File gambar → data URL siap upload. Non-gambar dilempar error oleh pemanggil. */
export async function compressImageFile(file: File): Promise<string> {
  const { default: imageCompression } = await import("browser-image-compression");
  let chosen: File | Blob = file;
  try {
    const out = await imageCompression(file, {
      maxSizeMB: MAX_SIZE_MB,
      maxWidthOrHeight: MAX_DIMENSION,
      useWebWorker: true,
      initialQuality: 0.8,
    });
    // Jaga-jaga: jangan pernah hasilkan file yang lebih besar dari aslinya.
    if (out.size < file.size) chosen = out;
  } catch {
    /* kompresi gagal → pakai file asli, validasi ukuran server tetap menjaga */
  }
  return imageCompression.getDataUrlFromFile(chosen as File);
}
