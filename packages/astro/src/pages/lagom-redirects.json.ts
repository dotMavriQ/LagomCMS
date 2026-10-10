/** /lagom-redirects.json: addresses that forward somewhere else, for the web server to act on.
 *
 *  A static site is a folder of files, and a file cannot answer "301, it moved". So the forwards
 *  are written down here, once per build, and whatever serves the folder reads the list: LagomCMS
 *  does (Site\StaticSite in the PHP code), and the same list is easy to turn into nginx or Caddy
 *  rules. Two kinds of address are in it:
 *
 *   - old post addresses that moved (data/redirects.ts), as permanent redirects;
 *   - /defaults/<page>-backdrop, a fixed address for this project's own photo for a page. Astro
 *     gives that photo a new, hashed address on every build; the CMS admin shows it next to the
 *     upload field as "what the site uses now", and needs somewhere stable to ask.
 */
import type { APIRoute } from 'astro';
import { POST_REDIRECTS } from '../data/redirects';
import { backdrops } from '../lib/backdrops';

export const GET: APIRoute = () => {
	const forwards: Record<string, { to: string; status: number }> = {};

	for (const [from, to] of Object.entries(POST_REDIRECTS)) {
		forwards[`/blog/${from}`] = { to: `/blog/${to}`, status: 301 };
	}
	for (const [page, photo] of Object.entries(backdrops)) {
		if (photo) forwards[`/defaults/${page}-backdrop`] = { to: photo.src, status: 302 };
	}

	return new Response(JSON.stringify(forwards, null, 2), { headers: { 'content-type': 'application/json' } });
};
