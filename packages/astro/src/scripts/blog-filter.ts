/** Blog list: tag filter (AND), fuzzy search, "load more", URL-shareable state.
 *  Ported from the previous site so links like /blog?tags=ai,cms&q=llm keep working. */

interface IndexEntry {
	slug: string;
	title: string;
	excerpt: string;
	tags: string;
	body: string;
}

const PAGE_SIZE = 6;
const ALL = '__all__';

/* ---------- fuzzy scoring ---------- */

function levenshtein(a: string, b: string, max: number): number {
	if (Math.abs(a.length - b.length) > max) return max + 1;
	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	const cur = new Array<number>(b.length + 1);
	for (let i = 1; i <= a.length; i++) {
		cur[0] = i;
		for (let j = 1; j <= b.length; j++) {
			cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
		}
		prev = cur.slice();
	}
	return prev[b.length];
}

const tolerance = (len: number) => (len <= 4 ? 0 : len <= 7 ? 1 : len <= 11 ? 2 : 3);

const tokenize = (s: string) =>
	s
		.toLowerCase()
		.split(/[\s,.:;!?'"_\-/\\()[\]{}|]+/)
		.filter((t) => t.length > 0);

function tokenScore(q: string, candidates: string[]): number {
	let best = 0;
	const tol = tolerance(q.length);
	for (const c of candidates) {
		if (c === q) return 100;
		if (c.startsWith(q)) {
			best = Math.max(best, 85);
			continue;
		}
		if (tol > 0) {
			const d = levenshtein(q, c, tol);
			if (d <= tol) best = Math.max(best, 70 - d * 15);
		}
	}
	return best;
}

function averageScore(queryTokens: string[], candidates: string[]): number {
	if (!candidates.length) return 0;
	let sum = 0;
	for (const q of queryTokens) {
		const s = tokenScore(q, candidates);
		if (s === 0) return 0;
		sum += s;
	}
	return sum / queryTokens.length;
}

function score(query: string, post: Pick<IndexEntry, 'title' | 'excerpt' | 'tags' | 'body'>): number {
	if (!query) return 1;
	const q = query.toLowerCase();
	const queryTokens = tokenize(q);
	if (!queryTokens.length) return 1;

	const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const wordRe = queryTokens.length === 1 ? new RegExp(`\\b${escaped}\\b`) : null;
	const has = (s: string) => (wordRe ? wordRe.test(s.toLowerCase()) : s.toLowerCase().includes(q));

	if (has(post.title)) return 1000;
	if (has(post.body)) return 500;
	if (has(post.tags)) return 450;
	if (has(post.excerpt)) return 400;

	return Math.max(
		averageScore(queryTokens, tokenize(post.title)) * 4,
		averageScore(queryTokens, tokenize(post.tags)) * 2.5,
		averageScore(queryTokens, tokenize(post.excerpt)) * 1.5,
		averageScore(queryTokens, post.body ? tokenize(post.body) : []),
	);
}

/* ---------- page behaviour ---------- */

let controller: AbortController | null = null;

function init() {
	controller?.abort();
	controller = new AbortController();
	const { signal } = controller;

	const search = document.getElementById('blog-search') as HTMLInputElement | null;
	const grid = document.getElementById('blog-grid');
	const buttons = [...document.querySelectorAll<HTMLButtonElement>('#tag-filter .tag-btn')];
	const count = document.getElementById('filter-count');
	const allBtn = buttons.find((b) => b.dataset.tag === ALL);
	const loadBtn = document.getElementById('load-more-btn');
	const loadWrap = document.getElementById('load-more-wrap');
	if (!grid) return;

	const cards = [...grid.querySelectorAll<HTMLLIElement>(':scope > li')];

	// Browsers don't fetch a mask image for a hidden element until it is shown, so thumbnails of the
	// cards behind "load more" (or a filter) would pop in late. Warm them up while the page is idle.
	const warmThumbnails = () => {
		for (const card of cards) {
			if (!card.hidden) continue;
			const art = card.querySelector<HTMLElement>('.art')?.style.getPropertyValue('--art');
			const url = art?.match(/url\(["']?([^"')]+)/)?.[1];
			if (url) new Image().src = url;
		}
	};
	if ('requestIdleCallback' in window) requestIdleCallback(warmThumbnails);
	else setTimeout(warmThumbnails, 1500);
	const selected = new Set<string>();
	let query = '';
	let visible = PAGE_SIZE;
	let timer: number | undefined;
	let index: Map<string, IndexEntry> | null = null;
	let loading = false;

	async function loadIndex() {
		if (index || loading) return;
		loading = true;
		try {
			const res = await fetch('/search-index.json');
			const entries: IndexEntry[] = await res.json();
			index = new Map(entries.map((e) => [e.slug, e]));
		} catch {
			/* search falls back to title/tags/excerpt only */
		}
		loading = false;
	}

	function syncUrl() {
		const url = new URL(location.href);
		if (selected.size) url.searchParams.set('tags', [...selected].join(','));
		else url.searchParams.delete('tags');
		if (query) url.searchParams.set('q', query);
		else url.searchParams.delete('q');
		history.replaceState(history.state, '', url);
	}

	const scoreOf = (card: HTMLLIElement) =>
		!query
			? 1
			: score(query, {
					title: card.dataset.title ?? '',
					excerpt: card.dataset.excerpt ?? '',
					tags: card.dataset.tags ?? '',
					body: index?.get(card.dataset.slug ?? '')?.body ?? '',
				});

	function render() {
		const noTags = selected.size === 0;
		const filtering = !!query || !noTags;

		const scored = cards.map((el) => {
			const tags = el.dataset.tags?.split(',') ?? [];
			const match = noTags || [...selected].every((t) => tags.includes(t));
			return { el, score: match ? scoreOf(el) : 0 };
		});

		if (query) {
			scored.sort((a, b) => b.score - a.score);
			for (const { el } of scored) grid!.appendChild(el);
		}

		grid!.toggleAttribute('data-filtering', filtering);

		let matched = 0;
		let shown = 0;
		for (const { el, score: s } of scored) {
			if (s > 0) {
				matched++;
				const show = filtering || matched <= visible;
				el.hidden = !show;
				if (show) shown++;
			} else {
				el.hidden = true;
			}
		}

		// Year headings: the first visible post of each year gets one. The lead story stands apart, and a
		// search or filter orders by relevance, where years would only interrupt.
		let year = '';
		for (const el of grid!.querySelectorAll<HTMLLIElement>(':scope > li')) {
			const lead = !filtering && el.hasAttribute('data-featured');
			const start = !filtering && !el.hidden && !lead && el.dataset.year !== year;
			el.toggleAttribute('data-year-start', start);
			if (!filtering && !el.hidden && !lead) year = el.dataset.year ?? '';
		}

		if (allBtn) {
			allBtn.dataset.active = String(noTags);
			allBtn.setAttribute('aria-pressed', String(noTags));
		}
		if (loadWrap) loadWrap.hidden = filtering || visible >= matched;
		if (count) {
			if (noTags && !query) count.hidden = true;
			else {
				count.textContent = `${shown} result${shown === 1 ? '' : 's'}`;
				count.hidden = false;
			}
		}
		syncUrl();
	}

	const setTag = (btn: HTMLButtonElement, on: boolean) => {
		btn.dataset.active = String(on);
		btn.setAttribute('aria-pressed', String(on));
	};

	for (const btn of buttons) {
		btn.addEventListener(
			'click',
			() => {
				const tag = btn.dataset.tag;
				if (!tag) return;
				if (tag === ALL) {
					selected.clear();
					for (const b of buttons) if (b.dataset.tag !== ALL) setTag(b, false);
				} else if (selected.has(tag)) {
					selected.delete(tag);
					setTag(btn, false);
				} else {
					selected.add(tag);
					setTag(btn, true);
				}
				render();
			},
			{ signal },
		);
	}

	// Fetch the full-text index on intent (hover/focus) so the first keystroke doesn't wait on it,
	// without making every visitor download it.
	for (const type of ['pointerenter', 'focus'])
		search?.addEventListener(type, loadIndex, { once: true, signal });

	search?.addEventListener(
		'input',
		() => {
			clearTimeout(timer);
			timer = window.setTimeout(async () => {
				query = search.value.trim();
				if (query && !index) await loadIndex();
				render();
			}, 150);
		},
		{ signal },
	);

	loadBtn?.addEventListener(
		'click',
		() => {
			visible += PAGE_SIZE;
			render();
		},
		{ signal },
	);

	// Restore state from the URL (shareable links).
	const params = new URL(location.href).searchParams;
	for (const tag of params.get('tags')?.split(',') ?? []) {
		const btn = buttons.find((b) => b.dataset.tag === tag);
		if (btn) {
			selected.add(tag);
			setTag(btn, true);
		}
	}
	const q = params.get('q');
	if (q && search) {
		search.value = q;
		query = q;
		loadIndex().then(render);
	} else {
		render();
	}
}

document.addEventListener('astro:page-load', init);
