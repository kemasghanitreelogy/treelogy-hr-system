// Generates Treelogy HR PWA icons (PNG) from inline SVG using sharp.
// Run: node scripts/generate-icons.mjs
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

// Centered moringa sprig mark — stays inside the maskable safe zone.
function mark() {
  return `
    <g>
      <path d="M256 392 C 250 332 250 305 256 252"
        fill="none" stroke="#a4c26a" stroke-width="20" stroke-linecap="round"/>
      <path d="M256 300 C 198 300 150 252 150 190 C 216 196 256 240 256 300 Z" fill="#8ba859"/>
      <path d="M256 272 C 314 272 362 224 362 162 C 296 168 256 212 256 272 Z" fill="#cfe09a"/>
    </g>`;
}

function svg({ maskable }) {
  const bg = maskable
    ? `<rect width="512" height="512" fill="url(#g)"/>`
    : `<rect x="26" y="26" width="460" height="460" rx="112" fill="url(#g)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#324a26"/>
        <stop offset="1" stop-color="#1f2e1a"/>
      </linearGradient>
    </defs>
    ${bg}
    ${mark()}
  </svg>`;
}

const targets = [
  { name: "icon-192.png", size: 192, maskable: false },
  { name: "icon-512.png", size: 512, maskable: false },
  { name: "icon-192-maskable.png", size: 192, maskable: true },
  { name: "icon-512-maskable.png", size: 512, maskable: true },
  { name: "apple-touch-icon.png", size: 180, maskable: true },
  { name: "favicon-32.png", size: 32, maskable: false },
  { name: "favicon-48.png", size: 48, maskable: false },
];

await mkdir(OUT, { recursive: true });
for (const t of targets) {
  const buf = Buffer.from(svg({ maskable: t.maskable }));
  await sharp(buf, { density: 384 }).resize(t.size, t.size).png().toFile(join(OUT, t.name));
  console.log("✓", t.name, `${t.size}x${t.size}`);
}
console.log("Done →", OUT);
