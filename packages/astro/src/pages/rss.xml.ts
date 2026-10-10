import type { APIRoute } from 'astro';
import { getPosts, postPath } from '../lib/posts';
import { escapeXml, xmlResponse } from '../lib/xml';
import { PERSON, SITE, absoluteUrl } from '../site';

export const GET: APIRoute = async () => {
	const posts = (await getPosts()).filter((p) => !p.data.draft);

	const items = posts
		.map((post) => {
			const link = absoluteUrl(postPath(post.id));
			return [
				'<item>',
				`<title>${escapeXml(post.data.title)}</title>`,
				`<link>${link}</link>`,
				`<guid isPermaLink="true">${link}</guid>`,
				`<description>${escapeXml(post.data.description)}</description>`,
				`<pubDate>${post.data.pubDate.toUTCString()}</pubDate>`,
				...post.data.tags.map((t) => `<category>${escapeXml(t)}</category>`),
				`<author>${SITE.feed.email} (${PERSON.name})</author>`,
				'</item>',
			].join('');
		})
		.join('');

	return xmlResponse(
		`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escapeXml(SITE.feed.title)}</title><description>${escapeXml(SITE.feed.description)}</description><link>${SITE.url}/</link>${items}</channel></rss>`,
		'application/xml',
	);
};
