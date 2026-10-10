/** Decorative hue per tag (dots and card edges). Text never uses these colours, so contrast is unaffected. */
import { SITE } from '../site';

export type Hue = 'red' | 'green' | 'yellow' | 'blue' | 'purple' | 'aqua';

const FALLBACK: Hue[] = ['aqua', 'blue', 'green', 'yellow', 'purple', 'red'];

/** The colour the owner chose for a tag (Settings > Tag colours), or failing that one worked
 *  out from the tag's letters, so the same tag always gets the same colour. */
export function tagHue(tag: string): Hue {
	const chosen = SITE.tagColours[tag] as Hue | undefined;
	if (chosen && FALLBACK.includes(chosen)) return chosen;
	let h = 0;
	for (const ch of tag) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
	return FALLBACK[h % FALLBACK.length];
}
