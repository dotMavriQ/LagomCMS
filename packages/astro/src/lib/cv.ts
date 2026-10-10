/** CV data from LagomCMS: the `cv` singleton (header + intro), `cv_roles`, `cv_skills` and
 *  `cv_references`. All under 20 items each (checked live: 9/6/0), so unlike posts these don't
 *  need the getList() pagination workaround — see the bug noted in lagom.ts. */
import { getSingleton, getList } from './lagom';
import { renderBlocks } from './blocks';

interface CvFields {
	title: string;
	role_title?: string;
	location?: string;
	email?: string;
	linkedin?: string;
	github?: string;
	languages?: string[];
	knows_about?: string[];
	employer?: string;
}

interface CvRoleFields {
	title: string;
	org: string;
	kind: 'job' | 'additional' | 'education' | 'certificate';
	dates?: string;
	sort_key: number;
	location?: string;
	bullets?: string[];
	tags?: string[];
	current?: boolean;
}

interface CvSkillFields {
	title: string;
	skills: string[];
	sort_key: number;
}

interface CvReferenceFields {
	title: string;
	org: string;
	role?: string;
	url?: string;
	sort_key: number;
}

export interface CvRole {
	id: string;
	title: string;
	org: string;
	kind: CvRoleFields['kind'];
	dates: string;
	location?: string;
	bullets: string[];
	tags: string[];
	/** Higher sorts first. Not rendered — only used to order jobs/additional/education below. */
	sortKey: number;
}

export interface Cv {
	title: string;
	roleTitle: string;
	location: string;
	email: string;
	linkedin: string;
	github: string;
	languages: string[];
	knowsAbout: string[];
	employer: string;
	summaryHtml: string;
	updated: Date;
	jobs: CvRole[];
	additional: CvRole[];
	education: CvRole[];
	skills: { title: string; items: string[] }[];
	references: { name: string; org: string; role?: string; url?: string }[];
}

function toRole(doc: { slug: string; fields: CvRoleFields }): CvRole {
	const f = doc.fields;
	return { id: doc.slug, title: f.title, org: f.org, kind: f.kind, dates: f.dates ?? '', location: f.location, bullets: f.bullets ?? [], tags: f.tags ?? [], sortKey: f.sort_key };
}

export async function getCv(): Promise<Cv> {
	const [cvDoc, roleDocs, skillDocs, refDocs] = await Promise.all([
		getSingleton<CvFields>('cv'),
		getList<CvRoleFields>('cv_roles'),
		getList<CvSkillFields>('cv_skills'),
		getList<CvReferenceFields>('cv_references'),
	]);

	const roles = roleDocs.map(toRole).sort((a, b) => b.sortKey - a.sortKey);

	const f = cvDoc.fields;
	return {
		title: f.title,
		roleTitle: f.role_title ?? '',
		location: f.location ?? '',
		email: f.email ?? '',
		linkedin: f.linkedin ?? '',
		github: f.github ?? '',
		languages: f.languages ?? [],
		knowsAbout: f.knows_about ?? [],
		employer: f.employer ?? '',
		// Array.isArray, not a direct cast: an empty/disabled body comes back as `{}`, not `[]` — see
		// the Doc<F> type in lagom.ts. This collection's schema only allows paragraph/list blocks
		// (no headings), so passing an empty heading list to renderBlocks is always correct here.
		summaryHtml: await renderBlocks(Array.isArray(cvDoc.blocks) ? cvDoc.blocks : [], []),
		updated: new Date(cvDoc.updated_at * 1000),
		jobs: roles.filter((r) => r.kind === 'job'),
		additional: roles.filter((r) => r.kind === 'additional'),
		education: roles.filter((r) => r.kind === 'education' || r.kind === 'certificate'),
		skills: skillDocs
			.slice()
			.sort((a, b) => a.fields.sort_key - b.fields.sort_key)
			.map((d) => ({ title: d.fields.title, items: d.fields.skills })),
		references: refDocs
			.slice()
			.sort((a, b) => a.fields.sort_key - b.fields.sort_key)
			.map((d) => ({ name: d.fields.title, org: d.fields.org, role: d.fields.role, url: d.fields.url })),
	};
}
