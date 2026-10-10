/** Server-side client for the fediverse archive: the filtered timeline, kept by the CMS and
 *  answered from disk, so this page never waits on the fediverse instance itself. */
import type { FeedPage, FeedPost } from './fediverse';

import { CMS_URL } from './lagom';

// The archive is served by the CMS, which is also where its rules are edited (Social, in the
// admin). SOCIAL_FEED_URL points somewhere else when set: the stand-alone Lua service that did
// this job before the CMS took it over.
const BASE = (import.meta.env.SOCIAL_FEED_URL ?? process.env.SOCIAL_FEED_URL ?? `${CMS_URL}/api/v1/social`).replace(/\/+$/, '');

/** One page of the timeline, or null when it could not be fetched. Null and "empty" are kept
 *  apart on purpose: a failure must never read as "that is everything". */
export async function feedPage(page = 1): Promise<FeedPage | null> {
	const url = new URL(`${BASE}/feed`);
	url.searchParams.set('page', String(page));
	try {
		// The service answers from memory; the timeout only matters if it is missing entirely.
		const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
		if (!res.ok) return null;
		const body = (await res.json()) as Partial<FeedPage>;
		return {
			data: body.data ?? [],
			page: body.page ?? page,
			pages: body.pages ?? 1,
			total: body.total ?? body.data?.length ?? 0,
			next: body.next ?? null,
		};
	} catch {
		return null;
	}
}

/** Every post in the archive, newest first: one memory read per page on the service side, and cached here
 *  for a minute so a burst of hashtag clicks costs nothing. Null when any page could not be fetched, so a
 *  partial archive is never presented as the whole thing. */
let archive: { at: number; posts: FeedPost[] } | null = null;
export async function allPosts(): Promise<FeedPost[] | null> {
	if (archive && Date.now() - archive.at < 60_000) return archive.posts;
	const first = await feedPage(1);
	if (!first) return null;
	const rest = await Promise.all(Array.from({ length: Math.max(0, first.pages - 1) }, (_, i) => feedPage(i + 2)));
	if (rest.some((p) => !p)) return null;
	const posts = [first, ...rest].flatMap((p) => p!.data);
	archive = { at: Date.now(), posts };
	return posts;
}

const norm = (tag: string) => tag.normalize('NFC').toLowerCase();

/** The tags a post carries, read from the instance's own hashtag links (data-tag, or a /tag/<name> href). */
export function tagsOf(post: FeedPost): string[] {
	const out = new Set<string>();
	for (const m of post.content.matchAll(/<a\b[^>]*>/gi)) {
		const a = m[0];
		if (!/class="[^"]*\bhashtag\b|rel="[^"]*\btag\b/i.test(a)) continue;
		const tag = a.match(/data-tag="([^"]+)"/i)?.[1] ?? a.match(/href="[^"]*\/tags?\/([^"/?#]+)/i)?.[1];
		if (tag) {
			try {
				out.add(norm(decodeURIComponent(tag)));
			} catch {
				out.add(norm(tag));
			}
		}
	}
	return [...out];
}

export async function postsTagged(tag: string): Promise<FeedPost[] | null> {
	const posts = await allPosts();
	if (!posts) return null;
	const want = norm(tag);
	return posts.filter((p) => tagsOf(p).includes(want));
}
