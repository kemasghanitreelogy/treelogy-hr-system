// Salin aset vendor yang harus di-host sendiri ke /public.
//
// pdf.js menolak jalan kalau versi worker di /public berbeda dari versi
// pdfjs-dist di node_modules, dan zxing bawaannya menarik binary wasm dari CDN
// jsDelivr. Menyalinnya di setiap `npm install` membuat keduanya selalu sinkron
// dan bebas dari jaringan pihak ketiga.
import { copyFileSync, existsSync } from "node:fs";

const ASSETS = [
  ["node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "public/pdf.worker.min.mjs"],
  ["node_modules/zxing-wasm/dist/reader/zxing_reader.wasm", "public/zxing_reader.wasm"],
];

for (const [from, to] of ASSETS) {
  // Dependensi opsional/berbeda platform tidak boleh menggagalkan install.
  if (!existsSync(from)) {
    console.warn(`[copy-vendor-assets] lewati: ${from} tidak ada`);
    continue;
  }
  copyFileSync(from, to);
  console.log(`[copy-vendor-assets] ${from} → ${to}`);
}
