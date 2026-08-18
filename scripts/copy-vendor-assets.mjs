// Salin aset vendor yang harus di-host sendiri ke /public.
//
// pdf.js menolak jalan kalau versi worker di /public berbeda dari versi
// pdfjs-dist di node_modules, dan zxing bawaannya menarik binary wasm dari CDN
// jsDelivr. Menyalinnya di setiap `npm install` membuat keduanya selalu sinkron
// dan bebas dari jaringan pihak ketiga.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * pdf.js memakai `Promise.withResolvers`, yang baru ada di Safari/iOS 17.4.
 * Di iPhone yang belum diperbarui, pustakanya gagal pada baris pertama dan
 * seluruh pembacaan label ikut mati. Tambalannya disisipkan ke DEPAN berkas
 * worker saat menyalin: worker adalah konteks JavaScript tersendiri, jadi
 * tambalan di halaman utama tidak sampai ke sana.
 */
const WITH_RESOLVERS_POLYFILL = `if(typeof Promise.withResolvers!=="function"){Promise.withResolvers=function(){let a,b;const p=new Promise((res,rej)=>{a=res;b=rej});return{promise:p,resolve:a,reject:b}}};\n`;

const ASSETS = [
  {
    from: "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
    to: "public/pdf.worker.min.mjs",
    prepend: WITH_RESOLVERS_POLYFILL,
  },
  {
    from: "node_modules/zxing-wasm/dist/reader/zxing_reader.wasm",
    to: "public/zxing_reader.wasm",
  },
];

for (const { from, to, prepend } of ASSETS) {
  // Dependensi opsional/berbeda platform tidak boleh menggagalkan install.
  if (!existsSync(from)) {
    console.warn(`[copy-vendor-assets] lewati: ${from} tidak ada`);
    continue;
  }
  if (prepend) {
    writeFileSync(to, prepend + readFileSync(from, "utf8"));
    console.log(`[copy-vendor-assets] ${from} → ${to} (+ tambalan kompatibilitas)`);
  } else {
    copyFileSync(from, to);
    console.log(`[copy-vendor-assets] ${from} → ${to}`);
  }
}
