/** Blog posts, as the pages want them.
 *
 * A `Post` is a document from the CMS's posts collection, reshaped once here so the blog index,
 * the post page, the feeds, the sitemap and the search index all read the same thing.
 *
 * getPosts() asks the CMS for the whole collection in one request, bodies included (the index
 * needs every post's headings and reading time). A post exists on the site the moment it is
 * published in the CMS; nothing in the project has to know its slug beforehand.
 */
import type { ImageMetadata } from 'astro';
import { PERSON, SITE, absoluteUrl } from '../site';
import { getDoc, getList, cached, LagomError, type Block, type Doc } from './lagom';
import { extractHeadings } from './blocks';

interface PostFields {
	title: string;
	status: 'draft' | 'published' | 'archived';
	published_at?: string;
	tags?: string[];
	author?: string;
	cover?: string;
	hero_path?: string;
	summary?: string;
	revised_at?: string;
	series?: string;
	series_title?: string;
	series_label?: string;
	standfirst?: string[];
	part?: number;
	parts_total?: number;
	seo_description?: string;
}

export interface Post {
	id: string;
	collection: 'posts';
	blocks: Block[];
	headings: { depth: number; slug: string; text: string }[];
	data: {
		title: string;
		description: string;
		excerpt?: string;
		pubDate: Date;
		/** Editorial revision date if one is set, else the CMS's last write. */
		updated: Date;
		tags: string[];
		readingTime?: number;
		hero?: ImageMetadata;
		/** Where that illustration is in the project, e.g. "src/assets/blog/name.webp". */
		heroFile?: string;
		series?: string;
		/** This post's place in its series, and how it is named in the list of parts. */
		seriesPart?: number;
		seriesLabel?: string;
		standfirst: string[];
		draft: boolean;
	};
}

