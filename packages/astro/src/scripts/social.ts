/** /social in the browser: "load more", the image viewer, content warnings, profile cards, the
 *  hashtag panel, remote follow and the "why the fediverse" note. Posts arrive already filtered
 *  (written into the page at build time, then /api/v1/social/feed and /api/v1/social/tag on the
 *  CMS); only the profile card talks to the instance directly. */
import { SOCIAL, handleOf, renderPost, sized, type FeedPage, type FeedPost } from '../lib/fediverse';

const QR_SEEN = 'social-qr-welcome-seen';
const FETCH_TIMEOUT_MS = 9000;
let controller: AbortController | null = null;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;

const store = {
	get(k: string) {
		try {
			return localStorage.getItem(k);
		} catch {
			return null;
		}
	},
	set(k: string, v: string) {
		try {
			localStorage.setItem(k, v);
		} catch {
			/* private mode: the choice just isn't remembered */
		}
	},
};

/** Every dialog closes from its [data-close] buttons and from a click on its backdrop. */
function initDialogs(signal: AbortSignal) {
	document.addEventListener(
		'click',
		(e) => {
			const t = e.target as HTMLElement;
			if (t instanceof HTMLDialogElement && t.open) {
				// A click on the dialog element itself (not its content) is a click on the backdrop.
				const r = t.getBoundingClientRect();
				const { clientX: x, clientY: y } = e as MouseEvent;
				if (x < r.left || x > r.right || y < r.top || y > r.bottom) t.close();
				return;
			}
			const closer = t.closest<HTMLElement>('dialog [data-close]');
			if (closer) closer.closest('dialog')?.close();
		},
		{ signal },
	);
}

// ── Load more ────────────────────────────────────────────────────────────────

interface Feed {
	loadMore: () => Promise<boolean>;
	canLoadMore: () => boolean;
}

