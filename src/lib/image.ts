/**
 * Kompresi gambar di sisi klien sebelum upload — foto HP 3–5 MB menjadi
 * ±200–400 KB tanpa perubahan berarti secara visual, sehingga storage
 * Supabase tidak cepat penuh. PDF dan non-gambar dilewatkan apa adanya.
 */
export async function compressImageDataUrl(
  dataUrl: string,
  maxDim = 1600,
  quality = 0.8,
): Promise<string> {
  if (!dataUrl.startsWith("data:image/")) return dataUrl;
  try {
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    // Sudah kecil dan bukan format boros (HEIC/PNG) → biarkan.
    if (scale === 1 && dataUrl.startsWith("data:image/jpeg")) return dataUrl;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL("image/jpeg", quality);
    // Jaga-jaga: jangan pernah hasilkan file yang lebih besar dari aslinya.
    return out.length < dataUrl.length ? out : dataUrl;
  } catch {
    return dataUrl;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
