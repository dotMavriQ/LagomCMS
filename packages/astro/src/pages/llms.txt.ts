import type { APIRoute } from 'astro';
import { getCv } from '../lib/cv';
import { getPerson } from '../lib/person';
import { getPosts, postPath } from '../lib/posts';
import { getProjects } from '../lib/portfolio';
import { clientWork } from '../lib/clients';
import { SOCIAL } from '../lib/fediverse';
import { getSingleton } from '../lib/lagom';
import { PERSON, absoluteUrl } from '../site';

/** /llms.txt (https://llmstxt.org): a plain Markdown brief for answer engines, built from the
 *  same CMS documents as the pages so it never drifts from them. */
const plain = (html: string) =>
	html
		.replace(/<\/(p|li)>/g, '\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/\n{2,}/g, '\n')
		.trim();

export const GET: APIRoute = async () => {
	const [person, cv, posts, projects, home] = await Promise.all([
		getPerson(),
		getCv(),
		getPosts(),
		getProjects(),
		getSingleton<{ description?: string; links?: { label: string; url: string; icon?: string }[] }>('home').then((doc) => doc.fields).catch(() => ({})),
	]);

	// "Elsewhere": the home page's link buttons that lead off the site. The fediverse button
	// points at this site's own /social page, so the profile's real address stands in for it.
	const elsewhere = (home.links ?? [])
		.map((link) => ({ label: link.label, url: link.icon === 'fediverse' && SOCIAL.profileUrl ? SOCIAL.profileUrl : link.url }))
		.filter((link) => /^https?:\/\//.test(link.url));

	const role = [person.jobTitle, person.employer && `at ${person.employer}`].filter(Boolean).join(' ');

	const lines = [
		`# ${person.name}${PERSON.alternateName ? ` (${PERSON.alternateName})` : ''}`,
		'',
		`> ${[[role, cv.location].filter(Boolean).join(', '), home.description].filter(Boolean).join('. ')}`,
		'',
		plain(cv.summaryHtml),
		'',
		'## Pages',
		'',
		`- [About](${absoluteUrl('/about')}): background, career story, stack, life outside work`,
		`- [CV](${absoluteUrl('/cv')}): roles, dates, skills, languages`,
		`- [Portfolio](${absoluteUrl('/portfolio')}): production work and open-source tools`,
		...(clientWork ? [`- [Client work](${absoluteUrl('/portfolio/clients')}): client websites, grouped by sector`] : []),
		`- [Blog](${absoluteUrl('/blog')}): long-form writing ([RSS](${absoluteUrl('/rss.xml')}))`,
		`- [Contact](${absoluteUrl('/contact')}): ways to get in touch`,
		'',
		'## Experience',
		'',
		...cv.jobs.map((r) => `- ${r.dates}: ${r.title}, ${r.org}${r.location && !r.org.includes(r.location) ? ` (${r.location})` : ''}`),
		'',
		'## Projects',
		'',
		...projects.map((p) => {
			const links = p.links.filter((l) => /^https?:/.test(l.url));
			const url = links.find((l) => l.kind === 'live')?.url ?? links[0]?.url;
			return `- ${url ? `[${p.title}](${url})` : p.title}: ${p.summary.replace(/\s+/g, ' ').trim()}`;
		}),
		'',
		...(clientWork
			? [
					'## Client websites',
					'',
					`${clientWork.CLIENT_SITE_COUNT} websites ${person.name} has built, rebuilt or maintained for clients and employers (${absoluteUrl('/portfolio/clients')}):`,
					'',
					...clientWork.CLIENT_SECTORS.map((s) => `- ${s.name}: ${s.sites.map((c) => `${c.name} (${c.domain})`).join(', ')}`),
					'',
				]
			: []),
		'## Posts',
		'',
		...posts.map((p) => `- [${p.data.title}](${absoluteUrl(postPath(p.id))}) (${p.data.pubDate.toISOString().slice(0, 10)}): ${p.data.description.replace(/\s+/g, ' ').trim()}`),
		'',
		...(elsewhere.length ? ['## Elsewhere', '', ...elsewhere.map((link) => `- ${link.label}: ${link.url}`), ''] : []),
	];

	return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
