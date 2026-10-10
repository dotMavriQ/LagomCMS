/** Typed client for the CMS's read API.
 *
 * Where the CMS is comes from the integration's `url` option, or the LAGOM_URL environment
 * variable at build time. With neither, it is assumed to be where `bin/dev` and the README put
 * it during local work.
 *
 * Only reads, and only what is public: published documents, and nothing that needs signing in.
 */

const BASE = import.meta.env.LAGOM_URL || 'http://127.0.0.1:4702';

/** Where the CMS is, for the few places that have to fetch an uploaded file from it directly. */
export const CMS_URL = BASE;

/** Rich text as LagomCMS's editor produces it: a tree of typed blocks, not markdown. Deliberately
 *  loose rather than a discriminated union — each block kind's real shape (verified against live
 *  content, not guessed) is documented and cast for individually in lib/blocks.ts, the one place
 *  that reads these. A stricter type here bought no real safety (nothing narrows on it via `type`)
 *  and drifted from the real shapes the first time it was written. */
/** `title` is a link's Markdown title: [text](url "title"). */
export type Span = { text: string; marks?: string[]; href?: string; title?: string; type?: string; label?: string };
export type Block = { type: string; [key: string]: unknown };

export interface Doc<F> {
	id: string;
	slug: string;
	hash: string;
	updated_at: number;
	status?: string;
	excerpt: string;
	blocks?: Block[] | Record<string, never>;
	seo: { title: string; description: string; noindex: boolean };
	fields: F;
	collection: string;
	locale: string;
	translations?: string[];
	reading_time?: { words: number; minutes: number };
	/** Uploaded images that image fields point at, keyed by field name, with their pixel sizes. */
	assets?: Record<string, UploadedImage>;
}

/** An image uploaded through the CMS editor. `src` is a site-relative /media/... path. */
export interface UploadedImage {
	src: string;
	width: number;
	height: number;
}

class LagomError extends Error {
	constructor(
		message: string,
		public status: number,
	) {
		super(message);
	}
}

/** Dev only: a `lagom_sid` session in `.env` lets `pnpm dev` read draft posts, which the public API
 *  hides. Never set in production, and ignored there even if it were. */
const DEV_SESSION = import.meta.env.DEV ? import.meta.env.LAGOM_DEV_SESSION : undefined;

async function request<T>(path: string): Promise<T> {
	const headers: Record<string, string> = { accept: 'application/json' };
	if (DEV_SESSION) headers.cookie = `lagom_sid=${DEV_SESSION}`;
	const res = await fetch(`${BASE}${path}`, { headers });
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new LagomError(body.message || `LagomCMS request failed: ${path}`, res.status);
	}
	return res.json();
}

/** A singleton collection (site, home, about, contact, cv): one document, no slug. */
export async function getSingleton<F>(collection: string): Promise<Doc<F>> {
	const { data } = await request<{ data: Doc<F> }>(`/api/v1/${collection}`);
	return data;
}

/** A list collection's index: every item the visitor may see, in one request.
 *
 *  By default each item comes WITHOUT `blocks` (the body); pass `{ withBlocks: true }` to get the
 *  bodies and reading times as well. The PHP LagomCMS returns the whole collection here; the old
 *  Lua one cut the list at 20 rows, which is why posts.ts used to fetch every post one by one. */
export async function getList<F>(collection: string, options: { withBlocks?: boolean } = {}): Promise<Doc<F>[]> {
	const query = options.withBlocks ? '?include=blocks' : '';
	const { data } = await request<{ data: Doc<F>[] }>(`/api/v1/${collection}${query}`);
	return data;
}

/** One item of a list collection, by slug — includes `blocks`. */
export async function getDoc<F>(collection: string, slug: string): Promise<Doc<F>> {
	const { data } = await request<{ data: Doc<F> }>(`/api/v1/${collection}/${slug}`);
	return data;
}

export { LagomError };

/** A small in-memory cache with a time limit per entry. A build asks the CMS for the same
 *  things many times over (every post page wants the list of posts), and `astro dev` does so on
 *  every page view. This keeps that to one request per minute per thing. */
const cache = new Map<string, { value: unknown; expires: number }>();
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
	const hit = cache.get(key);
	if (hit && hit.expires > Date.now()) return hit.value as T;
	const value = await fn();
	cache.set(key, { value, expires: Date.now() + ttlMs });
	return value;
}
