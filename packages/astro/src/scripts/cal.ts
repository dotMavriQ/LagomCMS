/** Cal.com booking in a popup, skinned in the site's Gruvbox palette.
 *
 *  Any link with data-booking="<cal.com link>" opens Cal.com's modal instead of leaving the site. (Not
 *  data-cal-link: embed.js binds its own click handler to that, and the two together open two modals.) The embed script
 *  (app.cal.com/embed/embed.js) is only fetched on the first click, and without JavaScript the link
 *  still goes to cal.com. Colours follow the site's current theme, including a manual override from
 *  the theme toggle, using the same Gruvbox Material values as global.css. */

type CalFn = ((...args: unknown[]) => void) & { loaded?: boolean; ns?: Record<string, unknown>; q?: unknown[] };
declare global {
	interface Window {
		Cal?: CalFn;
	}
}

/* Gruvbox Material (medium), the AA-adjusted text values from global.css. Brand = the red accent of /contact. */
const LIGHT = {
	'cal-brand': '#bb4545',
	'cal-brand-emphasis': '#9e3838',
	'cal-brand-text': '#fbf1c7',
	'cal-brand-subtle': '#ebc8b5',
	'cal-brand-accent': '#fbf1c7',
	'cal-text': '#654735',
	'cal-text-emphasis': '#4f3829',
	'cal-text-subtle': '#796b57',
	'cal-text-muted': '#a89984',
	'cal-text-inverted': '#fbf1c7',
	'cal-text-semantic-info': '#45707a',
	'cal-text-semantic-attention': '#9f5d00',
	'cal-text-semantic-error': '#bb4545',
	'cal-text-info': '#45707a',
	'cal-text-success': '#677329',
	'cal-text-attention': '#9f5d00',
	'cal-text-error': '#bb4545',
	'cal-bg': '#fbf1c7',
	'cal-bg-emphasis': '#eadcb2',
	'cal-bg-subtle': '#f2e5bc',
	'cal-bg-muted': '#f6ebc3',
	'cal-bg-inverted': '#654735',
	'cal-bg-attention': '#f3dcae',
	'cal-bg-error': '#f2d3c4',
	'cal-bg-semantic-info-subtle': '#e3e6cf',
	'cal-bg-semantic-attention-subtle': '#f3dcae',
	'cal-bg-semantic-error-subtle': '#f2d3c4',
	'cal-border': '#d9c8a0',
	'cal-border-emphasis': '#a89984',
	'cal-border-subtle': '#e5d6ae',
	'cal-border-muted': '#ede0b8',
	'cal-border-error': '#bb4545',
	'cal-border-semantic-error': '#bb4545',
	'cal-border-semantic-attention-subtle': '#e3c48a',
	'cal-border-semantic-error-subtle': '#e2afa3',
	'cal-border-booker': '#d9c8a0',
	'cal-border-booker-width': '1px',
	radius: '8px',
};
const DARK = {
	'cal-brand': '#ea6962',
	'cal-brand-emphasis': '#f08a84',
	'cal-brand-text': '#282828',
	'cal-brand-subtle': '#5b3533',
	'cal-brand-accent': '#282828',
	'cal-text': '#d4be98',
	'cal-text-emphasis': '#ddc7a1',
	'cal-text-subtle': '#a89984',
	'cal-text-muted': '#7c6f64',
	'cal-text-inverted': '#282828',
	'cal-text-semantic-info': '#7daea3',
	'cal-text-semantic-attention': '#d8a657',
	'cal-text-semantic-error': '#ea6962',
	'cal-text-info': '#7daea3',
	'cal-text-success': '#a9b665',
	'cal-text-attention': '#d8a657',
	'cal-text-error': '#ea6962',
	'cal-bg': '#282828',
	'cal-bg-emphasis': '#3c3836',
	'cal-bg-subtle': '#32302f',
	'cal-bg-muted': '#2c2a29',
	'cal-bg-inverted': '#d4be98',
	'cal-bg-attention': '#3f3424',
	'cal-bg-error': '#402424',
	'cal-bg-semantic-info-subtle': '#2c3533',
	'cal-bg-semantic-attention-subtle': '#3f3424',
	'cal-bg-semantic-error-subtle': '#402424',
	'cal-border': '#45403d',
	'cal-border-emphasis': '#7c6f64',
	'cal-border-subtle': '#3c3836',
	'cal-border-muted': '#32302f',
	'cal-border-error': '#ea6962',
	'cal-border-semantic-error': '#ea6962',
	'cal-border-semantic-attention-subtle': '#6b5530',
	'cal-border-semantic-error-subtle': '#6b3432',
	'cal-border-booker': '#45403d',
	'cal-border-booker-width': '1px',
	radius: '8px',
};

