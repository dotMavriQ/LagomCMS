import type { APIRoute } from 'astro';
import { excerptOf, getPosts, plainTextOf } from '../lib/posts';

/** Fetched lazily by the blog list on the first search query. */
export const GET: APIRoute = async () => {
	const posts = await getPosts();
	const index = posts.map((post) => ({
		slug: post.id,
		title: post.data.title,
		excerpt: excerptOf(post),
		date: post.data.pubDate.toISOString(),
		tags: post.data.tags.join(','),
		body: plainTextOf(post.blocks),
	}));
	return new Response(JSON.stringify(index), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