// Every locally-known hero image, keyed by filename — resolved once, reused for every post.
// hero_path from the CMS is a public path like "/img/blog/breaking-evil.webp"; only its basename
// is used to look up the matching asset, so the two can live at different paths.
// The paths start with "/", which Vite reads as "from the root of the project using this
// package". Hero art and share images belong to the site, not to the package.
const heroAssets = import.meta.glob<{ default: ImageMetadata }>('/src/assets/blog/*.webp', { eager: true });
const heroByFilename = new Map(Object.entries(heroAssets).map(([path, mod]) => [path.split('/').pop()!, mod.default]));
const heroFileByFilename = new Map(Object.keys(heroAssets).map((path) => [path.split('/').pop()!, path.replace(/^\//, '')]));

function toPost(doc: Doc<PostFields>): Post {
	const f = doc.fields;
	const blocks = Array.isArray(doc.blocks) ? doc.blocks : [];
	const hero = f.hero_path ? heroByFilename.get(f.hero_path.split('/').pop()!) : undefined;
	const heroFile = f.hero_path ? heroFileByFilename.get(f.hero_path.split('/').pop()!) : undefined;
	return {
		id: doc.slug,
		collection: 'posts',
		blocks,
		headings: extractHeadings(blocks),
		data: {
			title: f.title,
			// The hand-written summary first: the CMS's own seo.description is auto-cut from the
			// body and usually ends mid-sentence in "...".
			description: f.summary || doc.seo?.description || f.seo_description || '',
			excerpt: f.summary,
			pubDate: new Date(f.published_at ?? doc.updated_at * 1000),
			updated: new Date(f.revised_at ?? doc.updated_at * 1000),
			tags: f.tags ?? [],
			readingTime: doc.reading_time?.minutes,
			hero,
			heroFile,
			series: f.series,
			seriesPart: f.part,
			seriesLabel: f.series_label,
			standfirst: Array.isArray(f.standfirst) ? f.standfirst : [],
			draft: f.status !== 'published',
		},
	};
}

/** All publishable posts, newest first. Drafts show in dev only, and only when a dev session lets
 *  the API return them. Cached for a minute so a burst of page views is one CMS request. */
export async function getPosts(): Promise<Post[]> {
	return cached('posts:all', 60_000, async () => {
		const docs = await getList<PostFields>('posts', { withBlocks: true });
		const all = docs.map(toPost).filter((p) => import.meta.env.DEV || !p.data.draft);
		return all.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
	});
}

/** One post by slug, always fresh (not the list cache) — the reading page should never lag a
 *  just-published edit behind the cache TTL above. */
export async function getPost(id: string): Promise<Post | undefined> {
	try {
		return toPost(await getDoc<PostFields>('posts', id));
	} catch (err) {
		if (err instanceof LagomError && err.status === 404) return undefined;
		throw err;
	}
}

export const postPath = (id: string) => `/blog/${id}`;

/** Later of the publish and revision dates: a post revised before its publish date was still
 *  last changed when it went out. */
export const lastModified = (post: Post) => new Date(Math.max(post.data.updated.valueOf(), post.data.pubDate.valueOf()));

export const wordCount = (blocks: Block[]) => plainTextOf(blocks).split(/\s+/).filter(Boolean).length;

export function plainTextOf(blocks: Block[]): string {
	const out: string[] = [];
	const walkSpans = (spans: unknown) => {
		if (!Array.isArray(spans)) return;
		for (const s of spans) if (typeof s?.text === 'string') out.push(s.text);
	};
	const walk = (bs: Block[]) => {
		for (const b of bs) {
			const anyB = b as Record<string, unknown>;
			if (Array.isArray(anyB.spans)) walkSpans(anyB.spans);
			if (Array.isArray(anyB.blocks)) walk(anyB.blocks as Block[]);
			// list items are always `{ blocks: Block[] }` — see the matching case in lib/blocks.ts.
			if (Array.isArray(anyB.items)) for (const it of anyB.items as { blocks: Block[] }[]) walk(it.blocks);
			if (Array.isArray(anyB.rows)) for (const row of anyB.rows as { cells: { spans?: unknown }[] }[]) for (const cell of row.cells) walkSpans(cell.spans);
			if (anyB.type === 'code' && typeof anyB.text === 'string') out.push(anyB.text);
		}
	};
	walk(blocks);
	return out.join(' ');
}

export const readingMinutes = (post: Post) => post.data.readingTime ?? Math.max(1, Math.round(wordCount(post.blocks) / 200));

export const excerptOf = (post: Post) => post.data.excerpt ?? post.data.description;

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const formatDate = (d: Date) => dateFmt.format(d);

/** "prev" = the next-older post, "next" = the next-newer one (matches the live site). */
export function neighbours(posts: Post[], id: string) {
	const i = posts.findIndex((p) => p.id === id);
	return { prev: posts[i + 1], next: i > 0 ? posts[i - 1] : undefined };
}

// Which /img/og/*.png files actually exist, by slug. A build-time import.meta.glob and not an
// existsSync() check: a path built from import.meta.url resolves against wherever THIS file ends
// up after bundling (dist/server/chunks/*.mjs), not against the real dist/client/img/og/, so
// existsSync silently found nothing in production despite working in `astro dev`.
const ogImages = new Set(Object.keys(import.meta.glob('/public/img/og/*.png')).map((path) => path.split('/').pop()!.replace(/\.png$/, '')));

/** The picture for a shared link to a post: the site's own file if it has made one for this
 *  post (public/img/og/<post>.png), otherwise the card drawn at build time (pages/og/[slug].png.ts). */
export function ogImageFor(slug: string): string {
	return ogImages.has(slug) ? `/img/og/${slug}.png` : `/og/${slug}.png`;
}

export function blogPostingLd(post: Post, image: string | undefined, words: number) {
	const url = absoluteUrl(postPath(post.id));
	return {
		'@context': 'https://schema.org',
		'@type': 'BlogPosting',
		headline: post.data.title,
		description: post.data.description,
		datePublished: post.data.pubDate.toISOString(),
		dateModified: lastModified(post).toISOString(),
		url,
		author: PERSON,
		publisher: PERSON,
		...(image ? { image: absoluteUrl(image) } : {}),
		mainEntityOfPage: { '@type': 'WebPage', '@id': url },
		wordCount: words,
		...(post.data.tags.length ? { keywords: post.data.tags.join(', ') } : {}),
		inLanguage: SITE.locale,
	};
}

export function breadcrumbLd(items: { name: string; path: string }[]) {
	return {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: items.map((it, i) => ({
			'@type': 'ListItem',
			position: i + 1,
			name: it.name,
			item: absoluteUrl(it.path),
		})),
	};
}
