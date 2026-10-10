/**
 * Footnotes in the editor.
 *
 * What you see and do:
 *
 *   - A reference ("[^1]" in the Markdown) is drawn as a small raised number, the
 *     same number the published page will show. Numbers always follow the text:
 *     put a new footnote above an old one and every number after it moves up.
 *   - Click a number and the note opens right there, in a small box, to read or
 *     rewrite. You never have to scroll to the bottom and back.
 *   - Ctrl+Alt+F (or "Footnote" in the / menu) adds one where the cursor is and
 *     opens its box. Type the note, press Enter, carry on with the sentence.
 *   - The notes themselves are listed at the end of the text under "Footnotes",
 *     numbered. Clicking a number there jumps back to where it is used.
 *
 * The document stays plain Markdown throughout. footnotes-core.js does the
 * thinking (which note is which number, what order they belong in); this file is
 * only how that is drawn and edited.
 */

import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, keymap, showTooltip } from '@codemirror/view';

import { noteText, scan, storedNote, tidy } from './footnotes-core.js';

// ---- How footnotes are drawn -------------------------------------------------

/** The raised number in the sentence. "?" when there is no note for it yet. */
class ReferenceWidget extends WidgetType {
    constructor(number, note) {
        super();
        this.number = number;
        this.note = note;
    }

    eq(other) {
        return other.number === this.number && other.note === this.note;
    }

    toDOM() {
        const chip = document.createElement('sup');
        chip.className = 'lp-fn' + (this.number === null ? ' lp-fn--missing' : '');
        chip.textContent = this.number ?? '?';
        chip.title = this.number === null ? 'This footnote has no note yet. Click to write it.' : this.note;
        chip.setAttribute('role', 'button');
        chip.dataset.fnReference = '';
        return chip;
    }

    // Let the editor see clicks on this: the handler at the bottom of this file opens the note.
    ignoreEvent() {
        return false;
    }
}

/** The "3." in front of a note in the list at the end. "–" when nothing refers to it. */
class DefinitionWidget extends WidgetType {
    constructor(number) {
        super();
        this.number = number;
    }

    eq(other) {
        return other.number === this.number;
    }

    toDOM() {
        const marker = document.createElement('span');
        marker.className = 'lp-fn-number' + (this.number === null ? ' lp-fn-number--unused' : '');
        marker.textContent = this.number === null ? '–' : `${this.number}.`;
        marker.title = this.number === null ? 'Nothing in the text refers to this note, so it is not shown on the site.' : 'Show where this is used';
        marker.dataset.fnDefinition = '';
        return marker;
    }

    ignoreEvent() {
        return false;
    }
}

/**
 * The decorations for every footnote in the document. Called by livepreview.js,
 * which owns the drawing of everything else and passes in its own helpers.
 *
 * @param {import('@codemirror/state').EditorState} state
 * @param {(from: number, to: number) => boolean} selected is the cursor in this range?
 * @param {any[]} found  every decoration goes in here
 * @param {any[]} atomic ranges the cursor steps over as one unit go in here as well
 */
export function decorateFootnotes(state, selected, found, atomic) {
    const text = state.doc.toString();
    if (!text.includes('[^')) return;

    const { references, definitions, numbers } = scan(text);
    const byLabel = new Map();
    for (const definition of definitions) {
        if (!byLabel.has(definition.label)) byLabel.set(definition.label, definition);
    }

    for (const reference of references) {
        // Always the number, never the Markdown, even with the cursor right beside it:
        // everything you would do to "[^1]" by hand is done through its box, and
        // Backspace takes the whole reference out in one go.
        const definition = byLabel.get(reference.label);
        const number = definition && !reference.inDefinition ? numbers.get(reference.label) ?? null : null;
        // A reference inside another note keeps its Markdown look; it has no number of its own.
        if (reference.inDefinition) {
            found.push(Decoration.mark({ class: 'lp-syntax' }).range(reference.from, reference.to));
            continue;
        }
        const widget = new ReferenceWidget(number, definition ? noteText(text, definition).trim() : '');
        const chip = Decoration.replace({ widget }).range(reference.from, reference.to);
        found.push(chip);
        atomic.push(chip);
    }

    // The list of notes. The first one gets the rule and the "Footnotes" heading
    // (drawn by CSS), so the list reads as a section of its own.
    const sorted = [...definitions].sort((a, b) => a.from - b.from);
    sorted.forEach((definition, i) => {
        const firstLine = state.doc.lineAt(definition.from);
        const lastLine = state.doc.lineAt(definition.to);
        const startsTheList = i === 0 || text.slice(sorted[i - 1].to, definition.from).trim() !== '';
        for (let number = firstLine.number; number <= lastLine.number; number++) {
            const line = state.doc.line(number);
            const classes = 'lp-fn-note' + (number === firstLine.number && startsTheList ? ' lp-fn-note--first' : '');
            found.push(Decoration.line({ class: classes }).range(line.from));
        }

        const isFirstOfItsLabel = byLabel.get(definition.label) === definition;
        const number = isFirstOfItsLabel ? numbers.get(definition.label) ?? null : null;
        if (selected(firstLine.from, firstLine.to)) {
            found.push(Decoration.mark({ class: 'lp-syntax' }).range(definition.from, definition.bodyFrom));
        } else {
            found.push(Decoration.replace({ widget: new DefinitionWidget(number) }).range(definition.from, definition.bodyFrom));
        }
    });
}

