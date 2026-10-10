/**
 * Live preview: Markdown that looks like the finished text while you type it.
 *
 * This is the Obsidian trick. The document is always plain Markdown, and nothing
 * here changes a single character of it. What changes is how it is drawn:
 *
 *   - `## Heading` is drawn large, and the `##` is hidden;
 *   - `**bold**` is drawn bold, and the asterisks are hidden;
 *   - `[text](url)` shows only "text", styled as a link;
 *   - a ```lagom:figure block is drawn as the actual picture;
 *   - a table is drawn as a table, and raw HTML as what it produces (rendered.js);
 *   - a footnote `[^1]` is drawn as its number (see footnotes.js).
 *
 * The moment the cursor enters one of these, its Markdown is shown again so it
 * can be edited. Leave, and it folds back into the pretty version.
 *
 * How: CodeMirror parses the Markdown into a syntax tree. We walk that tree and
 * hand back "decorations" (CSS classes, hidden ranges, widgets). It is recomputed
 * whenever the text or the selection changes, for the whole document, which for
 * anything up to a very long post takes well under a millisecond or two.
 */

import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { RangeSet, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';

import { BlockWidget, parseFence } from './blocks.js';
import { decorateFootnotes } from './footnotes.js';
import { HtmlWidget, TableWidget } from './rendered.js';

const hidden = Decoration.replace({});
const lineClass = (name) => Decoration.line({ class: name });
const mark = (name, attributes) => Decoration.mark({ class: name, attributes });

/** The names of the callout kinds we style. Anything else is drawn as a plain note. */
const CALLOUT_TONES = ['note', 'tip', 'warning', 'info', 'quote'];

class RuleWidget extends WidgetType {
    toDOM() {
        return document.createElement('hr');
    }
}

class ImageWidget extends WidgetType {
    constructor(source, alt) {
        super();
        this.source = source;
        this.alt = alt;
    }

    eq(other) {
        return other.source === this.source && other.alt === this.alt;
    }

    toDOM() {
        const image = document.createElement('img');
        image.className = 'lp-image';
        image.src = this.source;
        image.alt = this.alt;
        return image;
    }
}

/** The dot drawn in place of a list's "-" or "*". */
class BulletWidget extends WidgetType {
    eq() {
        return true;
    }

    toDOM() {
        const dot = document.createElement('span');
        dot.className = 'lp-bullet';
        dot.textContent = '•';
        return dot;
    }
}

/** The small "Note" / "Warning" label that stands in for `[!note]`. */
class CalloutLabel extends WidgetType {
    constructor(tone) {
        super();
        this.tone = tone;
    }

    eq(other) {
        return other.tone === this.tone;
    }

    toDOM() {
        const label = document.createElement('span');
        label.className = 'lp-callout-label';
        label.textContent = this.tone;
        return label;
    }
}

/**
 * Work out every decoration for the current text and selection.
 *
 * Returns two sets: `decorations` is everything, and `atomic` is just the block
 * widgets, which the cursor should step over as one unit rather than fall into.
 */
function build(state) {
    const doc = state.doc;
    const tree = ensureSyntaxTree(state, doc.length, 200) ?? syntaxTree(state);
    const found = [];
    const atomic = [];

    // "Is the cursor in here?" decides between showing the Markdown and hiding it.
    const selected = (from, to) => state.selection.ranges.some((range) => range.from <= to && range.to >= from);
    const onSelectedLine = (position) => {
        const line = doc.lineAt(position);
        return selected(line.from, line.to);
    };
    const eachLine = (from, to, callback) => {
        for (let line = doc.lineAt(from); ; line = doc.line(line.number + 1)) {
            callback(line);
            if (line.to >= to || line.number === doc.lines) break;
        }
    };

    tree.iterate({
        enter(node) {
            const { name, from, to } = node;

            // ---- Headings: "## Title" ---------------------------------------------
            const heading = /^ATXHeading(\d)$/.exec(name);
            if (heading) {
                found.push(lineClass(`lp-heading lp-h${heading[1]}`).range(doc.lineAt(from).from));
                return;
            }
            if (name === 'HeaderMark' && node.node.parent?.name.startsWith('ATXHeading')) {
                // Hide the #s and the space after them. Only the leading ones: a
                // heading may also end in #s, and those are rare enough to leave be.
                const line = doc.lineAt(from);
                if (from === line.from && !onSelectedLine(from) && to < line.to) {
                    found.push(hidden.range(from, to + 1));
                }
                return;
            }

            // ---- Bold, italic, strikethrough, inline code ----------------------------
            const inline = { Emphasis: 'lp-em', StrongEmphasis: 'lp-strong', Strikethrough: 'lp-strike', InlineCode: 'lp-code' }[name];
            if (inline) {
                found.push(mark(inline).range(from, to));
                return;
            }
            if (name === 'EmphasisMark' || name === 'StrikethroughMark'
                || (name === 'CodeMark' && node.node.parent?.name === 'InlineCode')) {
                const parent = node.node.parent;
                if (parent && !selected(parent.from, parent.to) && to > from) {
                    found.push(hidden.range(from, to));
                }
                return;
            }

            // ---- Links: [text](url) ----------------------------------------------------
            if (name === 'Link') {
                const marks = node.node.getChildren('LinkMark');
                const url = node.node.getChild('URL');
                // Only the inline form. Footnote references and reference-style links
                // have no URL inside them and are left exactly as typed.
                if (marks.length < 4 || !url) return;

                const address = doc.sliceString(url.from, url.to);
                if (marks[1].from > marks[0].to) {
                    found.push(mark('lp-link', { title: address }).range(marks[0].to, marks[1].from));
                }
                if (selected(from, to)) {
                    found.push(mark('lp-syntax').range(marks[1].from, to));
                } else {
                    found.push(hidden.range(marks[0].from, marks[0].to));
                    found.push(hidden.range(marks[1].from, to));
                }
                return false;
            }

            // ---- Images: ![alt](url) ------------------------------------------------------
            if (name === 'Image') {
                const marks = node.node.getChildren('LinkMark');
                const url = node.node.getChild('URL');
                if (!url || marks.length < 2) return false;

                const widget = new ImageWidget(doc.sliceString(url.from, url.to), doc.sliceString(marks[0].to, marks[1].from));
                if (selected(from, to)) {
                    found.push(mark('lp-syntax').range(from, to));
                    found.push(Decoration.widget({ widget, side: 1 }).range(to));
                } else {
                    found.push(Decoration.replace({ widget }).range(from, to));
                }
                return false;
            }

            // ---- Quotes and callouts: "> text", "> [!note] Title" ---------------------------
            if (name === 'Blockquote') {
                // Nested quotes are styled by their outermost parent.
                if (node.node.parent?.name === 'Blockquote') return;

                const first = doc.lineAt(from);
                const callout = /^>\s*\[!(\w+)\]\s?/.exec(first.text);
                const tone = callout ? callout[1].toLowerCase() : null;
                const classes = tone
                    ? `lp-quote lp-callout lp-callout--${CALLOUT_TONES.includes(tone) ? tone : 'note'}`
                    : 'lp-quote';

                eachLine(from, to, (line) => {
                    found.push(lineClass(line.number === first.number && tone ? `${classes} lp-callout-title` : classes).range(line.from));
                });

                if (tone && !selected(first.from, first.to)) {
                    const start = first.from + first.text.indexOf('[!');
                    found.push(Decoration.replace({ widget: new CalloutLabel(tone) }).range(start, first.from + callout[0].length));
                }
                return;
            }
            if (name === 'QuoteMark') {
                if (!onSelectedLine(from)) {
                    const space = doc.sliceString(to, to + 1) === ' ' ? 1 : 0;
                    found.push(hidden.range(from, to + space));
                } else {
                    found.push(mark('lp-syntax').range(from, to));
                }
                return;
            }

            // ---- Lists ---------------------------------------------------------------------------
            if (name === 'ListMark') {
                // Bullets become dots; numbers ("1.") are fine as they are.
                const isBullet = node.node.parent?.parent?.name === 'BulletList';
                if (isBullet && !onSelectedLine(from)) {
                    found.push(Decoration.replace({ widget: new BulletWidget() }).range(from, to));
                } else {
                    found.push(mark('lp-listmark').range(from, to));
                }
                return;
            }

            // ---- Dividers: "---" ---------------------------------------------------------------------
            if (name === 'HorizontalRule') {
                if (onSelectedLine(from)) {
                    found.push(mark('lp-syntax').range(from, to));
                } else {
                    found.push(Decoration.replace({ widget: new RuleWidget() }).range(from, to));
                }
                return;
            }

            // ---- Code blocks, and our own blocks hiding inside them ----------------------------------------
            if (name === 'FencedCode') {
                const fence = parseFence(doc.sliceString(from, to));
                const wholeLines = from === doc.lineAt(from).from && to === doc.lineAt(to).to;

                // A ```lagom:<type> fence is drawn as the block it stands for, unless
                // the cursor is inside it, in which case you get to see the JSON.
                if (fence && wholeLines && !selected(from, to)) {
                    const widget = Decoration.replace({ widget: new BlockWidget(fence.type, fence.json), block: true }).range(from, to);
                    found.push(widget);
                    atomic.push(widget);
                    return false;
                }

                const firstLine = doc.lineAt(from).number;
                const lastLine = doc.lineAt(to).number;
                eachLine(from, to, (line) => {
                    const edge = line.number === firstLine || line.number === lastLine ? ' lp-codefence' : '';
                    found.push(lineClass('lp-codeblock' + edge).range(line.from));
                });
                return;
            }

            // ---- Tables and raw HTML: drawn finished, source under the cursor ------------------------------
            if (name === 'HTMLBlock' || name === 'Table') {
                const isTable = name === 'Table';
                const wholeLines = from === doc.lineAt(from).from && to === doc.lineAt(to).to;
                // Only at the top level of the text. Inside a quote or a list item the
                // lines carry "> " or an indent that is not part of the table or the HTML.
                const topLevel = node.node.parent?.name === 'Document';

                if (topLevel && wholeLines && !selected(from, to)) {
                    const source = doc.sliceString(from, to);
                    const widget = Decoration.replace({
                        widget: isTable ? new TableWidget(source) : new HtmlWidget(source),
                        block: true,
                    }).range(from, to);
                    found.push(widget);
                    atomic.push(widget);
                    return false;
                }

                const classes = isTable ? 'lp-table' : 'lp-html';
                eachLine(from, to, (line) => found.push(lineClass(classes).range(line.from)));
                return;
            }

            // ---- Addresses written out: <https://example.com>, or just https://example.com ------------------
            if (name === 'Autolink') {
                const url = node.node.getChild('URL');
                if (!url) return false;
                found.push(mark('lp-link').range(url.from, url.to));
                if (!selected(from, to)) {
                    if (url.from > from) found.push(hidden.range(from, url.from));
                    if (to > url.to) found.push(hidden.range(url.to, to));
                }
                return false;
            }
            if (name === 'URL' && node.node.parent?.name !== 'Link' && node.node.parent?.name !== 'Image') {
                found.push(mark('lp-link').range(from, to));
            }
        },
    });

    // Footnotes. The Markdown parser has no node for these, so they are found and
    // drawn by their own module: numbers in the text, a numbered list at the end.
    decorateFootnotes(state, selected, found, atomic);

    return {
        // `true` asks CodeMirror to sort the ranges; we collected them in tree order,
        // which is nearly but not exactly the order it insists on.
        decorations: Decoration.set(found, true),
        atomic: RangeSet.of(atomic, true),
    };
}

const livePreviewField = StateField.define({
    create: build,
    update(value, transaction) {
        return transaction.docChanged || transaction.selection ? build(transaction.state) : value;
    },
    provide: (field) => [
        EditorView.decorations.from(field, (value) => value.decorations),
        EditorView.atomicRanges.of((view) => view.state.field(field).atomic),
    ],
});

export const livePreview = [livePreviewField];
