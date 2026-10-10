/** The picture shown when a link to the site is shared: a card with the page's title on it.
 *
 *      ┌────────────────────────────────────────────┐
 *      │ // productivity                            │
 *      │                                  ┌───────┐ │
 *      │ Cognitive Load                   │ hero  │ │
 *      │ Theory                           │  art  │ │
 *      │                                  └───────┘ │
 *      │ ────────────────────────────────────────── │
 *      │ ADA LOVELACE                  example.com  │
 *      └────────────────────────────────────────────┘
 *
 *  1200 by 630, the size every network asks for. A post's own illustration sits to the right
 *  of its title, in the same ink as the text; a page without one gets the full width.
 *
 *  The text is not "typed" with a font the server happens to have. Each letter's outline is
 *  read from the font file that ships with this package and drawn as a shape, so the card
 *  looks the same on a laptop and on a server with no fonts installed at all.
 *
 *  Plain JavaScript with everything it needs handed in (the image library, the font reader,
 *  the font files), so it can be run and looked at from a script, without Astro. */

const WIDTH = 1200;
const HEIGHT = 630;

/** The card's own box, and the margin inside it. */
const CARD = { x: 48, y: 48, width: 1104, height: 534, shadow: 12 };
const LEFT = 112;
const RIGHT = 1088;

/** Where the title may go: from under the kicker down to just above the rule. */
const TITLE = { top: 176, bottom: 440 };
const ART = { size: 300, gap: 48 };

/** Every character of this font is the same width: 0.6 of the font size. */
const ADVANCE = 0.6;
const LINE_HEIGHT = 1.14;

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "#fbf1c7" mixed with another colour, `amount` (0 to 1) of the other. */
function mix(a, b, amount) {
	const parts = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
	const [x, y] = [parts(a), parts(b)];
	return '#' + x.map((value, i) => Math.round(value + (y[i] - value) * amount).toString(16).padStart(2, '0')).join('');
}

/** Break a title into lines of at most `columns` characters, at spaces. Null if a word cannot fit. */
function wrap(text, columns) {
	const lines = [];
	let line = '';
	for (const word of text.split(/\s+/).filter(Boolean)) {
		if (word.length > columns) return null;
		if (line !== '' && line.length + 1 + word.length > columns) {
			lines.push(line);
			line = word;
		} else {
			line = line === '' ? word : `${line} ${word}`;
		}
	}
	if (line !== '') lines.push(line);
	return lines;
}

/** The largest size at which the title fits its box, and the lines it breaks into at that size. */
function fitTitle(text, width, height) {
	for (let size = 92; size >= 36; size -= 4) {
		const lines = wrap(text, Math.floor(width / (size * ADVANCE)));
		if (lines && lines.length * size * LINE_HEIGHT <= height) return { size, lines };
	}
	// A title that fits at no size (one enormous word) is cut short rather than left off.
	const size = 36;
	const columns = Math.floor(width / (size * ADVANCE));
	const lines = (wrap(text, columns) ?? [text.slice(0, columns - 1) + '…']).slice(0, Math.floor(height / (size * LINE_HEIGHT)));
	return { size, lines };
}

/**
 * @param {object} deps
 * @param {typeof import('sharp')} deps.sharp
 * @param {{ parse(buffer: ArrayBuffer): any }} deps.opentype
 * @param {{ regular: Buffer, bold: Buffer }} deps.fonts  JetBrains Mono, as .woff or .ttf
 *
 * @param {object} card
 * @param {string} card.title
 * @param {string} [card.kicker]   the small line above the title: a tag, or the section's name
 * @param {string} [card.author]
 * @param {string} [card.host]     the site's address without "https://"
 * @param {Buffer} [card.art]      an illustration: ink on a transparent background
 * @param {{ bg: string, fg: string }} card.colours
 * @returns {Promise<Buffer>} a PNG
 */
