/** Draws the neutral images a brand-new site starts with, into ../public.
 *
 *   node scripts/make-defaults.mjs
 *
 * A site made with this package has to look finished before its owner has uploaded anything:
 * a logo in the header, an icon in the browser tab, a picture when a link is shared. These are
 * those placeholders. They are deliberately plain (a ring), in the default theme's two colours,
 * and every one of them is replaced by the owner's own from the CMS or from their project's
 * public/ folder, where a file of the same name always wins.
 */
import fs from 'node:fs';
import sharp from 'sharp';

const OUT = new URL('../public/', import.meta.url).pathname;
const TILE = '#282828';
const INK = '#d4be98';

const svg = (size, body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">${body}</svg>`);
const ring = (colour) => `<circle cx="50" cy="50" r="30" fill="none" stroke="${colour}" stroke-width="12"/>`;

// The logo is a stencil: black on transparent, coloured by the page. Same proportions as the
// box the stylesheet reserves for it (751:657), so it sits where a real logo would.
await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="751" height="657" viewBox="0 0 751 657"><circle cx="375" cy="328" r="230" fill="none" stroke="#000" stroke-width="92"/></svg>`))
	.webp({ lossless: true })
	.toFile(OUT + 'logo-mask.webp');

// Icons: the ring in cream on a dark tile. Rounded, except Apple's, which iOS rounds itself.
const icon = (size, radius) => sharp(svg(size, `<rect width="100" height="100" rx="${radius}" fill="${TILE}"/>${ring(INK)}`)).png();
await icon(192, 22).toFile(OUT + 'icon-192.png');
await icon(512, 22).toFile(OUT + 'icon-512.png');
await icon(180, 0).toFile(OUT + 'apple-touch-icon.png');

// favicon.ico: a 48px PNG inside the small wrapper the .ico format asks for.
const png = await icon(48, 22).toBuffer();
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // one image
header.writeUInt8(48, 6); // width
header.writeUInt8(48, 7); // height
header.writeUInt16LE(1, 10); // colour planes
header.writeUInt16LE(32, 12); // bits per pixel
header.writeUInt32LE(png.length, 14); // size of the image data
header.writeUInt32LE(22, 18); // where it starts
fs.writeFileSync(OUT + 'favicon.ico', Buffer.concat([header, png]));

// One share image, used for every page until the owner makes their own.
const share = await sharp({ create: { width: 1200, height: 630, channels: 3, background: TILE } })
	.composite([{ input: await sharp(svg(260, ring(INK))).png().toBuffer(), gravity: 'centre' }])
	.png({ compressionLevel: 9 })
	.toBuffer();
for (const page of ['index', 'about', 'blog', 'contact', 'cv', 'portfolio', 'social']) fs.writeFileSync(`${OUT}img/og/${page}.png`, share);

// A stand-in portrait for the About page: a plain head-and-shoulders shape.
await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="565" height="754" viewBox="0 0 565 754"><rect width="565" height="754" fill="#a89984"/><circle cx="282" cy="300" r="120" fill="#7c6f64"/><path d="M62 754c0-150 100-250 220-250s220 100 220 250z" fill="#7c6f64"/></svg>`))
	.webp({ quality: 80 })
	.toFile(OUT + 'img/portrait.webp');

fs.writeFileSync(OUT + 'robots.txt', 'User-agent: *\nAllow: /\n');
fs.writeFileSync(
	OUT + 'site.webmanifest',
	JSON.stringify({ name: 'My site', short_name: 'My site', icons: [192, 512].map((s) => ({ src: `/icon-${s}.png`, sizes: `${s}x${s}`, type: 'image/png' })), theme_color: TILE, background_color: TILE, display: 'standalone', start_url: '/' }, null, 2) + '\n',
);
console.log('wrote', fs.readdirSync(OUT, { recursive: true }).filter((f) => f.includes('.')).length, 'files to public/');
