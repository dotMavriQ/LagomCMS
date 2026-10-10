/** Runs before every page: makes sure the site-wide settings are the CMS's current ones.
 *  Added to the project by the integration (index.mjs), so nobody has to wire it up. */
import type { MiddlewareHandler } from 'astro';
import { loadSettings } from './lib/settings';

export const onRequest: MiddlewareHandler = async (_context, next) => {
	await loadSettings();
	return next();
};
