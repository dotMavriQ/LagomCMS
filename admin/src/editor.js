/**
 * The text editor: CodeMirror, set up for writing Markdown prose.
 *
 * createEditor() swaps the plain <textarea> on the page for the real thing and
 * hands back a small object ({ getText, tidy, focus }) so the rest of the page never
 * has to know CodeMirror exists.
 *
 * Related files:
 *   livepreview.js  draws the Markdown as formatted text (the Obsidian look)
 *   slash.js        the "/" menu
 *   blocks.js       figure, gallery, embed: how they are drawn and edited
 *   footnotes.js    footnotes: numbers in the text, the box a note is written in
 *   rendered.js     tables and raw HTML, drawn as what they are
 */

import { closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { searchKeymap } from '@codemirror/search';
import { EditorSelection, EditorState } from '@codemirror/state';
import { drawSelection, EditorView, keymap, placeholder } from '@codemirror/view';
import { tags } from '@lezer/highlight';

import { upload } from './api.js';
import { fenceText, setMediaUrl } from './blocks.js';
import { footnotes, tidyFootnotes } from './footnotes.js';
import { livePreview } from './livepreview.js';
import { slashMenu } from './slash.js';

/**
 * Colours for code inside fenced blocks. The values are CSS variables from
 * admin.css, so they follow the light and dark theme without any JavaScript.
 */
const codeColours = HighlightStyle.define([
    { tag: [tags.keyword, tags.operatorKeyword, tags.modifier], color: 'var(--red)' },
    { tag: [tags.string, tags.special(tags.string), tags.regexp], color: 'var(--green)' },
    { tag: [tags.number, tags.bool, tags.null, tags.atom], color: 'var(--purple)' },
    { tag: [tags.comment, tags.meta], color: 'var(--comment)', fontStyle: 'italic' },
    { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--blue)' },
    { tag: [tags.typeName, tags.className, tags.tagName], color: 'var(--yellow)' },
    { tag: [tags.propertyName, tags.attributeName], color: 'var(--aqua)' },
    { tag: tags.processingInstruction, color: 'var(--comment)' },
    { tag: tags.url, color: 'var(--comment)' },
]);

/**
 * Wrap the selection in a pair of markers, or take them off again if they are
 * already there. This is what Ctrl+B and Ctrl+I do.
 */
function toggleWrap(marker) {
    return (view) => {
        const { state } = view;
        view.dispatch(state.changeByRange((range) => {
            const size = marker.length;
            const before = state.sliceDoc(range.from - size, range.from);
            const after = state.sliceDoc(range.to, range.to + size);

            if (before === marker && after === marker) {
                return {
                    changes: [{ from: range.from - size, to: range.from }, { from: range.to, to: range.to + size }],
                    range: EditorSelection.range(range.from - size, range.to - size),
                };
            }
            return {
                changes: [{ from: range.from, insert: marker }, { from: range.to, insert: marker }],
                range: EditorSelection.range(range.from + size, range.to + size),
            };
        }));
        return true;
    };
}

/** Ctrl+K: turn the selection into a link and put the cursor where the address goes. */
function insertLink(view) {
    const { state } = view;
    const range = state.selection.main;
    const text = state.sliceDoc(range.from, range.to);
    view.dispatch({
        changes: { from: range.from, to: range.to, insert: `[${text}]()` },
        selection: { anchor: range.from + text.length + 3 },
    });
    return true;
}

/**
 * Upload images that were pasted or dropped, and insert them where the cursor is.
 * One image becomes a figure, several become a gallery.
 */
async function insertImages(view, files, mediaUrl) {
    const images = [...files].filter((file) => file.type.startsWith('image/'));
    if (images.length === 0) return false;

    const stored = [];
    try {
        for (const file of images) stored.push(await upload(mediaUrl, file));
    } catch (error) {
        alert(error.message);
        return true;
    }

    const asImage = (file) => ({ src: file.url, alt: '', width: file.width, height: file.height });
    const block = stored.length === 1
        ? fenceText('figure', asImage(stored[0]))
        : fenceText('gallery', { images: stored.map(asImage) });

    // A block needs a line to itself, with a blank line on either side.
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    const insert = (line.text.trim() === '' ? '' : '\n\n') + block + '\n\n';
    view.dispatch({ changes: { from: line.to, insert }, selection: { anchor: line.to + insert.length } });
    return true;
}

export function createEditor(host, { text, mediaUrl, onChange, onSave }) {
    setMediaUrl(mediaUrl);

    const view = new EditorView({
        parent: host,
        state: EditorState.create({
            doc: text,
            extensions: [
                history(),
                drawSelection(),
                closeBrackets(),
                EditorView.lineWrapping,
                placeholder('Write, or type / for blocks…'),

                // GitHub-flavoured Markdown, with real syntax highlighting inside
                // code fences. The grammars for other languages are loaded on demand.
                markdown({ base: markdownLanguage, codeLanguages: languages }),
                syntaxHighlighting(codeColours),

                livePreview,
                slashMenu,
                footnotes,

                keymap.of([
                    { key: 'Mod-b', run: toggleWrap('**') },
                    { key: 'Mod-i', run: toggleWrap('*') },
                    { key: 'Mod-e', run: toggleWrap('`') },
                    { key: 'Mod-k', run: insertLink },
                    { key: 'Mod-s', run: () => { onSave(); return true; } },
                    ...closeBracketsKeymap,
                    ...completionKeymap,
                    ...historyKeymap,
                    ...searchKeymap,
                    indentWithTab,
                    ...defaultKeymap,
                ]),

                // The browser's own spellchecker, in the text you write.
                EditorView.contentAttributes.of({ spellcheck: 'true', autocorrect: 'on', autocapitalize: 'sentences' }),

                EditorView.updateListener.of((update) => {
                    if (update.docChanged) onChange();
                }),

                EditorView.domEventHandlers({
                    paste(event, editor) {
                        const files = event.clipboardData?.files;
                        if (files?.length && [...files].some((file) => file.type.startsWith('image/'))) {
                            event.preventDefault();
                            insertImages(editor, files, mediaUrl);
                            return true;
                        }
                        return false;
                    },
                    drop(event, editor) {
                        const files = event.dataTransfer?.files;
                        if (files?.length && [...files].some((file) => file.type.startsWith('image/'))) {
                            event.preventDefault();
                            insertImages(editor, files, mediaUrl);
                            return true;
                        }
                        return false;
                    },
                }),
            ],
        }),
    });

    // The textarea did its job as the no-JavaScript fallback. The editor takes over.
    host.querySelector('.editor__fallback')?.remove();

    return {
        getText: () => view.state.doc.toString(),
        // Put the footnotes in the order they are used. Done just before a save.
        tidy: () => tidyFootnotes(view),
        focus: () => view.focus(),
    };
}
