/** Site-wide behaviour. Loaded once; re-binds on every view-transition navigation. */
import { initOliv } from './oliv';
import { initShakeQr } from './shake-qr';

/** E-mail addresses are stored as atob(reverse(token)) in `data-m`, so they never
 *  appear in the HTML source. Decoded here into a mailto: link. */
function revealEmails() {
	document.querySelectorAll<HTMLAnchorElement>('a[data-m]').forEach((a) => {
		try {
			const address = atob([...(a.dataset.m ?? '')].reverse().join(''));
			a.href = `mailto:${address}`;
			if (a.dataset.reveal !== undefined) a.textContent = address;
		} catch {
			/* malformed token: leave the link inert */
		}
	});
}

/** Table of contents: expanded by default on wide screens, collapsed on narrow ones. */
function syncToc() {
	const toc = document.querySelector<HTMLDetailsElement>('details.toc');
	if (!toc) return;
	toc.open = matchMedia('(min-width: 64rem)').matches;
}

document.addEventListener('click', (event) => {
	if (event.target instanceof Element && event.target.closest('#cv-print-btn')) window.print();
});

matchMedia('(min-width: 64rem)').addEventListener('change', syncToc);

/** On paper "email me" is useless: print the real address, then restore the link text. */
window.addEventListener('beforeprint', () => {
	document.querySelectorAll<HTMLAnchorElement>('a[data-print-reveal]').forEach((a) => {
		if (!a.href.startsWith('mailto:')) return;
		a.dataset.screenText = a.innerHTML;
		a.textContent = a.href.slice('mailto:'.length);
	});
});
window.addEventListener('afterprint', () => {
	document.querySelectorAll<HTMLAnchorElement>('a[data-print-reveal]').forEach((a) => {
		if (a.dataset.screenText !== undefined) {
			a.innerHTML = a.dataset.screenText;
			delete a.dataset.screenText;
		}
	});
});

/** Thin reading-progress bar on posts (decorative; the page scrolls normally without it). */
let progressAbort: AbortController | null = null;
function initProgress() {
	progressAbort?.abort();
	const bar = document.getElementById('reading-progress');
	const body = document.querySelector('.post-body');
	if (!bar || !body) return;
	progressAbort = new AbortController();
	let raf = 0;
	const update = () => {
		raf = 0;
		const r = body.getBoundingClientRect();
		const span = Math.max(1, r.height - innerHeight * 0.5);
		const done = Math.min(1, Math.max(0, (innerHeight * 0.3 - r.top) / span));
		bar.style.transform = `scaleX(${done})`;
	};
	const queue = () => raf || (raf = requestAnimationFrame(update));
	addEventListener('scroll', queue, { passive: true, signal: progressAbort.signal });
	addEventListener('resize', queue, { passive: true, signal: progressAbort.signal });
	update();
}

/** Marks the table-of-contents entry for the section being read (the last heading above the top 15% line;
 *  low enough that a ToC click on a short section still marks that section). */
let tocObserver: IntersectionObserver | null = null;
function initTocSpy() {
	tocObserver?.disconnect();
	const links = new Map<Element, HTMLAnchorElement>();
	document.querySelectorAll<HTMLAnchorElement>('.toc a[href^="#"]').forEach((a) => {
		const heading = document.getElementById(decodeURIComponent(a.hash.slice(1)));
		if (heading) links.set(heading, a);
	});
	if (links.size < 2) return;
	const headings = [...links.keys()];
	let current: HTMLAnchorElement | undefined;
	const update = () => {
		const line = innerHeight * 0.15;
		const active = headings.findLast((h) => h.getBoundingClientRect().top < line);
		const link = active && links.get(active);
		if (link === current) return;
		current?.removeAttribute('aria-current');
		link?.setAttribute('aria-current', 'location');
		current = link;
	};
	// Only fires when a heading crosses the viewport top or the 15% line, so no per-scroll work.
	tocObserver = new IntersectionObserver(update, { rootMargin: '0px 0px -85% 0px' });
	headings.forEach((h) => tocObserver!.observe(h));
	update();
}

document.addEventListener('astro:page-load', () => {
	initProgress();
	initTocSpy();
	revealEmails();
	syncToc();
	initOliv();
	initShakeQr();
});
