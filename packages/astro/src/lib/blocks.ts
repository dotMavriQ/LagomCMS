/** Turns the CMS's `blocks` tree (see lib/lagom.ts) into the HTML the stylesheet expects.
 *
 *  It knows these blocks: paragraph, heading, blockquote, list, code, table, image, html,
 *  thematic_break and footnote_definition, plus the four the editor inserts as blocks of
 *  their own: callout, figure, gallery and embed. Inline, it knows strong, em, code and link,
 *  and footnote references. A block it does not know is left out, so a new kind of block in
 *  the editor needs a case added here before it shows on the site.
 */
import { createHighlighter, type Highlighter } from 'shiki';
import { gruvboxMaterialDark, gruvboxMaterialLight } from '../themes/gruvbox-material';
import type { Block, Span } from './lagom';

const esc = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// One highlighter, reused across requests (creating one is the expensive part — loading the
// grammar/theme data — tokenizing a snippet with an existing instance is cheap).
let highlighterPromise: Promise<Highlighter> | undefined;
function getHighlighter() {
	highlighterPromise ??= createHighlighter({
		themes: [gruvboxMaterialLight, gruvboxMaterialDark],
		langs: ['php', 'js', 'ts', 'jsx', 'tsx', 'bash', 'sh', 'lua', 'json', 'yaml', 'markdown', 'html', 'css', 'sql', 'python', 'astro', 'diff', 'text', 'plaintext'],
	});
	return highlighterPromise;
}

function spansToHtml(spans: Span[] | Record<string, never> | undefined, footnoteRefs: Map<string, number>): string {
	if (!spans || !Array.isArray(spans)) return ''; // LagomCMS emits `{}` for an empty table cell
	return spans
		.map((s) => {
			if (s.type === 'footnote_reference') {
				const label = s.label ?? '';
				let n = footnoteRefs.get(label);
				if (!n) {
					n = footnoteRefs.size + 1;
					footnoteRefs.set(label, n);
				}
				return `<sup><a href="#user-content-fn-${esc(label)}" id="user-content-fnref-${esc(label)}" data-footnote-ref aria-describedby="footnote-label">${n}</a></sup>`;
			}
			let text = esc(s.text ?? '');
			for (const mark of s.marks ?? []) {
				if (mark === 'strong') text = `<strong>${text}</strong>`;
				else if (mark === 'em') text = `<em>${text}</em>`;
				else if (mark === 'code') text = `<code>${text}</code>`;
				else if (mark === 'link') {
					// A link titled "me" in the Markdown, [text](url "me"), points at the author's own
					// profile: rel="me" says so to anything that verifies identities that way.
					const rel = s.title === 'me' ? 'me noopener' : 'noopener';
					text = `<a href="${esc(s.href ?? '#')}"${/^https?:\/\//.test(s.href ?? '') ? ` target="_blank" rel="${rel}"` : ''}>${text}</a>`;
				}
			}
			return text;
		})
		.join('');
}

interface RenderCtx {
	highlighter: Highlighter;
	footnoteRefs: Map<string, number>;
	footnoteDefs: { label: string; html: string }[];
	/** Precomputed by extractHeadings() and consumed here in order — a single source of truth
	 *  for slugs, so the TOC's links and the rendered <h2>/<h3> ids can never drift apart. */
	headings: { slug: string }[];
	headingIndex: number;
}

/** Sequential, not Promise.all: several branches below increment ctx.headingIndex as a side
 *  effect, and that counter is only correct if blocks are awaited in document order. Nothing here
 *  is slow enough (Shiki tokenizing a snippet against an already-loaded highlighter is fast) for
 *  running serially to matter. */
async function blocksToHtml(bs: Block[], ctx: RenderCtx): Promise<string> {
	const out: string[] = [];
	for (const b of bs) out.push(await blockToHtml(b, ctx));
	return out.join('');
}

/** `Block` is deliberately loose (see lagom.ts): each branch below knows the real shape of its
 *  own kind of block, and this is the one place that says so to the type checker. A plain `as`
 *  is not enough, because an index-signature type and a concrete one do not "sufficiently
 *  overlap", hence the step through `unknown`. */
const shape = <T>(b: Block): T => b as unknown as T;