export async function shareImage({ sharp, opentype, fonts }, { title, kicker = '', author = '', host = '', art, colours }) {
	const read = (buffer) => opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
	const regular = read(fonts.regular);
	const bold = read(fonts.bold);

	const { bg, fg } = colours;
	const surface = mix(bg, '#ffffff', 0.35);
	const muted = mix(fg, bg, 0.3);
	const lines = mix(bg, fg, 0.07);

	/** One run of text as a filled shape. `tracking` is extra space between letters, in 1/1000 of the size. */
	const text = (font, words, x, y, size, colour, tracking = 0) =>
		`<path fill="${colour}" d="${font.getPath(words, x, y, size, { tracking }).toPathData(1)}"/>`;
	const widthOf = (font, words, size, tracking = 0) => font.getAdvanceWidth(words, size, { tracking });

	const hasArt = Boolean(art);
	const titleWidth = RIGHT - LEFT - (hasArt ? ART.size + ART.gap : 0);
	const fitted = fitTitle(title, titleWidth, TITLE.bottom - TITLE.top);
	const lineHeight = fitted.size * LINE_HEIGHT;
	// Centred in its box by eye: the block of lines sits in the middle, measured from the
	// top of the capitals (0.73 of the size) rather than from the invisible line box.
	const blockHeight = (fitted.lines.length - 1) * lineHeight + fitted.size * 0.73;
	const firstBaseline = TITLE.top + (TITLE.bottom - TITLE.top - blockHeight) / 2 + fitted.size * 0.73;

	// The fine horizontal lines behind the card, like ruled paper.
	const ruled = Array.from({ length: Math.ceil(HEIGHT / 6) }, (_, i) => `<rect y="${i * 6}" width="${WIDTH}" height="1" fill="${lines}"/>`).join('');

	const hostWidth = widthOf(regular, host, 26, 40);
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
		<rect width="${WIDTH}" height="${HEIGHT}" fill="${bg}"/>
		${ruled}
		<rect x="${CARD.x + CARD.shadow}" y="${CARD.y + CARD.shadow}" width="${CARD.width}" height="${CARD.height}" fill="${fg}"/>
		<rect x="${CARD.x}" y="${CARD.y}" width="${CARD.width}" height="${CARD.height}" fill="${surface}" stroke="${fg}" stroke-width="3"/>
		${kicker ? text(regular, `// ${kicker}`, LEFT, 136, 30, muted, 120) : ''}
		${fitted.lines.map((line, i) => text(bold, line, LEFT, firstBaseline + i * lineHeight, fitted.size, fg)).join('')}
		<rect x="${LEFT}" y="463" width="${RIGHT - LEFT}" height="3" fill="${fg}"/>
		${author ? text(bold, author.toUpperCase(), LEFT, 516, 26, fg, 200) : ''}
		${host ? text(regular, host, RIGHT - hostWidth, 516, 26, muted, 40) : ''}
		<title>${escape(title)}</title>
	</svg>`;

	const card = sharp(Buffer.from(svg));
	if (!hasArt) return card.png({ compressionLevel: 9 }).toBuffer();

	// The illustration is a stencil: only its shape is used, filled with the text's colour.
	// Empty margins around the drawing are cut off first, so a small drawing on a large
	// canvas fills its place on the card like any other.
	const drawing = await sharp(art).ensureAlpha().trim().toBuffer().catch(() => art);
	const shape = await sharp(drawing)
		.ensureAlpha()
		.resize(ART.size, ART.size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.extractChannel(3)
		.raw()
		.toBuffer();
	const inked = await sharp({ create: { width: ART.size, height: ART.size, channels: 3, background: fg } })
		.joinChannel(shape, { raw: { width: ART.size, height: ART.size, channels: 1 } })
		.png()
		.toBuffer();

	return card
		.composite([{ input: inked, left: RIGHT - ART.size, top: Math.round(TITLE.top + (TITLE.bottom - TITLE.top - ART.size) / 2) - 8 }])
		.png({ compressionLevel: 9 })
		.toBuffer();
}
