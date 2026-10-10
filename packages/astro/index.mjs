/**
 * @lagomcms/astro: the Astro side of LagomCMS.
 *
 * Add it to a stock Astro project and the site is there: every page LagomCMS knows how to
 * fill (home, blog, CV, portfolio, about, contact, social), the feeds, the sitemap, and the
 * default look. Nothing is copied into the project. The pages live in this package and are
 * "injected" as routes, so an update to the package is an update to the site.
 *
 *     // astro.config.mjs
 *     import lagom from '@lagomcms/astro';
 *     export default defineConfig({
 *         integrations: [lagom({ url: 'http://127.0.0.1:4702' })],
 *     });
 *
 * To replace one of the pages with your own, create a file at the same address in your
 * project's src/pages/. Yours wins and ours is left out.
 */
import { cpSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PAGES = fileURLToPath(new URL('./src/pages/', import.meta.url));

/** The neutral logo, icons and share image a new site starts with. See scripts/make-defaults.mjs. */
const DEFAULTS = fileURLToPath(new URL('./public/', import.meta.url));
const TYPES = { '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json' };

/** Every file under a folder, as paths relative to it: ['index.astro', 'blog/[id].astro', ...]. */
function filesUnder(folder, prefix = '') {
    return readdirSync(folder).flatMap((name) => {
        const path = folder + name;
        return statSync(path).isDirectory() ? filesUnder(path + '/', prefix + name + '/') : [prefix + name];
    });
}

/**
 * The address a page file answers at, by Astro's own naming rules:
 *   index.astro -> /        blog/index.astro -> /blog        blog/[id].astro -> /blog/[id]
 *   rss.xml.ts  -> /rss.xml (only the last extension is the file type)
 */
function addressOf(file) {
    const withoutType = file.replace(/\.(astro|ts|js|mjs)$/, '');
    const address = '/' + withoutType.replace(/(^|\/)index$/, '');
    return address === '/' ? '/' : address.replace(/\/$/, '');
}

/**
 * @param {object} [options]
 * @param {string} [options.url] Where the CMS runs. Leave it out to read the LAGOM_URL
 *                               environment variable at build time instead.
 * @param {{endpoint: string, owner?: string}} [options.chat] Turns on the "ask" assistant in
 *                               the corner of every page, sending questions to `endpoint`. Off by
 *                               default: it needs a service of your own to answer them. `owner`
 *                               is who it speaks for ("Ask me about Ada's work").
 */
export default function lagom(options = {}) {
    return {
        name: '@lagomcms/astro',
        hooks: {
            'astro:config:setup': ({ config, injectRoute, addMiddleware, updateConfig, logger }) => {
                // Site name, navigation and the rest are read from the CMS before each page is made.
                addMiddleware({ entrypoint: fileURLToPath(new URL('./src/middleware.ts', import.meta.url)), order: 'pre' });

                const ownPages = fileURLToPath(new URL('./pages/', config.srcDir));

                for (const file of filesUnder(PAGES)) {
                    // A page of the same name in the project replaces ours.
                    if (existsSync(ownPages + file)) {
                        logger.info(`${addressOf(file)} comes from this project's own src/pages/${file}`);
                        continue;
                    }
                    injectRoute({ pattern: addressOf(file), entrypoint: PAGES + file });
                }

                const cms = options.url ?? process.env.LAGOM_URL;

                // Where this package is installed, for the one page that loads a dependency by hand
                // (see src/pages/favicon/[file].ts).
                const defines = { 'import.meta.env.LAGOM_PACKAGE_ROOT': JSON.stringify(fileURLToPath(new URL('./', import.meta.url))) };
                // And where the project is, for the share images, which read its illustrations from disk.
                defines['import.meta.env.LAGOM_PROJECT_ROOT'] = JSON.stringify(fileURLToPath(config.root));
                if (options.url) defines['import.meta.env.LAGOM_URL'] = JSON.stringify(options.url);
                if (options.chat?.endpoint) {
                    defines['import.meta.env.LAGOM_CHAT_ENDPOINT'] = JSON.stringify(options.chat.endpoint);
                    defines['import.meta.env.LAGOM_CHAT_OWNER'] = JSON.stringify(options.chat.owner ?? '');
                }

                updateConfig({
                    // The addresses LagomCMS sites use: /blog/my-post, never /blog/my-post/.
                    trailingSlash: 'never',
                    // The stylesheet is small; inlining it removes the one request that blocks first paint.
                    build: { format: 'file', inlineStylesheets: 'always' },
                    // Uploaded photos are resized by Astro like built-in ones. Astro only fetches
                    // remote images from hosts named here, so: the CMS, and nothing else.
                    image: { domains: cms ? [new URL(cms).hostname] : [] },
                    // The pages read the CMS address from import.meta.env.LAGOM_URL. When it was
                    // given as an option, that is where it is put.
                    // Options the pages need are handed to them as import.meta.env values.
                    //
                    // The proxy is for `astro dev` only. On a published site the pages, /api and
                    // /media all come from the same address, so the browser asks for
                    // "/api/v1/social/feed" and gets it. In development the pages come from
                    // Astro's own server on another port, which passes those two on to the CMS.
                    vite: { define: defines, server: cms ? { proxy: { '/api/v1': cms, '/media': cms } } : {} },
                });
            },

            // The default images, for a project that has none of its own. A file of the same
            // name in the project's public/ folder always wins: in development Astro serves
            // that first and only then falls through to here, and in a build the copy below
            // never overwrites anything that is already in the output.
            'astro:server:setup': ({ server }) => {
                server.middlewares.use((request, response, next) => {
                    const path = decodeURIComponent((request.url ?? '').split('?')[0]);
                    const file = DEFAULTS + path.slice(1);
                    // "..": nothing outside the defaults folder is ever served from here.
                    if (path.includes('..') || !TYPES[extname(file)] || !existsSync(file) || !statSync(file).isFile()) return next();
                    response.setHeader('Content-Type', TYPES[extname(file)]);
                    response.end(readFileSync(file));
                });
            },
            'astro:build:done': ({ dir }) => {
                cpSync(DEFAULTS, fileURLToPath(dir), { recursive: true, force: false });
            },
        },
    };
}