// ---- Changing footnotes -----------------------------------------------------------

/**
 * One transaction that makes `changes` and then tidies the result (see tidy() in
 * footnotes-core.js), so adding or removing a footnote is a single step to undo.
 *
 * @returns {{changes: import('@codemirror/state').ChangeSet, tidied: import('@codemirror/state').ChangeSet}}
 *   `tidied` alone maps a position in the half-way document to the final one.
 */
function withTidy(state, changes) {
    const first = state.changes(changes);
    const halfway = state.update({ changes: first }).state;
    const tidied = halfway.changes(tidy(halfway.doc.toString()));
    return { changes: first.compose(tidied), tidied };
}

/** Put the source in order. Called before a save; does nothing to a tidy document. */
export function tidyFootnotes(view) {
    const edits = tidy(view.state.doc.toString());
    if (edits.length > 0) view.dispatch({ changes: edits, userEvent: 'footnote.tidy' });
}

/** Add a footnote at `position` (the cursor, by default) and open its box. */
export function insertFootnote(view, position = view.state.selection.main.to, replaceFrom = position) {
    const { state } = view;
    const text = state.doc.toString();

    // Any label nothing else uses will do: tidying gives it its real number in the same step.
    const taken = new Set([...scan(text).definitions.map((d) => d.label), ...scan(text).references.map((r) => r.label)]);
    let label = 1;
    while (taken.has(String(label))) label++;

    const { changes, tidied } = withTidy(state, [
        { from: replaceFrom, to: position, insert: `[^${label}]` },
        { from: state.doc.length, insert: `\n\n[^${label}]: ` },
    ]);

    // Where the new reference ended up, and how long it is now it has its number.
    const start = tidied.mapPos(replaceFrom, -1);
    const after = state.update({ changes }).state.doc.toString();
    const reference = scan(after).references.find((r) => r.from === start);
    const end = reference ? reference.to : start;

    view.dispatch({
        changes,
        selection: { anchor: end },
        effects: openNote.of(start),
        userEvent: 'input.footnote',
        scrollIntoView: true,
    });
    return true;
}

/** Take a footnote out: every reference to it, and the note. */
function removeFootnote(view, label) {
    const text = view.state.doc.toString();
    const { references, definitions } = scan(text);
    const edits = references
        .filter((reference) => reference.label === label && !reference.inDefinition)
        .map((reference) => ({ from: reference.from, to: reference.to, insert: '' }));

    for (const definition of definitions.filter((d) => d.label === label)) {
        const lineStart = text.lastIndexOf('\n', definition.from - 1) + 1;
        const lineEnd = definition.to < text.length ? definition.to + 1 : definition.to;
        edits.push({ from: lineStart, to: lineEnd, insert: '' });
    }

    view.dispatch({
        changes: withTidy(view.state, edits.sort((a, b) => a.from - b.from)).changes,
        effects: closeNote.of(null),
        userEvent: 'delete.footnote',
    });
}

/** Write new words into a note, creating the note if the reference had none. */
function writeNote(view, label, words) {
    const text = view.state.doc.toString();
    const definition = scan(text).definitions.find((d) => d.label === label);
    const stored = storedNote(words);

    view.dispatch({
        changes: definition
            ? { from: definition.bodyFrom, to: definition.to, insert: stored }
            : { from: text.length, insert: `${text.trimEnd() === text ? '\n\n' : '\n'}[^${label}]: ${stored}` },
        userEvent: 'input.footnote',
    });
}

// ---- The box a note is read and written in ---------------------------------------

const openNote = StateEffect.define();
const closeNote = StateEffect.define();

/** The reference at (or wrapped around) a position, with what it points to. */
function footnoteAt(state, position) {
    const text = state.doc.toString();
    const found = scan(text);
    const reference = found.references.find((r) => r.from <= position && r.to >= position && !r.inDefinition);
    if (!reference) return null;

    const definition = found.definitions.find((d) => d.label === reference.label);
    return {
        label: reference.label,
        number: definition ? found.numbers.get(reference.label) ?? null : null,
        words: definition ? noteText(text, definition).trim() : '',
        uses: found.references.filter((r) => r.label === reference.label && !r.inDefinition).length,
        reference,
    };
}

