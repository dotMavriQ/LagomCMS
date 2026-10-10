/** /og/<post>.png: the picture shown when a link to a post is shared.
 *
 *  One per published post, drawn when the site is built: the title, the first tag, the author,
 *  the site's address, and the post's own illustration when it has one. Nobody has to make
 *  these by hand, and a post that changes its title gets a new card with the next publish.
 *
 *  A site that would rather use its own picture for a post puts a file at
 *  public/img/og/<post>.png, and that one is used instead (see ogImageFor in lib/posts.ts).
 *
 *  The drawing itself is in lib/share-image.mjs. */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import type { APIRoute } from 'astro';
import { getPost, getPosts } from '../../lib/posts';
import { shareImage } from '../../lib/share-image.mjs';
import { PERSON, SITE } from '../../site';
import { palette } from '../../themes/gruvbox-material';

// These three are this package's dependencies, not the project's, so they are loaded from where
// the package is installed (the same reason as in favicon/[file].ts).
const fromPackage = createRequire(import.meta.env.LAGOM_PACKAGE_ROOT);
const sharp: typeof import('sharp') = fromPackage('sharp');
const opentype = fromPackage('opentype.js');
const fontFile = (weight: number) => readFile(fromPackage.resolve(`@fontsource/jetbrains-mono/files/jetbrains-mono-latin-${weight}-normal.woff`));

export async function getStaticPaths() {
	return (await getPosts()).map((post) => ({ params: { slug: post.id } }));
}

export const GET: APIRoute = async ({ params }) => {
	const post = await getPost(params.slug ?? '');
	if (!post) return new Response('Not found', { status: 404 });

	// The illustration is a file in the project (src/assets/blog). No file, no picture: the
	// title simply gets the whole width.
	const art = post.data.heroFile ? await readFile(import.meta.env.LAGOM_PROJECT_ROOT + post.data.heroFile).catch(() => undefined) : undefined;

	const image = await shareImage(
		{ sharp, opentype, fonts: { regular: await fontFile(400), bold: await fontFile(700) } },
		{
			title: post.data.title,
			kicker: post.data.tags[0] ?? 'blog',
			author: PERSON.name || SITE.name,
			host: new URL(SITE.url).host,
			art,
			colours: palette.light,
		},
	);

	return new Response(new Uint8Array(image), { headers: { 'content-type': 'image/png' } });
};
