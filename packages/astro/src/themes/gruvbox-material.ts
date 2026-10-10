// Gruvbox Material (medium), sourced from the Ghostty "Gruvbox Material
// Light" / "Gruvbox Material Dark" themes, then nudged where needed so that
// every colour used for TEXT reaches WCAG AA (4.5:1) on the background it is
// drawn on. Only OKLab lightness was moved (hue and chroma kept), by the
// minimum needed. `pnpm check:contrast` enforces this.
//
// Adjusted from the Ghostty originals (light palette, on #fbf1c7):
//   red    #c14a4a -> #bb4545      green  #6c782e -> #677329
//   yellow #b47109 -> #9f5d00      purple #945e80 -> #925c7e
//   aqua   #4c7a5d -> #49765a
// `grey` is the untouched original and is for DECORATION ONLY (rules, list
// markers). Anything readable that needs a grey uses `comment`.
export const palette = {
	light: {
		bg: '#fbf1c7',
		fg: '#654735',
		red: '#bb4545',
		green: '#677329',
		yellow: '#9f5d00',
		blue: '#45707a',
		purple: '#925c7e',
		aqua: '#49765a',
		grey: '#a89984',
		comment: '#796b57', // was grey #a89984 (2.45:1)
	},
	dark: {
		bg: '#282828',
		fg: '#d4be98',
		red: '#ea6962',
		green: '#a9b665',
		yellow: '#d8a657',
		blue: '#7daea3',
		purple: '#d3869b',
		aqua: '#89b482',
		grey: '#7c6f64',
		comment: '#9a8d81', // was grey #7c6f64 (3.03:1)
	},
} as const;

type Palette = (typeof palette)[keyof typeof palette];

// Builds a Shiki (TextMate) theme from a palette.
function makeTheme(name: string, type: 'light' | 'dark', c: Palette) {
	const rule = (scope: string[], foreground: string, fontStyle?: string) => ({
		scope,
		settings: fontStyle ? { foreground, fontStyle } : { foreground },
	});

	return {
		name,
		type,
		fg: c.fg,
		bg: c.bg,
		colors: {
			'editor.background': c.bg,
			'editor.foreground': c.fg,
		},
		tokenColors: [
			rule(['comment', 'punctuation.definition.comment'], c.comment, 'italic'),
			rule(['keyword', 'storage', 'storage.type', 'storage.modifier'], c.red),
			rule(['keyword.operator', 'punctuation'], c.fg),
			rule(['string', 'punctuation.definition.string'], c.aqua),
			rule(['string.regexp'], c.blue),
			rule(
				['constant.numeric', 'constant.language', 'constant.character', 'support.constant'],
				c.purple,
			),
			rule(['variable.language'], c.purple),
			rule(['entity.name.function', 'support.function', 'meta.function-call.generic'], c.green),
			rule(
				[
					'entity.name.type',
					'entity.name.class',
					'support.type',
					'support.class',
					'entity.other.inherited-class',
				],
				c.yellow,
			),
			rule(['variable', 'variable.other.readwrite'], c.fg),
			rule(['variable.parameter'], c.blue),
			rule(
				[
					'variable.other.property',
					'variable.other.object.property',
					'meta.object-literal.key',
					'support.type.property-name',
				],
				c.blue,
			),
			rule(['entity.name.tag', 'punctuation.definition.tag'], c.red),
			rule(['entity.other.attribute-name'], c.yellow),
			rule(['markup.heading', 'entity.name.section'], c.red, 'bold'),
			rule(['markup.bold'], c.fg, 'bold'),
			rule(['markup.italic'], c.fg, 'italic'),
			rule(['markup.inline.raw', 'markup.raw'], c.aqua),
			rule(['markup.underline.link', 'string.other.link'], c.blue),
			rule(['invalid', 'invalid.illegal'], c.red, 'underline'),
		],
	};
}

export const gruvboxMaterialLight = makeTheme('gruvbox-material-light', 'light', palette.light);
export const gruvboxMaterialDark = makeTheme('gruvbox-material-dark', 'dark', palette.dark);