const theme = (): 'light' | 'dark' => {
	const set = document.documentElement.dataset.theme;
	if (set === 'light' || set === 'dark') return set;
	return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

/** Cal.com's own loader snippet, typed: queues calls until embed.js arrives. */
function boot(): CalFn {
	if (window.Cal) return window.Cal;
	const queue = (api: { q: unknown[] }, args: unknown) => api.q.push(args);
	const cal: CalFn = function (...args: unknown[]) {
		if (!cal.loaded) {
			cal.ns = {};
			cal.q = cal.q || [];
			const s = document.createElement('script');
			s.src = 'https://app.cal.com/embed/embed.js';
			s.async = true;
			document.head.appendChild(s);
			cal.loaded = true;
		}
		if (args[0] === 'init') {
			const api = Object.assign((...a: unknown[]) => queue(api, a), { q: [] as unknown[] });
			const ns = args[1];
			if (typeof ns === 'string') {
				cal.ns![ns] = cal.ns![ns] || api;
				queue(cal.ns![ns] as { q: unknown[] }, args);
				return;
			}
		}
		queue(cal as { q: unknown[] }, args);
	} as CalFn;
	cal.q = [];
	window.Cal = cal;
	cal('init', { origin: 'https://cal.com' });
	// Once: both palettes go in together and each modal picks its theme. Re-sending this on every open made
	// Cal stack a second, stuck modal on reopen.
	cal('ui', { cssVarsPerTheme: { light: LIGHT, dark: DARK }, hideEventTypeDetails: false, layout: 'month_view' });
	return cal;
}

/** A click on the dimmed backdrop (inside the modal's shadow DOM) closes it the same way Cal's own × does. */
function isBackdropClick(e: Event): boolean {
	const path = e.composedPath();
	const has = (cls: string) => path.some((t) => t instanceof HTMLElement && t.classList.contains(cls));
	return has('my-backdrop') && !has('modal-box');
}

/** Cal only hides a closed modal, and every reopen adds another <cal-modal-box> with its own iframe.
 *  Removing each one once it has closed keeps exactly one around (removing it before reopening instead
 *  confuses Cal's reuse and stacks a second, stuck modal). */
function watchModals() {
	new MutationObserver((records) => {
		for (const r of records)
			for (const node of r.addedNodes) {
				if (!(node instanceof HTMLElement) || node.localName !== 'cal-modal-box') continue;
				const box = node;
				new MutationObserver((_, obs) => {
					if (box.style.visibility !== 'hidden') return;
					obs.disconnect();
					setTimeout(() => box.remove(), 400); // let the close transition finish
				}).observe(box, { attributes: true, attributeFilter: ['style'] });
			}
	}).observe(document.body, { childList: true });
}

let bound = false;
function init() {
	if (bound) return;
	bound = true;
	watchModals();
	// One delegated listener survives client-side navigation, so links on any page just work.
	document.addEventListener('click', (e) => {
		if (window.Cal && document.querySelector('cal-modal-box') && isBackdropClick(e)) {
			window.Cal('closeModal');
			return;
		}
		const m = e as MouseEvent;
		if (m.defaultPrevented || m.button !== 0 || m.metaKey || m.ctrlKey || m.shiftKey || m.altKey) return;
		const link = (e.target as HTMLElement).closest<HTMLElement>('[data-booking]');
		if (!link) return;
		e.preventDefault();
		const cal = boot();
		const t = theme();
		cal('modal', { calLink: link.dataset.booking, config: { theme: t, layout: 'month_view' } });
	});
}

init();

export {};
