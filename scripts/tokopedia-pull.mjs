#!/usr/bin/env node
/**
 * Nama lama, tetap bekerja.
 *
 * Penarik sekarang melayani banyak marketplace dan pindah ke
 * `marketplace-pull.mjs`. Berkas ini sengaja TIDAK menyalin isinya — dua
 * salinan akan perlahan melenceng, dan yang melenceng diam-diam di sini
 * berarti review masuk ke bagian ledger yang salah. Ia hanya meneruskan.
 *
 *   node scripts/tokopedia-pull.mjs          →  --source=tokopedia
 *   node scripts/marketplace-pull.mjs --source=shopee
 */
process.argv.push("--source=tokopedia");
await import("./marketplace-pull.mjs");
