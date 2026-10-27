/**
 * Generación de íconos PWA para PeopleNet — rasteriza el isotipo de marca
 * (src/redesign/assets/peoplenet-mark.svg) sobre el fondo del splash
 * (misma paleta que src/redesign/startup.css) en los tamaños que exige
 * el manifest de app instalable (Lighthouse / Chrome / iOS).
 *
 * Uso:      node scripts/generate-pwa-icons.mjs
 * Salida:   public/pwa-192x192.png, public/pwa-512x512.png,
 *           public/maskable-192x192.png, public/maskable-512x512.png,
 *           public/apple-touch-icon.png
 *
 * Los PNG generados van a git: el build de CI no necesita sharp.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, "");
const MARK_PATH = join(ROOT, "src", "redesign", "assets", "peoplenet-mark.svg");
const OUT_DIR = join(ROOT, "public");

/** Isotipo embebido con xmlns explícito (necesario al anidar en otro SVG). */
const markSvg = readFileSync(MARK_PATH, "utf8").replace(
  /<svg([^>]*)>/,
  '<svg$1 xmlns="http://www.w3.org/2000/svg">',
);

/**
 * Icono compuesto: fondo degradado de marca + isotipo centrado.
 * @param {number} size           lado del PNG final
 * @param {number} logoRatio      altura del isotipo como fracción del lado
 */
function composedIcon(size, logoRatio) {
  const markH = size * logoRatio;
  const scale = markH / 139; // viewBox del isotipo: 128x139
  const markW = 128 * scale;
  const tx = (size - markW) / 2;
  const ty = (size - markH) / 2;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Misma paleta del splash: linear 170deg #1668d8 -> #0b3e8f + brillo radial #91edff -->
    <linearGradient id="bg" x1="0.3" y1="0" x2="0.5" y2="1">
      <stop offset="0" stop-color="#1668d8"/>
      <stop offset="0.62" stop-color="#1668d8"/>
      <stop offset="1" stop-color="#0b3e8f"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.75" cy="0" r="0.6">
      <stop offset="0" stop-color="#91edff" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#91edff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  <rect width="${size}" height="${size}" fill="url(#glow)"/>
  <g transform="translate(${tx} ${ty}) scale(${scale})">${markSvg
    .replace(/<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")}</g>
</svg>`;
}

const targets = [
  // propósito "any": Android/iOS aplican su propia máscara al instalar
  { file: "pwa-192x192.png", size: 192, ratio: 0.74 },
  { file: "pwa-512x512.png", size: 512, ratio: 0.74 },
  // propósito "maskable": contenido seguro dentro del círculo central (~80%)
  { file: "maskable-192x192.png", size: 192, ratio: 0.56 },
  { file: "maskable-512x512.png", size: 512, ratio: 0.56 },
  // apple-touch-icon: iOS redondea por su cuenta, fondo opaco sin transparencia
  { file: "apple-touch-icon.png", size: 180, ratio: 0.72 },
];

for (const t of targets) {
  const svg = Buffer.from(composedIcon(t.size, t.ratio));
  const out = join(OUT_DIR, t.file);
  await sharp(svg).png().toFile(out);
  if (!existsSync(out)) throw new Error(`No se generó ${t.file}`);
  console.log(`✔ public/${t.file}`);
}

// Verificación de integridad mínima (bytes legibles por sharp)
for (const t of targets) {
  const meta = await sharp(join(OUT_DIR, t.file)).metadata();
  if (meta.width !== t.size || meta.height !== t.size) {
    throw new Error(`Dimensión incorrecta en ${t.file}: ${meta.width}x${meta.height}`);
  }
}
console.log("Íconos PWA generados correctamente.");
