/** The facts about the site as a whole: its name, its navigation, who writes it.
 *
 *  None of them is written here. They are edited in the CMS, under Settings, and
 *  lib/settings.ts copies the current values into these objects before every request
 *  (see middleware.ts). So the rest of the code can simply read `SITE.name` wherever it
 *  needs it, without asking the CMS itself or waiting for anything.
 *
 *  What you see below are the values a site has before its owner has filled anything in,
 *  and the ones used if the CMS cannot be reached. */

export const SITE = {
	/** The site's public address, from `site` in astro.config. The one thing that is not a
	 *  CMS setting: Astro needs it at build time, long before there is a CMS to ask. */
	url: (import.meta.env.SITE ?? 'http://localhost:4321').replace(/\/$/, ''),
	name: 'My site',
	/** The ending of browser tab titles ("blog // short name") and the name in the footer. */
	shortName: 'my site',
	description: '',
	locale: 'en',
	/** Where the author is based, for search engines. Both empty means "say nothing". */
	geo: { region: '', placename: '' },
	ogDefault: '/img/og/index.png',
	/** The localStorage key the light/dark choice is remembered under. */
	themeKey: 'blog-theme',
	feed: { title: 'My site', description: '', email: '' },
	blogDescription: '',
	portfolioDescription: '',
	portfolioTagline: '',
	portfolioIntro: [] as string[],
	/** Tag name -> colour, for the tags the owner picked a colour for. See data/tags.ts. */
	tagColours: {} as Record<string, string>,
};

/** The links in the header. */
export const NAV: { href: string; label: string }[] = [
	{ href: '/cv', label: 'cv' },
	{ href: '/portfolio', label: 'portfolio' },
	{ href: '/about', label: 'about' },
	{ href: '/blog', label: 'blog' },
	{ href: '/contact', label: 'contact' },
];

/** The author, in the shape schema.org wants. Posts name this as their author by `@id`, so
 *  it resolves to the same entity the CV and About pages describe (see lib/person.ts). */
export const PERSON: { '@type': 'Person'; '@id': string; name: string; alternateName?: string; url?: string; sameAs?: string[] } = {
	'@type': 'Person',
	'@id': `${SITE.url}/#person`,
	name: '',
	url: SITE.url,
};

export const LINKS = {
	/** The project this site is built with. Credited in the footer. */
	lagomcms: 'https://github.com/dotMavriQ/LagomCMS',
};

export const absoluteUrl = (path: string) => new URL(path, SITE.url).toString();

/** The address of the page being made, the way visitors write it: "/about", never "/about.html".
 *
 *  Pages are built as files (about.html, blog/hello.html, index.html) and during a build Astro
 *  reports the file's name as the page's address. Links, the canonical URL and the "you are
 *  here" mark in the menu all want the address without it. */
export function pagePath(url: URL): string {
	return url.pathname.replace(/\.html$/, '').replace(/\/index$/, '').replace(/\/+$/, '') || '/';
}