function noteBox(view) {
    const position = view.state.field(noteField).position;
    const footnote = footnoteAt(view.state, position);

    const box = document.createElement('div');
    box.className = 'fn-box';
    box.innerHTML = `
        <div class="fn-box__top">
            <span class="fn-box__title"></span>
            <button class="fn-box__remove" type="button">Remove</button>
        </div>
        <textarea class="fn-box__text" rows="3" spellcheck="true" placeholder="The note. Markdown works: *italics*, [links](https://…)."></textarea>
        <p class="fn-box__hint">Enter to finish · Shift+Enter for a new line</p>`;

    const title = box.querySelector('.fn-box__title');
    const words = box.querySelector('textarea');
    const label = footnote?.label ?? '';
    words.value = footnote?.words ?? '';

    const drawTitle = () => {
        const now = footnoteAt(view.state, view.state.field(noteField, false)?.position ?? position);
        const number = now?.number ?? scan(view.state.doc.toString()).numbers.get(label) ?? null;
        title.textContent = number === null ? 'New footnote' : `Footnote ${number}`;
        if (now && now.uses > 1) title.textContent += ` · used ${now.uses} times`;
    };
    drawTitle();

    const close = () => {
        // Closing is the natural moment to put things in order: the note is done.
        const edits = tidy(view.state.doc.toString());
        view.dispatch({ changes: edits, effects: closeNote.of(null), userEvent: 'footnote.tidy' });
        view.focus();
    };

    words.addEventListener('input', () => {
        // The label can change under us when a tidy renumbers; look it up afresh.
        const now = footnoteAt(view.state, view.state.field(noteField).position);
        if (now) writeNote(view, now.label, words.value);
    });
    words.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Escape') {
            event.preventDefault();
            close();
        }
        // Undo and the like belong to the text box while it has the focus.
        event.stopPropagation();
    });
    box.querySelector('.fn-box__remove').addEventListener('click', () => {
        const now = footnoteAt(view.state, view.state.field(noteField).position);
        if (now) removeFootnote(view, now.label);
        view.focus();
    });

    return {
        dom: box,
        mount() {
            words.focus();
            words.setSelectionRange(words.value.length, words.value.length);
        },
        update: drawTitle,
    };
}

/**
 * Which note is open, if any. `position` is where its reference starts, and it is
 * carried along as the text around it changes. The tooltip object is made once
 * per opening: CodeMirror keeps the box on screen for as long as `create` is the
 * same function, which is what stops it being rebuilt (and losing the cursor in
 * the text box) on every keystroke.
 */
const noteField = StateField.define({
    create: () => null,
    update(open, transaction) {
        for (const effect of transaction.effects) {
            if (effect.is(openNote)) return { position: effect.value, create: (view) => noteBox(view) };
            if (effect.is(closeNote)) return null;
        }
        if (open === null || !transaction.docChanged) return open;

        const position = transaction.changes.mapPos(open.position, 1);
        // The reference itself was deleted: nothing left to show a note for.
        if (footnoteAt(transaction.state, position) === null) return null;
        return { position, create: open.create };
    },
    // "position + 1" is inside the reference, so the box hangs from the number itself.
    // Exactly at its start is ambiguous where a line wraps: that spot is both the
    // end of one line on screen and the beginning of the next.
    provide: (field) => showTooltip.from(field, (open) => (open === null ? null : { pos: open.position + 1, above: false, arrow: false, create: open.create })),
});

/** Clicks on the numbers: a reference opens its note, a note's number jumps to its reference. */
const clicks = EditorView.domEventHandlers({
    mousedown(event, view) {
        const target = /** @type {HTMLElement} */ (event.target);

        if (target.closest?.('[data-fn-reference]')) {
            event.preventDefault();
            const position = view.posAtDOM(target.closest('[data-fn-reference]'));
            const reference = scan(view.state.doc.toString()).references.find((r) => r.from <= position && r.to >= position);
            if (reference) view.dispatch({ selection: { anchor: reference.to }, effects: openNote.of(reference.from) });
            return true;
        }

        if (target.closest?.('[data-fn-definition]')) {
            event.preventDefault();
            const found = scan(view.state.doc.toString());
            const position = view.posAtDOM(target.closest('[data-fn-definition]'));
            const definition = found.definitions.find((d) => d.from <= position && d.to >= position);
            const reference = definition && found.references.find((r) => r.label === definition.label && !r.inDefinition);
            if (reference) {
                view.dispatch({ selection: { anchor: reference.to }, effects: EditorView.scrollIntoView(reference.from, { y: 'center' }) });
                view.focus();
            }
            return true;
        }

        // A click anywhere else in the text puts the open note away.
        if (view.state.field(noteField) !== null && !target.closest?.('.fn-box')) {
            view.dispatch({ changes: tidy(view.state.doc.toString()), effects: closeNote.of(null), userEvent: 'footnote.tidy' });
        }
        return false;
    },
});

export const footnotes = [
    noteField,
    clicks,
    keymap.of([{ key: 'Mod-Alt-f', run: (view) => insertFootnote(view) }]),
];
