/**
 * The slash menu: type "/" at the start of a line to insert something.
 *
 * It is CodeMirror's autocomplete with our own list in it. Each entry either
 * drops some Markdown in place (a heading, a table, a callout) or, for the custom
 * blocks, opens that block's form first and inserts the result.
 */

import { autocompletion } from '@codemirror/autocomplete';

import { BLOCKS, editBlock, fenceText } from './blocks.js';
import { insertFootnote } from './footnotes.js';

/**
 * Replace the typed "/word" with `text`, and put the cursor where `cursor` says:
 * a number is an offset into the text, and a [from, to] pair selects that part so
 * the placeholder can be typed over straight away.
 */
function insert(text, cursor = text.length) {
    return (view, _completion, from, to) => {
        const [anchor, head] = Array.isArray(cursor) ? cursor : [cursor, cursor];
        view.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: from + anchor, head: from + head },
            scrollIntoView: true,
        });
    };
}

/** Open the form for a custom block, then insert whatever comes back. */
function insertBlock(type) {
    return async (view, _completion, from, to) => {
        // Clear the "/word" first so it is not left behind if the form is cancelled.
        view.dispatch({ changes: { from, to, insert: '' } });
        const data = await editBlock(type, {});
        if (data) {
            // The cursor goes on the line after the block. Left inside it, the block
            // would show its raw JSON instead of the picture you just chose.
            const text = fenceText(type, data) + '\n';
            view.dispatch({
                changes: { from, insert: text },
                selection: { anchor: from + text.length },
                scrollIntoView: true,
            });
        }
        view.focus();
    };
}

const today = () => new Date().toISOString().slice(0, 10);

const ITEMS = [
    { label: 'Heading 2', detail: '##', apply: insert('## ') },
    { label: 'Heading 3', detail: '###', apply: insert('### ') },
    { label: 'Heading 4', detail: '####', apply: insert('#### ') },
    { label: 'Bullet list', detail: '-', apply: insert('- ') },
    { label: 'Numbered list', detail: '1.', apply: insert('1. ') },
    { label: 'Quote', detail: '>', apply: insert('> ') },
    { label: 'Code block', detail: '```', apply: insert('```\n\n```', 3) },
    { label: 'Divider', detail: '---', apply: insert('---\n') },
    {
        label: 'Table', detail: '| |',
        apply: insert('| Column | Column |\n| ------ | ------ |\n|        |        |\n', [2, 8]),
    },
    // Mid-sentence, where footnotes usually go, the shortcut is the way in: the / menu only opens at the start of a line.
    { label: 'Footnote', detail: 'Ctrl+Alt+F', apply: (view, _completion, from, to) => insertFootnote(view, to, from) },
    { label: 'Callout: note', detail: '> [!note]', apply: insert('> [!note] Title\n> Text', [10, 15]) },
    { label: 'Callout: tip', detail: '> [!tip]', apply: insert('> [!tip] Title\n> Text', [9, 14]) },
    { label: 'Callout: warning', detail: '> [!warning]', apply: insert('> [!warning] Title\n> Text', [13, 18]) },
    ...Object.entries(BLOCKS).map(([type, block]) => ({ label: block.label, detail: block.hint, apply: insertBlock(type) })),
    { label: 'Today’s date', detail: today(), apply: (view, c, from, to) => insert(today())(view, c, from, to) },
];

function slashSource(context) {
    // Only when the slash is the first thing on the line. A slash in the middle of
    // a sentence ("and/or") must never pop a menu open.
    const typed = context.matchBefore(/^\s*\/[\w ]*$/);
    if (!typed) return null;

    const slash = typed.from + typed.text.indexOf('/');
    return {
        from: slash,
        options: ITEMS.map((item, i) => ({
            // The label has to start with "/" for CodeMirror to match what was typed.
            label: '/' + item.label.toLowerCase(),
            displayLabel: item.label,
            detail: item.detail,
            apply: item.apply,
            // Keep our order instead of CodeMirror's alphabetical one.
            boost: ITEMS.length - i,
        })),
    };
}

export const slashMenu = autocompletion({
    override: [slashSource],
    icons: false,
    defaultKeymap: true,
});