async function blockToHtml(b: Block, ctx: RenderCtx): Promise<string> {
	switch (b.type) {
		case 'paragraph':
			return `<p>${spansToHtml(shape<{ spans?: Span[] }>(b).spans, ctx.footnoteRefs)}</p>`;
		case 'heading': {
			const h = shape<{ level: number; spans: Span[] }>(b);
			const text = spansToHtml(h.spans, ctx.footnoteRefs);
			// ctx.headings was built by extractHeadings() over this same blocks tree, in the same
			// (depth-first, blockquote/list-aware) order, so this index always lines up.
			const id = ctx.headings[ctx.headingIndex++]?.slug ?? '';
			return `<h${h.level} id="${id}">${text}</h${h.level}>`;
		}
		case 'blockquote':
			return `<blockquote>${await blocksToHtml(shape<{ blocks: Block[] }>(b).blocks, ctx)}</blockquote>`;
		case 'list': {
			// Every item is `{ blocks: Block[] }`, even one that holds a single paragraph. Never a bare
			// array, never a bare `{ spans }`.
			const l = shape<{ ordered?: boolean; start?: number; items: { blocks: Block[] }[] }>(b);
			const tag = l.ordered ? 'ol' : 'ul';
			const startAttr = l.ordered && l.start && l.start !== 1 ? ` start="${l.start}"` : '';
			const items: string[] = [];
			for (const it of l.items) items.push(`<li>${await blocksToHtml(it.blocks, ctx)}</li>`);
			return `<${tag}${startAttr}>${items.join('')}</${tag}>`;
		}
		case 'code': {
			const c = shape<{ language?: string; text: string }>(b);
			const lang = c.language && ctx.highlighter.getLoadedLanguages().includes(c.language) ? c.language : 'text';
			return ctx.highlighter.codeToHtml(c.text, { lang, themes: { light: 'gruvbox-material-light', dark: 'gruvbox-material-dark' }, defaultColor: false });
		}
		case 'table': {
			const t = shape<{ rows: { cells: { spans: Span[] | Record<string, never> }[]; header: boolean }[] }>(b);
			const rows = t.rows
				.map((row) => {
					const cellTag = row.header ? 'th' : 'td';
					const cells = row.cells.map((c) => `<${cellTag}>${spansToHtml(c.spans, ctx.footnoteRefs)}</${cellTag}>`).join('');
					return `<tr>${cells}</tr>`;
				})
				.join('');
			return `<table>${rows}</table>`;
		}
		case 'image': {
			const img = shape<{ src: string; alt?: string; caption?: string }>(b);
			const figure = `<img src="${esc(img.src)}" alt="${esc(img.alt ?? '')}" loading="lazy" decoding="async" />`;
			return img.caption ? `<figure>${figure}<figcaption>${esc(img.caption)}</figcaption></figure>` : figure;
		}
		case 'callout': {
			// "> [!note] Title" in the Markdown. Unknown tones fall back to the note styling.
			const c = shape<{ tone?: string; title?: string; blocks?: Block[] }>(b);
			const tone = ['note', 'tip', 'warning', 'info', 'quote'].includes(c.tone ?? '') ? c.tone : 'note';
			const title = c.title ? `<p class="callout__title">${esc(c.title)}</p>` : '';
			return `<aside class="callout callout--${tone}">${title}${await blocksToHtml(Array.isArray(c.blocks) ? c.blocks : [], ctx)}</aside>`;
		}
		case 'figure': {
			const f = shape<MediaImage & { caption?: string; link?: string; size?: string }>(b);
			if (!f.src) return '';
			const size = f.size === 'wide' || f.size === 'small' ? ` figure--${f.size}` : '';
			const image = f.link ? `<a href="${esc(f.link)}">${imageTag(f)}</a>` : imageTag(f);
			const caption = f.caption ? `<figcaption>${esc(f.caption)}</figcaption>` : '';
			return `<figure class="figure${size}">${image}${caption}</figure>`;
		}
		case 'gallery': {
			const g = shape<{ images?: MediaImage[]; caption?: string }>(b);
			const images = (Array.isArray(g.images) ? g.images : []).filter((i) => i.src);
			if (images.length === 0) return '';
			// Each thumbnail links to the full image, so it works with no script at all.
			const items = images.map((i) => `<a href="${esc(i.src)}">${imageTag(i)}</a>`).join('');
			const caption = g.caption ? `<figcaption>${esc(g.caption)}</figcaption>` : '';
			return `<figure class="gallery"><div class="gallery__grid">${items}</div>${caption}</figure>`;
		}
		case 'embed': {
			const e = shape<{ url?: string; caption?: string }>(b);
			if (!e.url || !/^https?:\/\//.test(e.url)) return '';
			const caption = e.caption ? `<figcaption>${esc(e.caption)}</figcaption>` : '';
			const player = playerUrl(e.url);
			if (player) {
				return `<figure class="embed"><div class="embed__frame"><iframe src="${esc(player)}" title="${esc(e.caption ?? 'Embedded video')}" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>${caption}</figure>`;
			}
			// Anything that is not a known video host is a plain, honest link.
			return `<figure class="embed embed--link"><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.url.replace(/^https?:\/\/(www\.)?/, ''))}</a>${caption}</figure>`;
		}
		case 'html':
			// Author-authored (LagomCMS admin only, not visitor input): trusted the same way the old
			// remark pipeline trusted raw HTML embedded in markdown source.
			return shape<{ html: string }>(b).html;
		case 'thematic_break':
			return '<hr />';
		case 'footnote_definition': {
			const fd = shape<{ label: string; blocks: Block[] }>(b);
			// stashed, not returned inline — footnote defs render once, in order, after the body
			ctx.footnoteDefs.push({ label: fd.label, html: await blocksToHtml(fd.blocks, ctx) });
			return '';
		}
		default:
			return '';
	}
}

interface MediaImage {
	src: string;
	alt?: string;
	width?: number;
	height?: number;
}

/** An <img> for an uploaded image. Width and height (recorded by the CMS at upload) let the browser
 *  reserve the space before the file arrives, so the text does not jump. */
function imageTag(image: MediaImage): string {
	const size = image.width && image.height ? ` width="${image.width}" height="${image.height}"` : '';
	return `<img src="${esc(image.src)}" alt="${esc(image.alt ?? '')}"${size} loading="lazy" decoding="async" />`;
}

/** The privacy-friendlier player address for a YouTube or Vimeo link, or null for anything else.
 *  youtube-nocookie.com sets no cookies until the visitor presses play. */
function playerUrl(url: string): string | null {
	const youtube = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{11})/.exec(url);
	if (youtube) return `https://www.youtube-nocookie.com/embed/${youtube[1]}`;
	const vimeo = /^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/.exec(url);
	if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}?dnt=1`;
	return null;
}

/** A document's blocks as HTML: the blocks themselves, then, if the text refers to any
 *  footnotes, a footnotes section at the end.
 *  `headings` must be extractHeadings(blocks) over this same tree. Call that first and pass its
 *  result here, so the table of contents and the heading ids are certain to agree (see RenderCtx). */
export async function renderBlocks(blocks: Block[], headings: { slug: string }[]): Promise<string> {
	const ctx: RenderCtx = { highlighter: await getHighlighter(), footnoteRefs: new Map(), footnoteDefs: [], headings, headingIndex: 0 };
	const body = await blocksToHtml(blocks, ctx);
	if (ctx.footnoteRefs.size === 0) return body;

	// Emit definitions in the order they were first referenced in the body, not document order —
	// matches remark-footnotes and keeps [1][2][3] reading top to bottom.
	const byLabel = new Map(ctx.footnoteDefs.map((d) => [d.label, d.html]));
	const ordered = [...ctx.footnoteRefs.entries()].sort((a, b) => a[1] - b[1]);
	const items = ordered
		.map(([label, n]) => {
			const html = byLabel.get(label) ?? '';
			const backref = ` <a href="#user-content-fnref-${esc(label)}" data-footnote-backref class="data-footnote-backref" aria-label="Back to reference ${n}">↩</a>`;
			return html.endsWith('</p>') ? `<li id="user-content-fn-${esc(label)}">${html.slice(0, -4)}${backref}</p></li>` : `<li id="user-content-fn-${esc(label)}">${html}${backref}</li>`;
		})
		.join('');
	return `${body}<section class="footnotes" data-footnotes><h2 id="footnote-label" class="sr-only">Footnotes</h2><ol>${items}</ol></section>`;
}

/** heading text -> id, GitHub/rehype-slug style: lowercase, strip punctuation, spaces to hyphens,
 *  de-duplicated against every heading already seen in this post via `seen`. */
function slugify(text: string, seen: Map<string, number>): string {
	const base = text
		.toLowerCase()
		.trim()
		.replace(/[^\p{L}\p{N}\s-]/gu, '')
		.replace(/\s+/g, '-');
	const n = seen.get(base) ?? 0;
	seen.set(base, n + 1);
	return n === 0 ? base : `${base}-${n}`;
}

/** The headings of a document, for a table of contents, as {depth, slug, text}. It walks the
 *  tree the same way blockToHtml does (into quotes and list items), so it cannot find a heading
 *  that blockToHtml would not also find. Call this BEFORE renderBlocks() and pass the result in:
 *  renderBlocks then reuses these ids by position instead of working them out a second time,
 *  which is what keeps a link in the table of contents and its heading from drifting apart. */
export function extractHeadings(blocks: Block[]): { depth: number; slug: string; text: string }[] {
	const seen = new Map<string, number>();
	const out: { depth: number; slug: string; text: string }[] = [];
	const walk = (bs: Block[]) => {
		for (const b of bs) {
			if (b.type === 'heading') {
				const h = shape<{ level: number; spans: Span[] }>(b);
				const text = h.spans.map((s) => s.text ?? '').join('');
				out.push({ depth: h.level, slug: slugify(text, seen), text });
			} else if (b.type === 'blockquote' || b.type === 'callout') {
				const inner = shape<{ blocks?: Block[] }>(b).blocks;
				if (Array.isArray(inner)) walk(inner);
			} else if (b.type === 'list') {
				for (const it of shape<{ items: { blocks: Block[] }[] }>(b).items) walk(it.blocks);
			}
		}
	};
	walk(blocks);
	return out;
}
