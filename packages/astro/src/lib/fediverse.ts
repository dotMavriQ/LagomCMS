/** /social, shared by the server render and the browser, so a post looks the same whether it
 *  arrived with the page, through "load more", or in the hashtag panel. Pure functions only:
 *  nothing here touches the network or the environment.
 *
 *  The timeline, and the hashtag panel with it, comes from the CMS's fediverse archive, the
 *  single owner of the visibility rules. Nothing here filters. */

/** Which fediverse server and profile the page is about. Set from the CMS (Social, in the
 *  admin): on the server by lib/settings.ts, and in the browser from the data attributes
 *  /social prints on its root element, since the browser has no CMS to ask. */
export const SOCIAL = {
	/** The server's address, e.g. https://mastodon.social. */
	host: '',
	/** The owner's account name on it, without the leading @. */
	acct: '',
	/** The address of the owner's profile. */
	profileUrl: '',
	/** An image host that resizes on request with ?width=, or '' for none. */
	mediaHost: '',
};

export interface FeedMedia {
	type: string;
	url: string;
	preview_url: string;
	description?: string | null;
	width?: number;
	height?: number;
}

/** A post as the social-feed service serves it: already filtered and trimmed. */
export interface FeedPost {
	id: string;
	url?: string;
	created_at: string;
	content: string;
	sensitive: boolean;
	spoiler_text?: string | null;
	account: { acct: string; display_name?: string | null; avatar: string };
	media?: FeedMedia[] | null;
}

export interface FeedPage {
	data: FeedPost[];
	page: number;
	pages: number;
	total: number;
	/** Next page number, or null at the end. */
	next: number | null;
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const formatDate = (iso: string) => dateFmt.format(new Date(iso));

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Some media hosts resize on request (?width=): a multi-megabyte original becomes a few KB.
 *  Only done for the host named in the Social settings; any other address is left alone. */
export function sized(url: string, width: number): string {
	try {
		const u = new URL(url);
		if (SOCIAL.mediaHost && u.hostname === SOCIAL.mediaHost) {
			u.searchParams.set('width', String(width));
			return u.toString();
		}
	} catch {
		/* not a URL: leave as is */
	}
	return url;
}

/** "ada" on the home server becomes "@ada@example.social"; a remote "ada@other.town" already says where it lives. */
export const handleOf = (acct: string) => (acct.includes('@') || !SOCIAL.host ? `@${acct}` : `@${acct}@${new URL(SOCIAL.host).host}`);

function renderMedia(post: FeedPost, media: FeedMedia[], lead: boolean): string {
	const cw = (post.spoiler_text ?? '').trim();
	const items = media
		.map((m, i) => {
			const alt = (m.description ?? '').trim();
			if (m.type === 'video' || m.type === 'gifv') {
				const gif = m.type === 'gifv';
				return (
					`<div class="sp-media__item">` +
					`<video src="${esc(m.url)}" poster="${esc(sized(m.preview_url, 960))}" ${gif ? 'autoplay loop muted' : 'controls'} playsinline preload="none"` +
					`${alt ? ` aria-label="${esc(alt)}"` : ''}></video></div>`
				);
			}
			const label = `Open image ${i + 1} of ${media.length}${alt ? `: ${alt}` : ''}`;
			return (
				`<div class="sp-media__item">` +
				`<button type="button" class="sp-media__open" data-full="${esc(m.url)}" data-alt="${esc(alt)}" aria-label="${esc(label)}">` +
				`<img src="${esc(sized(m.preview_url, 960))}" alt="${esc(alt)}"${m.width && m.height ? ` width="${m.width}" height="${m.height}"` : ''} ${lead && i === 0 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'} decoding="async">` +
				`</button></div>`
			);
		})
		.join('');
	const veil = post.sensitive
		? `<button type="button" class="sp-cw" aria-label="Show media: ${esc(cw || 'sensitive content')}"><span class="sp-cw__title">${esc(cw || 'sensitive content')}</span><span class="sp-cw__hint">show media</span></button>`
		: '';
	return `<div class="sp-media" data-count="${media.length}"${post.sensitive ? ' data-cw' : ''}${cw ? ` data-cw-label="${esc(cw)}"` : ''}>${items}${veil}</div>`;
}

/** One post as an <article>. `content` is HTML the instance has already sanitised. */
/** `lead`: the first post on the page, whose first image is likely the largest paint and so loads eagerly. */
export function renderPost(post: FeedPost, lead = false): string {
	const name = post.account.display_name || post.account.acct;
	const media = (post.media ?? []).slice(0, 4);
	const date = `<time datetime="${esc(post.created_at)}">${formatDate(post.created_at)}</time>`;
	return (
		`<article class="sp" data-acct="${esc(post.account.acct)}">` +
		`<header class="sp__head">` +
		`<button type="button" class="sp__author" data-profile="${esc(post.account.acct)}" aria-haspopup="dialog">` +
		`<img class="sp__avatar" src="${esc(sized(post.account.avatar, 96))}" alt="" width="44" height="44" loading="lazy" decoding="async">` +
		`<span class="sp__who"><span class="sp__name">${esc(name)}</span><span class="sp__handle">${esc(handleOf(post.account.acct))}</span></span>` +
		`</button>` +
		(post.url ? `<a class="sp__date" href="${esc(post.url)}" target="_blank" rel="noopener">${date}<span class="sr-only"> (open post on the fediverse, new tab)</span></a>` : `<span class="sp__date">${date}</span>`) +
		`</header>` +
		`<div class="sp__body">${post.content}</div>` +
		(media.length ? renderMedia(post, media, lead) : '') +
		`</article>`
	);
}
