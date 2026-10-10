/** Portfolio data from the CMS's `projects` collection.
 *
 * Everything on a card comes from the project's document: order, tags, description, the kind
 * of card (featured/primary/compact/meta), its colour, its category line and its image.
 */
import { getList, type Doc } from './lagom';

interface ProjectFields {
	title: string;
	status: 'draft' | 'published' | 'archived';
	summary?: string;
	featured?: boolean;
	sort_key: number;
	tags?: string[];
	link_labels?: string[];
	link_urls?: string[];
	image_path?: string;
	hue?: 'red' | 'green' | 'yellow' | 'blue' | 'purple' | 'aqua';
	category?: string;
	image_alt?: string;
	image_w?: number;
	image_h?: number;
	kind: 'featured-card' | 'primary-card' | 'compact-card' | 'meta-card';
}

export type LinkKind = 'github' | 'live' | 'chrome' | 'firefox' | 'packagist' | 'tui';

export interface Project {
	id: string;
	title: string;
	summary: string;
	tags: string[];
	links: { kind: LinkKind; label: string; url: string }[];
	kind: ProjectFields['kind'];
	hue: 'red' | 'green' | 'yellow' | 'blue' | 'purple' | 'aqua';
	imageAlt: string;
	/** The card's image: the project's "Card image path" in the CMS. */
	plate: string;
	category: string;
	sortKey: number;
}

/** The small line above a card's title: its category ("browser extension"), with "featured ·"
 *  or "meta ·" in front for those two kinds of card. */
export function cardKindLabel(project: Pick<Project, 'category' | 'kind'>): string {
	const category = project.category;
	if (project.kind === 'featured-card') return category ? `featured · ${category}` : 'featured';
	if (project.kind === 'meta-card') return category ? `meta · ${category}` : 'meta';
	return category ?? '';
}

/** github.com (not github.io) -> github; the Chrome/Firefox/Packagist stores -> themselves; a
 *  link labelled "TUI" -> tui; everything else -> live. Same heuristic used to build these cards
 *  originally, now applied to whatever the CMS returns instead of being baked into stored HTML. */
function linkKind(url: string, label: string): LinkKind {
	if (url.includes('chromewebstore.google.com')) return 'chrome';
	if (url.includes('addons.mozilla.org')) return 'firefox';
	if (url.includes('packagist.org')) return 'packagist';
	if (label.trim() === 'TUI') return 'tui';
	if (url.includes('github.com') && !url.includes('github.io')) return 'github';
	return 'live';
}

/** link_labels/link_urls are parallel arrays (see the collection schema's own reasoning) — zip
 *  them and drop anything without a matching pair, rather than let a mismatch throw or render a
 *  broken link. A label of "Live →"/"GitHub →" etc. loses its arrow; the card template supplies
 *  the arrow itself via the icon, not text. */
function zipLinks(labels: string[] = [], urls: string[] = []): Project['links'] {
	const out: Project['links'] = [];
	for (let i = 0; i < Math.min(labels.length, urls.length); i++) {
		const url = urls[i];
		const label = labels[i].replace(/\s*→\s*$/, '').trim();
		if (!url || !label) continue;
		out.push({ kind: linkKind(url, label), label, url });
	}
	return out;
}

// A project's longer write-up (`body`, enabled in the schema) is fetched but not rendered — no
// card here shows more than `summary`, and there's no per-project detail page to put it on. If
// one gets added later, render it the same way posts.ts and cv.ts do: renderBlocks(doc.blocks).
function toProject(doc: Doc<ProjectFields>): Project {
	const f = doc.fields;
	return {
		id: doc.slug,
		title: f.title,
		summary: f.summary ?? doc.excerpt,
		tags: f.tags ?? [],
		links: zipLinks(f.link_labels, f.link_urls),
		kind: f.kind,
		hue: f.hue ?? 'blue',
		category: f.category ?? '',
		imageAlt: f.image_alt ?? f.title,
		plate: f.image_path ?? '',
		sortKey: f.sort_key,
	};
}

export async function getProjects(): Promise<Project[]> {
	const docs = await getList<ProjectFields>('projects'); // under 20 (13 live) — no pagination workaround needed, see lagom.ts
	const fromCms = docs.filter((d) => d.fields.status === 'published').map(toProject);
	return fromCms.sort((a, b) => a.sortKey - b.sortKey);
}
