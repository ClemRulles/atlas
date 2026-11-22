// Génère les icônes de l'app (PWA, iPhone, onglet) à partir d'un seul dessin vectoriel.
// Usage : node scripts/icons.mjs
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

/** Nuit, aurore et une orbite : l'argent qui fait le tour du monde. `pad` réduit le dessin pour l'icône masquable. */
function svg(size, pad = 0) {
  const s = size;
  const c = s / 2;
  const r = (s / 2) * (0.5 - pad * 0.5);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <radialGradient id="a1" cx="0.25" cy="0.1" r="0.75"><stop offset="0" stop-color="#19e6a6" stop-opacity=".85"/><stop offset="1" stop-color="#19e6a6" stop-opacity="0"/></radialGradient>
    <radialGradient id="a2" cx="0.85" cy="0.2" r="0.7"><stop offset="0" stop-color="#7a5cff" stop-opacity=".75"/><stop offset="1" stop-color="#7a5cff" stop-opacity="0"/></radialGradient>
    <radialGradient id="a3" cx="0.55" cy="0.45" r="0.6"><stop offset="0" stop-color="#2bb5ff" stop-opacity=".45"/><stop offset="1" stop-color="#2bb5ff" stop-opacity="0"/></radialGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset=".35" stop-color="#06070b" stop-opacity="0"/><stop offset="1" stop-color="#06070b" stop-opacity=".9"/></linearGradient>
  </defs>
  <rect width="${s}" height="${s}" fill="#06070b"/>
  <rect width="${s}" height="${s}" fill="url(#a1)"/>
  <rect width="${s}" height="${s}" fill="url(#a2)"/>
  <rect width="${s}" height="${s}" fill="url(#a3)"/>
  <rect width="${s}" height="${s}" fill="url(#fade)"/>
  <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#ffffff" stroke-opacity=".95" stroke-width="${s * 0.022}"/>
  <ellipse cx="${c}" cy="${c}" rx="${r}" ry="${r * 0.36}" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width="${s * 0.014}"/>
  <ellipse cx="${c}" cy="${c}" rx="${r * 0.42}" ry="${r}" fill="none" stroke="#ffffff" stroke-opacity=".35" stroke-width="${s * 0.012}"/>
  <circle cx="${c + r * 0.72}" cy="${c - r * 0.69}" r="${s * 0.042}" fill="#ffffff"/>
  <circle cx="${c + r * 0.72}" cy="${c - r * 0.69}" r="${s * 0.085}" fill="#4de5b2" fill-opacity=".35"/>
</svg>`;
}

const out = [
  ["public/icon-192.png", 192, 0],
  ["public/icon-512.png", 512, 0],
  ["public/icon-maskable-512.png", 512, 0.3],
  ["src/app/apple-icon.png", 180, 0.12],
  ["src/app/icon.png", 64, 0],
];
for (const [file, size, pad] of out) {
  await writeFile(file, await sharp(Buffer.from(svg(size, pad))).png().toBuffer());
  console.log(file, size);
}
