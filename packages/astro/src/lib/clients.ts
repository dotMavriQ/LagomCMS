/** Client work: an optional list of client websites, shown at /portfolio/clients.
 *
 *  This is the one piece of site content that does not come from the CMS yet. A project that
 *  wants the page provides two files of its own:
 *
 *      src/data/clients.ts                 the list (CLIENT_SECTORS, CLIENT_SITE_COUNT, ...)
 *      src/pages/portfolio/clients.astro   the page
 *
 *  and the package then links to it from the portfolio, lists it in the sitemap and mentions
 *  it in llms.txt. A project without them simply has no client page.
 *
 *  The path starts with "/", which Vite reads as "from the root of the project using this
 *  package".
 */
interface ClientWork {
	CLIENT_SECTORS: { name: string; sites: { name: string; domain: string; path?: string }[] }[];
	CLIENT_SITE_COUNT: number;
}

const found = Object.values(import.meta.glob<ClientWork>('/src/data/clients.ts', { eager: true }));

/** The project's client list, or undefined when it has none. */
export const clientWork: ClientWork | undefined = found[0];