function initFeed(signal: AbortSignal): Feed {
	const list = $('social-posts');
	const more = $('social-more');
	const status = $('social-status');
	let link = $<HTMLAnchorElement>('social-load-more');
	let next = Number(more?.dataset.next) || null;
	const total = Number(more?.dataset.total) || 0;
	let loading = false;

	const count = () => list?.querySelectorAll('.sp').length ?? 0;
	const say = (text: string) => {
		if (status) status.textContent = text;
	};

	const finish = () => {
		const end = document.createElement('p');
		end.className = 'social-end';
		end.textContent = 'that is everything';
		link?.replaceWith(end);
		link = null;
		say(`all ${count()} posts shown`);
	};

	const loadMore = async (): Promise<boolean> => {
		if (loading || !next || !list) return false;
		loading = true;
		// Busy, never removed: the reader is aiming at this control.
		link?.setAttribute('aria-disabled', 'true');
		link?.classList.add('is-loading');
		if (link) link.textContent = 'loading…';
		say('loading more posts…');
		try {
			const res = await fetch(`/api/v1/social/feed?page=${next}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]) });
			if (!res.ok) throw new Error(`feed ${res.status}`);
			const page = (await res.json()) as FeedPage;
			const before = count();
			list.insertAdjacentHTML('beforeend', page.data.map((p) => renderPost(p)).join(''));
			next = page.next;
			if (next && link) link.href = `/social?page=${next}`;
			if (next) say(`showing ${count()} of ${total || page.total}`);
			else finish();
			// Keyboard readers continue from the first new post instead of the top of the page.
			return count() > before;
		} catch (err) {
			if (signal.aborted) return false;
			console.error('[social] load more failed:', err);
			say('could not load the next page');
			if (link) link.textContent = 'try again';
			return false;
		} finally {
			loading = false;
			link?.removeAttribute('aria-disabled');
			link?.classList.remove('is-loading');
			if (link && link.textContent === 'loading…') link.textContent = 'load more';
		}
	};

	link?.addEventListener(
		'click',
		(e) => {
			if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // a new tab gets the plain ?page= link
			e.preventDefault();
			const first = count();
			void loadMore().then((added) => {
				if (added) list?.querySelectorAll<HTMLElement>('.sp')[first]?.querySelector<HTMLElement>('.sp__author')?.focus({ preventScroll: true });
			});
		},
		{ signal },
	);

	return { loadMore, canLoadMore: () => !!next && !loading };
}

// ── Content warnings ─────────────────────────────────────────────────────────

function initWarnings(signal: AbortSignal) {
	document.addEventListener(
		'click',
		(e) => {
			const veil = (e.target as HTMLElement).closest<HTMLButtonElement>('.sp-cw');
			if (!veil) return;
			const media = veil.closest<HTMLElement>('.sp-media');
			if (!media) return;
			media.dataset.revealed = '';
			veil.remove();
			media.querySelector<HTMLElement>('.sp-media__open, video')?.focus();
		},
		{ signal },
	);
}

// ── Image viewer ─────────────────────────────────────────────────────────────

function initLightbox(signal: AbortSignal, feed: Feed) {
	const box = $<HTMLDialogElement>('social-lightbox');
	const img = $<HTMLImageElement>('lb-img');
	const alt = $('lb-alt');
	const counter = $('lb-count');
	const prevBtn = $<HTMLButtonElement>('lb-prev');
	const nextBtn = $<HTMLButtonElement>('lb-next');
	const more = $('lb-more');
	const cw = $('lb-cw');
	const cwTitle = $('lb-cw-title');
	if (!box || !img || !alt || !counter || !prevBtn || !nextBtn || !more || !cw || !cwTitle) return;

	let root: HTMLElement | null = null;
	let items: HTMLButtonElement[] = [];
	let idx = -1;

	const collect = () => {
		items = root ? [...root.querySelectorAll<HTMLButtonElement>('.sp-media__open')] : [];
	};
	const postOf = (i: number) => items[i]?.closest('.sp');
	const isMainFeed = () => root?.id === 'social-posts';

	const show = (i: number) => {
		const item = items[i];
		if (!item) return;
		idx = i;
		const post = postOf(i);
		const siblings = items.filter((b) => b.closest('.sp') === post);
		const media = item.closest<HTMLElement>('.sp-media');
		const hidden = !!media && 'cw' in media.dataset && !('revealed' in media.dataset);

		img.classList.remove('is-ready');
		img.onload = () => img.classList.add('is-ready');
		img.src = sized(item.dataset.full ?? '', 2400);
		img.alt = item.dataset.alt ?? '';
		alt.textContent = item.dataset.alt ?? '';
		alt.hidden = !item.dataset.alt;
		const author = post?.querySelector('.sp__name')?.textContent ?? '';
		counter.textContent = `${siblings.indexOf(item) + 1} / ${siblings.length}${author ? ` · ${author}` : ''}`;

		cw.hidden = !hidden;
		cwTitle.textContent = media?.dataset.cwLabel || 'sensitive content';
		box.classList.toggle('is-veiled', hidden);

		const atTail = i >= items.length - 1;
		const canMore = atTail && isMainFeed() && feed.canLoadMore();
		prevBtn.disabled = i <= 0;
		nextBtn.disabled = atTail && !canMore;
		more.textContent = canMore ? 'more' : '';
		nextBtn.setAttribute('aria-label', canMore ? 'Load more posts' : 'Next image');

		// Warm the neighbours so stepping through feels instant.
		for (const n of [items[i + 1], items[i - 1]]) if (n?.dataset.full) new Image().src = sized(n.dataset.full, 2400);
	};

	const step = async (dir: 1 | -1, skipPost = false) => {
		if (idx < 0) return;
		let i = idx;
		if (skipPost) {
			const here = postOf(idx);
			while (items[i + dir] && postOf(i + dir) === here) i += dir;
			// Land on the first image of the previous post, not its last.
			if (dir === -1 && items[i - 1]) {
				const target = postOf(i - 1);
				i -= 1;
				while (items[i - 1] && postOf(i - 1) === target) i -= 1;
				show(i);
				return;
			}
		}
		if (items[i + dir]) {
			show(i + dir);
			return;
		}
		if (dir === 1 && isMainFeed() && feed.canLoadMore()) {
			more.textContent = 'loading…';
			nextBtn.disabled = true;
			const was = idx;
			await feed.loadMore();
			collect();
			if (idx === was) show(items[was + 1] ? was + 1 : was);
		}
	};

	document.addEventListener(
		'click',
		(e) => {
			const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.sp-media__open');
			if (!btn) return;
			root = btn.closest<HTMLElement>('[data-gallery-root]');
			collect();
			show(items.indexOf(btn));
			if (!box.open) box.showModal();
		},
		{ signal },
	);
	prevBtn.addEventListener('click', () => void step(-1), { signal });
	nextBtn.addEventListener('click', () => void step(1), { signal });
	$('lb-cw-btn')?.addEventListener(
		'click',
		() => {
			const media = items[idx]?.closest<HTMLElement>('.sp-media');
			if (media) {
				media.dataset.revealed = '';
				media.querySelector('.sp-cw')?.remove();
			}
			show(idx);
			nextBtn.focus();
		},
		{ signal },
	);
	box.addEventListener(
		'keydown',
		(e) => {
			if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
			e.preventDefault();
			void step(e.key === 'ArrowRight' ? 1 : -1, e.shiftKey);
		},
		{ signal },
	);
	box.addEventListener('close', () => {
		idx = -1;
		img.src = 'data:,';
	}, { signal });

	let x0 = 0;
	let y0 = 0;
	box.addEventListener(
		'touchstart',
		(e) => {
			x0 = e.touches[0]?.clientX ?? 0;
			y0 = e.touches[0]?.clientY ?? 0;
		},
		{ passive: true, signal },
	);
	box.addEventListener(
		'touchend',
		(e) => {
			const t = e.changedTouches[0];
			if (!t) return;
			const dx = t.clientX - x0;
			if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(t.clientY - y0) * 1.5) void step(dx < 0 ? 1 : -1);
		},
		{ passive: true, signal },
	);
}

// ── Profile card ─────────────────────────────────────────────────────────────

interface Account {
	display_name?: string;
	username: string;
	acct: string;
	avatar: string;
	header?: string;
	note?: string;
	url?: string;
	created_at?: string;
	fields?: { name: string; value: string }[];
	followers_count?: number;
	following_count?: number;
	statuses_count?: number;
}

const accounts = new Map<string, Promise<Account | null>>();
function lookup(acct: string): Promise<Account | null> {
	const key = acct.toLowerCase();
	let p = accounts.get(key);
	if (!p) {
		p = fetch(`${SOCIAL.host}/api/v1/accounts/lookup?acct=${encodeURIComponent(acct)}`)
			.then((r) => (r.ok ? (r.json() as Promise<Account>) : null))
			.catch(() => null);
		p.then((a) => a || accounts.delete(key));
		accounts.set(key, p);
	}
	return p;
}

const num = (n?: number) => (n == null ? '–' : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
const joined = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });

function initProfile(signal: AbortSignal) {
	const box = $<HTMLDialogElement>('social-profile');
	if (!box) return;
	const el = {
		banner: $('profile-banner'),
		avatar: $<HTMLImageElement>('profile-avatar'),
		name: $('profile-name'),
		handle: $('profile-handle'),
		bio: $('profile-bio'),
		fields: $('profile-fields'),
		posts: $('profile-posts'),
		following: $('profile-following'),
		followers: $('profile-followers'),
		joined: $('profile-joined'),
		go: $<HTMLAnchorElement>('profile-go'),
		status: $('profile-status'),
	};

	const fill = (a: Account) => {
		if (el.avatar) el.avatar.src = sized(a.avatar, 176);
		if (el.name) el.name.textContent = a.display_name || a.username;
		if (el.handle) el.handle.textContent = handleOf(a.acct);
		// Bio and fields are HTML the instance has already sanitised.
		if (el.bio) el.bio.innerHTML = a.note ?? '';
		if (el.fields) {
			el.fields.innerHTML = (a.fields ?? []).map((f) => `<div><dt>${f.name}</dt><dd>${f.value}</dd></div>`).join('');
			el.fields.hidden = !a.fields?.length;
		}
		if (el.banner) el.banner.style.backgroundImage = a.header && !a.header.endsWith('/missing.png') ? `url("${sized(a.header, 900)}")` : '';
		if (el.posts) el.posts.textContent = num(a.statuses_count);
		if (el.following) el.following.textContent = num(a.following_count);
		if (el.followers) el.followers.textContent = num(a.followers_count);
		if (el.joined) el.joined.textContent = a.created_at ? `joined ${joined.format(new Date(a.created_at))}` : '';
		if (el.go && a.url) el.go.href = a.url;
		if (el.status) el.status.textContent = '';
	};

	const open = async (acct: string, fallback?: { name: string; avatar: string }) => {
		box.classList.add('is-loading');
		if (el.name) el.name.textContent = fallback?.name ?? acct;
		if (el.handle) el.handle.textContent = handleOf(acct);
		if (el.avatar) el.avatar.src = fallback?.avatar ?? 'data:,';
		for (const k of ['bio', 'fields'] as const) if (el[k]) el[k].innerHTML = '';
		if (el.fields) el.fields.hidden = true;
		if (el.banner) el.banner.style.backgroundImage = '';
		if (el.go) el.go.href = acct.includes('@') ? `https://${acct.split('@')[1]}/@${acct.split('@')[0]}` : `${SOCIAL.host}/users/${acct}`;
		if (!box.open) box.showModal();
		const a = await lookup(acct);
		box.classList.remove('is-loading');
		if (a) fill(a);
		else if (el.status) el.status.textContent = 'Could not load this profile right now.';
	};

	document.addEventListener(
		'click',
		(e) => {
			const trigger = (e.target as HTMLElement).closest<HTMLElement>('[data-profile]');
			if (!trigger) return;
			const post = trigger.closest('.sp');
			void open(trigger.dataset.profile || SOCIAL.acct, post ? { name: post.querySelector('.sp__name')?.textContent ?? '', avatar: post.querySelector<HTMLImageElement>('.sp__avatar')?.src ?? '' } : undefined);
		},
		{ signal },
	);
}

// ── Hashtag panel ────────────────────────────────────────────────────────────

const TAG_HREF = /\/tags?\/([^/?#]+)\/?(?:[?#].*)?$/i;

function initTags(signal: AbortSignal) {
	const box = $<HTMLDialogElement>('social-tags');
	const title = $('tags-title');
	const list = $('tags-list');
	const status = $('tags-status');
	if (!box || !title || !list || !status) return;
	let inflight: AbortController | null = null;

	const open = async (tag: string) => {
		inflight?.abort();
		inflight = new AbortController();
		title.textContent = `#${tag}`;
		list.innerHTML = '';
		status.textContent = 'loading…';
		if (!box.open) box.showModal();
		try {
			const res = await fetch(`/api/v1/social/tag?tag=${encodeURIComponent(tag)}`, { signal: AbortSignal.any([inflight.signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]) });
			if (!res.ok) throw new Error(`tag ${res.status}`);
			const { data: posts } = (await res.json()) as { data: FeedPost[] };
			list.innerHTML = posts.map((p) => renderPost(p)).join('');
			status.textContent = posts.length ? `${posts.length} post${posts.length === 1 ? '' : 's'} tagged #${tag}` : `No posts tagged #${tag} yet.`;
			list.scrollTop = 0;
		} catch (err) {
			if ((err as Error).name === 'AbortError' && inflight.signal.aborted) return;
			status.textContent = 'Could not load these posts right now.';
		}
	};

	box.addEventListener('close', () => inflight?.abort(), { signal });
	document.addEventListener(
		'click',
		(e) => {
			const m = e as MouseEvent;
			if (m.defaultPrevented || m.button !== 0 || m.metaKey || m.ctrlKey || m.shiftKey || m.altKey) return;
			const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('.sp__body a');
			if (!a) return;
			const tag = a.dataset.tag || decodeURIComponent(a.getAttribute('href')?.match(TAG_HREF)?.[1] ?? '');
			if (!tag) return;
			e.preventDefault();
			void open(tag);
		},
		{ signal },
	);
}

// ── Follow ───────────────────────────────────────────────────────────────────

function initFollow(signal: AbortSignal) {
	const box = $<HTMLDialogElement>('social-follow');
	const form = $<HTMLFormElement>('follow-form');
	const input = $<HTMLInputElement>('follow-handle');
	const error = $('follow-error');
	if (!box || !form || !input || !error) return;

	const fail = (msg: string) => {
		error.textContent = msg;
		input.setAttribute('aria-invalid', 'true');
		input.focus();
	};
	$('social-follow-btn')?.addEventListener(
		'click',
		() => {
			error.textContent = '';
			input.removeAttribute('aria-invalid');
			box.showModal();
		},
		{ signal },
	);
	form.addEventListener(
		'submit',
		(e) => {
			e.preventDefault();
			const handle = input.value.trim();
			if (!handle) return fail('Enter your fediverse handle, e.g. you@mastodon.social.');
			const m = handle.match(/^@?([^@\s]+)@([^@/\s]+\.[^@/\s]+)$/);
			if (!m) return fail('That should look like you@instance.tld.');
			// authorize_interaction: Mastodon 3+, Pleroma, Akkoma and Misskey all take it.
			window.location.href = `https://${m[2]}/authorize_interaction?uri=${encodeURIComponent(SOCIAL.profileUrl)}`;
		},
		{ signal },
	);
}

// ── Why the fediverse ────────────────────────────────────────────────────────

function initWhy(signal: AbortSignal) {
	const box = $<HTMLDialogElement>('social-why');
	if (!box) return;
	const buttons = [...box.querySelectorAll<HTMLButtonElement>('button[data-lang]')];
	const articles = [...box.querySelectorAll<HTMLElement>('article[data-lang]')];
	const ok = $('why-ok');
	const labels: Record<string, string> = { sv: 'Jag förstår', en: 'I understand', pt: 'Eu compreendo' };
	let fromQr = false;

	const setLang = (lang: string) => {
		for (const a of articles) a.hidden = a.dataset.lang !== lang;
		for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
		if (ok) ok.textContent = labels[lang] ?? labels.en;
		box.setAttribute('aria-labelledby', 'why-title');
	};
	const nav = (navigator.language || 'en').toLowerCase();
	setLang(nav.startsWith('sv') ? 'sv' : nav.startsWith('pt') ? 'pt' : 'en');
	for (const b of buttons) b.addEventListener('click', () => setLang(b.dataset.lang ?? 'en'), { signal });

	const open = (qr: boolean) => {
		fromQr = qr;
		box.classList.toggle('is-qr', qr);
		setLang(buttons.find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.lang ?? 'en');
		box.showModal();
		box.querySelector<HTMLElement>('.sheet__close')?.focus();
	};
	$('social-why-btn')?.addEventListener('click', () => open(false), { signal });
	// Only the confirm button remembers the choice; closing with × or Esc shows it again next time.
	ok?.addEventListener('click', () => fromQr && store.set(QR_SEEN, '1'), { signal });

	if (new URLSearchParams(location.search).get('from') === 'qr' && store.get(QR_SEEN) !== '1') open(true);
}

function init() {
	// Which server and whose profile: the page says, in data attributes on its root element.
	// (On the server these come from the CMS; the browser has only the page to go by.)
	const root = document.querySelector<HTMLElement>('.social');
	if (root) {
		SOCIAL.host = root.dataset.host ?? '';
		SOCIAL.acct = root.dataset.acct ?? '';
		SOCIAL.profileUrl = root.dataset.profileUrl ?? '';
		SOCIAL.mediaHost = root.dataset.mediaHost ?? '';
	}
	controller?.abort();
	if (!document.getElementById('social-lightbox')) return;
	controller = new AbortController();
	const { signal } = controller;
	initDialogs(signal);
	const feed = initFeed(signal);
	initWarnings(signal);
	initLightbox(signal, feed);
	initProfile(signal);
	initTags(signal);
	initFollow(signal);
	initWhy(signal);

	// The posts on this page were written into it when the site was last built. Asking the CMS
	// for its newest page costs it one read from disk, and is also what makes it look for new
	// posts on the instance when it has not for a while; if it finds any, it rebuilds this page.
	// Nothing is done with the answer here.
	void fetch('/api/v1/social/feed?page=1', { signal }).catch(() => {});
}

document.addEventListener('astro:page-load', init);
