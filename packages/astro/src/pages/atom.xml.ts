import type { APIRoute } from 'astro';
import { getPosts, postPath } from '../lib/posts';
import { escapeXml, xmlResponse } from '../lib/xml';
import { PERSON, SITE, absoluteUrl } from '../site';

export const GET: APIRoute = async () => {
	const posts = (await getPosts()).filter((p) => !p.data.draft);
	const author = `<author><name>${PERSON.name}</name><uri>${SITE.url}</uri><email>${SITE.feed.email}</email></author>`;
	const updated = (posts[0]?.data.pubDate ?? new Date()).toISOString();

	const entries = posts
		.map((post) => {
			const link = absoluteUrl(postPath(post.id));
			const date = post.data.pubDate.toISOString();
			return `
  <entry>
    <title>${escapeXml(post.data.title)}</title>
    <link href="${link}" rel="alternate" />
    <id>${link}</id>
    <published>${date}</published>
    <updated>${date}</updated>
    <summary>${escapeXml(post.data.description)}</summary>
    ${author}
    ${post.data.tags.map((t) => `<category term="${escapeXml(t)}" />`).join('')}
  </entry>`;
		})
		.join('');

	return xmlResponse(
		`<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(SITE.feed.title)}</title>
  <subtitle>${escapeXml(SITE.feed.description)}</subtitle>
  <link href="${SITE.url}/atom.xml" rel="self" type="application/atom+xml" />
  <link href="${SITE.url}" rel="alternate" type="text/html" />
  <id>${SITE.url}/</id>
  <updated>${updated}</updated>
  ${author}${entries}
</feed>
`,
		'application/atom+xml',
	);
};
