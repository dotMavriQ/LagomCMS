/** The photographs behind the home page and the Social page.
 *
 *  The package ships none. A site gets a backdrop in one of two ways:
 *
 *   - its owner uploads one in the CMS (Home > Background photo), or
 *   - the project keeps its own in src/assets/backdrops/, named after the page:
 *     home.jpg, social.jpg (jpg, png, webp or avif).
 *
 *  A page with neither is drawn without a photo: the same warm wash and grain, with nothing
 *  behind them. That is what a brand-new site looks like, and it is a finished look, not a
 *  missing image.
 *
 *  The path starts with "/", which Vite reads as "from the root of the project using this
 *  package".
 */
import type { ImageMetadata } from 'astro';

const found = import.meta.glob<{ default: ImageMetadata }>('/src/assets/backdrops/*.{jpg,jpeg,png,webp,avif}', { eager: true });

/** Page name -> the project's own photo for it: { home: ..., social: ... }. */
export const backdrops: Record<string, ImageMetadata | undefined> = Object.fromEntries(
	Object.entries(found).map(([path, module]) => [path.split('/').pop()!.replace(/\.[a-z]+$/, ''), module.default]),
);
