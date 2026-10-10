import { defineConfig } from 'astro/config';
import lagom from '@lagomcms/astro';

// Everything a LagomCMS site needs on the Astro side. There is no src/ folder in this project:
// the pages come from the integration, the words come from the CMS, and the CMS runs the build.
export default defineConfig({
	// Your site's public address. It ends up in the sitemap, the feeds and the share previews.
	site: 'http://localhost:4712',
	integrations: [lagom({ url: process.env.LAGOM_URL ?? 'http://127.0.0.1:4702' })],
});
