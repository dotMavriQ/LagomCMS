/** Brings the site-wide settings in from the CMS.
 *
 *  Two documents hold them: `site` (Settings in the admin) and `social` (Social). They are
 *  fetched at most once a minute and copied into the plain objects the rest of the code reads:
 *  SITE, NAV and PERSON in site.ts, SOCIAL in lib/fediverse.ts.
 *
 *  If the CMS cannot be reached, whatever those objects held before is left alone. A page that
 *  needs the CMS for its content will say so itself; a setting must never be what breaks it. */
import { NAV, PERSON, SITE } from '../site';
import { SOCIAL } from './fediverse';
import { cached, getSingleton } from './lagom';

interface SiteFields {
	title?: string;
	short_name?: string;
	author?: string;
	alternate_name?: string;
	locale?: string;
	nav?: { label: string; url: string }[];
	blog_description?: string;
	portfolio_description?: string;
	portfolio_tagline?: string;
	portfolio_intro?: string[];
	feed_title?: string;
	feed_description?: string;
	feed_email?: string;
	tag_colours?: { tag: string; hue?: string }[];
	geo_region?: string;
	geo_placename?: string;
}

interface SocialFields {
	instance?: string;
	profile_url?: string;
	media_host?: string;
	accounts?: { acct: string }[];
}

export async function loadSettings(): Promise<void> {
	const loaded = await cached('settings', 60_000, async () => {
		// Fetched side by side; either one failing leaves that half as it was.
		const [site, social, cv] = await Promise.all([
			getSingleton<SiteFields>('site').then((doc) => doc.fields).catch(() => null),
			getSingleton<SocialFields>('social').then((doc) => doc.fields).catch(() => null),
			// The author's profiles elsewhere are listed on the CV (its "Profile URLs").
			getSingleton<{ same_as?: string[] }>('cv').then((doc) => doc.fields).catch(() => null),
		]);
		return { site, social, cv };
	});

	const site = loaded.site;
	if (site) {
		SITE.name = site.title || 'My site';
		SITE.shortName = site.short_name || SITE.name;
		SITE.locale = site.locale || 'en';
		SITE.geo = { region: site.geo_region ?? '', placename: site.geo_placename ?? '' };
		SITE.feed = { title: site.feed_title || SITE.name, description: site.feed_description ?? '', email: site.feed_email ?? '' };
		SITE.blogDescription = site.blog_description ?? '';
		SITE.portfolioDescription = site.portfolio_description ?? '';
		SITE.portfolioTagline = site.portfolio_tagline ?? '';
		SITE.portfolioIntro = site.portfolio_intro ?? [];
		SITE.tagColours = Object.fromEntries((site.tag_colours ?? []).filter((row) => row.tag && row.hue).map((row) => [row.tag, row.hue as string]));

		// The header keeps its built-in links until the owner lists their own.
		if (site.nav?.length) NAV.splice(0, NAV.length, ...site.nav.filter((link) => link.label && link.url).map((link) => ({ href: link.url, label: link.label })));

		// Rebuilt key by key so the structured data never carries an empty "alternateName": ""
		// or an empty list, and always lists its properties in the same order.
		delete PERSON.alternateName;
		delete PERSON.url;
		delete PERSON.sameAs;
		PERSON.name = site.author ?? '';
		if (site.alternate_name) PERSON.alternateName = site.alternate_name;
		PERSON.url = SITE.url;
		if (loaded.cv?.same_as?.length) PERSON.sameAs = loaded.cv.same_as;
	}

	const social = loaded.social;
	if (social) {
		SOCIAL.host = (social.instance ?? '').replace(/\/+$/, '');
		SOCIAL.acct = (social.accounts?.[0]?.acct ?? '').replace(/^@/, '');
		SOCIAL.profileUrl = social.profile_url ?? '';
		SOCIAL.mediaHost = social.media_host ?? '';
	}
}
