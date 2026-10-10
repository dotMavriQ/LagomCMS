/** /favicon/<size>.png and /favicon/site.webmanifest: the site's icons, when they come from the CMS.
 *
 *  Base.astro links here only once a favicon or a logo has been uploaded in Settings. Until then
 *  the built-in files in public/ (favicon.ico, icon-192.png, ...) are used and this never runs.
 *
 *  Two ways an icon is made:
 *   - a favicon was uploaded: it is resized to the size asked for and otherwise left alone;
 *   - only a logo was uploaded: the logo's shape is drawn in cream on a dark rounded tile, the same
 *     recipe scripts/build-brand.mjs uses for the built-in bird.
 *
 *  The icons are made when the site is built and written out as files. With nothing uploaded
 *  there is nothing to make, and no files appear. The `?v=` on the links changes when the
 *  settings do, so a browser never keeps showing the old icon after a new upload. */
import { createRequire } from 'node:module';
import type { APIRoute } from 'astro';
import { CMS_URL, cached, getSingleton } from '../../lib/lagom';
import { SITE } from '../../site';
import { palette } from '../../themes/gruvbox-material';

// sharp (the image library) is this package's dependency, not the project's. A plain
// `import sharp from 'sharp'` is looked up from the project's folder at build time, and package
// managers that keep dependencies apart (pnpm) do not put it there. So it is loaded from where
// this package is installed, which the integration passes in.
const sharp: typeof import('sharp') = createRequire(import.meta.env.LAGOM_PACKAGE_ROOT)('sharp');

/** What each address is for: browser tab, iOS home screen, Android home screen, splash. */
const SIZES = new Set([48, 180, 192, 512]);
const TILE = palette.dark.bg;
const INK = palette.dark.fg;

const made = new Map<string, Buffer>();

async function fetchImage(path: string): Promise<Buffer> {
	const response = await fetch(`${CMS_URL}${path}`, { signal: AbortSignal.timeout(5000) });
	if (!response.ok) throw new Error(`the CMS answered ${response.status} for ${path}`);
	return Buffer.from(await response.arrayBuffer());
}

/** An uploaded favicon, at one size. iOS draws transparent icons on black, so its size gets the tile colour behind it. */
async function fromFavicon(source: Buffer, size: number): Promise<Buffer> {
	const icon = sharp(source).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });
	return (size === 180 ? icon.flatten({ background: TILE }) : icon).png().toBuffer();
}

/** The logo's shape in cream on a dark tile. Rounded corners everywhere except iOS, which rounds them itself. */
async function fromLogo(source: Buffer, size: number): Promise<Buffer> {
	const inner = Math.round(size * 0.7);
	const shape = await sharp(source)
		.ensureAlpha()
		.resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.extractChannel(3)
		.raw()
		.toBuffer();
	const logo = await sharp({ create: { width: inner, height: inner, channels: 3, background: INK } })
		.joinChannel(shape, { raw: { width: inner, height: inner, channels: 1 } })
		.png()
		.toBuffer();

	const radius = size === 180 ? 0 : Math.round(size * 0.22);
	const tile = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="${TILE}"/></svg>`);
	return sharp(tile).composite([{ input: logo, gravity: 'centre' }]).png().toBuffer();
}

/** The uploaded favicon and logo, if there are any. */
async function uploads() {
	return cached('site:icons', 60_000, async () => {
		const doc = await getSingleton<{ title?: string }>('site');
		return { favicon: doc.assets?.favicon ?? null, logo: doc.assets?.logo ?? null };
	}).catch(() => null);
}

/** The files to build: every size plus the manifest, or none at all when nothing was uploaded. */
export async function getStaticPaths() {
	const brand = await uploads();
	if (!brand?.favicon && !brand?.logo) return [];
	return [...[...SIZES].map((size) => `${size}.png`), 'site.webmanifest'].map((file) => ({ params: { file } }));
}

export const GET: APIRoute = async ({ params }) => {
	const brand = await uploads();
	const source = brand?.favicon ?? brand?.logo;
	if (!brand || !source) return new Response('Not found', { status: 404 });

	if (params.file === 'site.webmanifest') {
		const manifest = {
			name: SITE.name,
			short_name: SITE.shortName,
			icons: [192, 512].map((size) => ({ src: `/favicon/${size}.png`, sizes: `${size}x${size}`, type: 'image/png' })),
			theme_color: TILE,
			background_color: TILE,
			display: 'standalone',
			start_url: '/',
		};
		return new Response(JSON.stringify(manifest, null, 2), { headers: { 'content-type': 'application/manifest+json' } });
	}

	const size = Number(/^(\d+)\.png$/.exec(params.file ?? '')?.[1]);
	if (!SIZES.has(size)) return new Response('Not found', { status: 404 });

	const key = `${source.src}@${size}`;
	let icon = made.get(key);
	if (!icon) {
		try {
			const image = await fetchImage(source.src);
			icon = brand.favicon ? await fromFavicon(image, size) : await fromLogo(image, size);
		} catch {
			return new Response('Not found', { status: 404 });
		}
		made.set(key, icon);
	}

	// A year, because the address itself changes (?v=) whenever the icon does.
	return new Response(new Uint8Array(icon), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' } });
};
