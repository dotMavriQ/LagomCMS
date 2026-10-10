/** The Person entity behind every page's structured data, read from the LagomCMS `cv`
 *  singleton so the job title, employer and profile links are edited in one place.
 *
 *  Every page references the same `@id`, which is how search and answer engines tie the CV,
 *  the about page and each post's author together as one person. Falls back to the static
 *  PERSON in site.ts if the CMS is unreachable, so a CMS hiccup degrades the markup instead
 *  of 500ing the page. */
import { getSingleton, cached } from './lagom';
import { PERSON, SITE } from '../site';

interface CvFields {
	title: string;
	role_title?: string;
	location?: string;
	knows_about?: string[];
	languages?: string[];
	employer?: string;
	same_as?: string[];
}

export interface PersonInfo {
	name: string;
	jobTitle: string;
	employer: string;
	location: string;
	updated?: Date;
	/** Absolute address of a portrait (the About page's), when there is one. */
	image?: string;
	/** schema.org Person, ready to drop into JSON-LD. */
	ld: Record<string, unknown>;
}

export const PERSON_ID = `${SITE.url}/#person`;

export async function getPerson(): Promise<PersonInfo> {
	// The fallback is returned outside cached(), so a CMS blip (e.g. while the container is
	// starting) is not remembered for the whole TTL.
	try {
		return await cached('person', 60_000, async () => {
			const doc = await getSingleton<CvFields>('cv');
			const f = doc.fields;
			// The portrait is the About page's. No About page, or no upload there, means no image.
			const portrait = await getSingleton<Record<string, unknown>>('about').then((about) => about.assets?.portrait?.src).catch(() => undefined);
			const image = portrait ? new URL(portrait, SITE.url).toString() : undefined;
			return {
				name: f.title,
				jobTitle: f.role_title ?? '',
				employer: f.employer ?? '',
				location: f.location ?? '',
				updated: new Date(doc.updated_at * 1000),
				image,
				ld: {
					'@type': 'Person',
					'@id': PERSON_ID,
					name: f.title,
					...(PERSON.alternateName ? { alternateName: PERSON.alternateName } : {}),
					url: SITE.url,
					...(image ? { image } : {}),
					...(f.role_title ? { jobTitle: f.role_title } : {}),
					...(f.employer ? { worksFor: { '@type': 'Organization', name: f.employer } } : {}),
					...(SITE.geo.placename || SITE.geo.region
						? { homeLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: SITE.geo.placename, addressCountry: SITE.geo.region } } }
						: {}),
					...(f.knows_about?.length ? { knowsAbout: f.knows_about } : {}),
					...(f.languages?.length ? { knowsLanguage: f.languages } : {}),
					...(f.same_as?.length ? { sameAs: f.same_as } : {}),
				},
			};
		});
	} catch (err) {
		console.error('[lagom] cv fetch failed, falling back to the author named in Settings:', err);
		return { name: PERSON.name, jobTitle: '', employer: '', location: '', ld: { '@type': 'Person', '@id': PERSON_ID, name: PERSON.name, url: SITE.url } };
	}
}
