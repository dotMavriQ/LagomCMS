import type { APIRoute } from 'astro';
import { getPosts, lastModified, postPath } from '../lib/posts';
import { xmlResponse } from '../lib/xml';
import { clientWork } from '../lib/clients';
import { absoluteUrl } from '../site';

const PAGES = ['/', '/about', '/cv', '/portfolio', ...(clientWork ? ['/portfolio/clients'] : []), '/contact', '/blog', '/social'];

export const GET: APIRoute = async () => {
	const posts = await getPosts();
	const urls = [
		...PAGES.map((p) => `<url><loc>${absoluteUrl(p)}</loc></url>`),
		...posts.map(
			(post) =>
				`<url><loc>${absoluteUrl(postPath(post.id))}</loc><lastmod>${lastModified(post).toISOString().slice(0, 10)}</lastmod></url>`,
		),
	];
	return xmlResponse(
		`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  ${urls.join('\n  ')}\n</urlset>\n`,
		'application/xml',
	);
};
