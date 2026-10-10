/**
 * Footnotes, the part that only needs the text.
 *
 * In Markdown a footnote is two things that share a label:
 *
 *     Gruber introduced it in 2004.[^1]          <- the reference, in the sentence
 *
 *     [^1]: Gruber, J. (2004). Introducing…      <- the definition, the note itself
 *
 * The label is only a name that ties the two together. It can be a number or a
 * word ("[^gruber]"), and it is never what a reader sees: the published page
 * numbers the notes 1, 2, 3 in the order their references appear in the text.
 *
 * Two functions live here, and neither knows anything about the editor, so they
 * can be run and tested on a plain string:
 *
 *   scan(text)  finds every reference and definition, and works out the number
 *               each note will be shown with;
 *   tidy(text)  says what to change so the source reads the way the page will:
 *               definitions gathered at the end in the order they are used, and
 *               numeric labels matching the numbers shown.
 */

const DEFINITION_START = /^ {0,3}\[\^([^\]\s]+)\]:[ \t]*/;
const REFERENCE = /\[\^([^\]\s]+)\]/g;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * The parts of one line that are inline code, as [from, to) pairs within the line.
 * "[^1]" between backticks is an example of a footnote, not a footnote.
 */
function codeSpans(line) {
    const spans = [];
    const ticks = /`+/g;
    let opener = null;
    for (let run = ticks.exec(line); run; run = ticks.exec(line)) {
        if (opener === null) {
            opener = run;
        } else if (run[0].length === opener[0].length) {
            spans.push([opener.index, run.index + run[0].length]);
            opener = null;
        }
    }
    return spans;
}

/**
 * Everything footnote-shaped in a text.
 *
 * @returns {{
 *   references: {from: number, to: number, label: string, inDefinition: boolean}[],
 *   definitions: {from: number, to: number, bodyFrom: number, label: string}[],
 *   numbers: Map<string, number>,
 * }}
 *   `from`/`to` are positions in the text. A definition runs from its "[^" to the
 *   end of its last line; `bodyFrom` is where the note's own words start.
 *   `numbers` gives each label the number its note is shown with. A label is only
 *   in there if it has both a reference in the text and a definition.
 */
export function scan(text) {
    const references = [];
    const definitions = [];

    const lines = text.split('\n');
    let position = 0;
    let fence = null; // the ``` or ~~~ that opened the code block we are inside
    let open = null; // the definition whose lines we are still collecting
    let blankRun = false; // was the previous line blank, inside that definition?

    for (const line of lines) {
        const start = position;
        position += line.length + 1;

        const fenceMark = FENCE.exec(line)?.[1];
        if (fence !== null) {
            // Inside a code block nothing is a footnote. It ends at a matching fence.
            if (fenceMark && fenceMark[0] === fence[0] && fenceMark.length >= fence.length && line.trim() === fenceMark) {
                fence = null;
            }
            continue;
        }

        const isBlank = line.trim() === '';
        const isIndented = /^( {4}|\t)/.test(line);
        const definition = DEFINITION_START.exec(line);

        // Does this line still belong to the definition above it? It does when it is
        // indented, or follows straight on without a blank line in between. A blank
        // line is undecided until we see what comes after it.
        if (open !== null && !definition) {
            if (isBlank) {
                blankRun = true;
                continue;
            }
            if (isIndented || (!blankRun && !fenceMark)) {
                open.to = start + line.length;
                blankRun = false;
            } else {
                open = null;
            }
        }

        if (fenceMark && open === null) {
            fence = fenceMark;
            continue;
        }

        if (definition) {
            open = {
                from: start + line.indexOf('[^'),
                to: start + line.length,
                bodyFrom: start + definition[0].length,
                label: definition[1],
            };
            blankRun = false;
            definitions.push(open);
        }

        const code = codeSpans(line);
        for (const match of line.matchAll(REFERENCE)) {
            const from = start + match.index;
            const isTheDefinitionItself = definition && from === open.from;
            const isCode = code.some(([a, b]) => match.index >= a && match.index < b);
            if (!isTheDefinitionItself && !isCode) {
                references.push({ from, to: from + match[0].length, label: match[1], inDefinition: open !== null });
            }
        }
    }

    // Numbers go to notes in the order the text first mentions them. A reference
    // with no definition is not a footnote yet and gets no number.
    const defined = new Set(definitions.map((definition) => definition.label));
    const numbers = new Map();
    for (const reference of references) {
        if (!reference.inDefinition && defined.has(reference.label) && !numbers.has(reference.label)) {
            numbers.set(reference.label, numbers.size + 1);
        }
    }

    return { references, definitions, numbers };
}

/** The words of a note, without its "[^1]: " and with continuation lines un-indented. */
export function noteText(text, definition) {
    return text.slice(definition.bodyFrom, definition.to).replace(/\n( {4}|\t)/g, '\n');
}

/** The other way round: a note's words as they are stored after "[^1]: ". */
export function storedNote(words) {
    return words.trim().replace(/\n(?!\n)/g, '\n    ');
}

/**
 * What to change so the source is in the order the page will show.
 *
 *  - Definitions are gathered at the end of the text, first-used first. Any that
 *    nothing refers to follow after those.
 *  - A label that is a number is changed to the number its note is shown with, so
 *    "[^1]" is never the third note. A label that is a word ("[^gruber]") is
 *    somebody's deliberate name and is left exactly as it is.
 *
 * @returns {{from: number, to: number, insert: string}[]} edits against `text`, in
 *   order and not overlapping. Empty when everything is already in place, which
 *   for a tidy document means this never touches a character.
 */
export function tidy(text) {
    const { references, definitions, numbers } = scan(text);
    if (definitions.length === 0) return [];

    // Only the first definition of a label counts; a second one with the same label
    // can never be reached and is kept with the unused ones.
    const firstOf = new Map();
    for (const definition of definitions) {
        if (!firstOf.has(definition.label)) firstOf.set(definition.label, definition);
    }
    const used = [...numbers.keys()].map((label) => firstOf.get(label));
    const unused = definitions.filter((definition) => !used.includes(definition));
    const ordered = [...used, ...unused];

    // New labels, for the numeric ones only.
    const isNumber = (label) => /^\d+$/.test(label);
    const renamed = new Map();
    for (const [label, number] of numbers) {
        if (isNumber(label)) renamed.set(label, String(number));
    }
    const newLabelOf = new Map();
    let spare = numbers.size;
    for (const definition of ordered) {
        const isUsed = used.includes(definition);
        newLabelOf.set(definition, isUsed ? (renamed.get(definition.label) ?? definition.label) : (isNumber(definition.label) ? String(++spare) : definition.label));
    }
    const relabel = (label) => renamed.get(label) ?? label;

    // Each definition as it should read, with any references inside it relabelled too.
    const written = ordered.map((definition) => {
        let body = '';
        let cursor = definition.bodyFrom;
        for (const reference of references) {
            if (reference.from >= definition.bodyFrom && reference.to <= definition.to) {
                body += text.slice(cursor, reference.from) + `[^${relabel(reference.label)}]`;
                cursor = reference.to;
            }
        }
        body += text.slice(cursor, definition.to);
        return `[^${newLabelOf.get(definition)}]: ${body}`;
    });

    // The "tail": the end of the text, as far back as it is nothing but definitions
    // and blank lines. That is where they all go.
    const inOrder = [...definitions].sort((a, b) => a.from - b.from);
    let tailFrom = text.length;
    const tail = [];
    for (let i = inOrder.length - 1; i >= 0; i--) {
        const definition = inOrder[i];
        const lineStart = text.lastIndexOf('\n', definition.from - 1) + 1;
        if (text.slice(definition.to, tailFrom).trim() !== '') break;
        tailFrom = lineStart;
        tail.unshift(definition);
    }
    const bodyEnd = text.slice(0, tailFrom).trimEnd().length;

    // Keep the author's spacing: a blank line between notes if that is how they
    // wrote them, otherwise one note per line.
    const spaced = inOrder.some((definition, i) => i > 0 && /\n[ \t]*\n/.test(text.slice(inOrder[i - 1].to, definition.from)));
    const newTail = (bodyEnd > 0 ? '\n\n' : '') + written.join(spaced ? '\n\n' : '\n') + '\n';

    const edits = [];

    // References in the running text.
    for (const reference of references) {
        if (!reference.inDefinition && reference.from < bodyEnd && relabel(reference.label) !== reference.label) {
            edits.push({ from: reference.from + 2, to: reference.to - 1, insert: relabel(reference.label) });
        }
    }

    // Definitions sitting in the middle of the text are lifted out, along with the
    // blank lines after them so no gap is left behind.
    for (const definition of inOrder) {
        if (tail.includes(definition)) continue;
        const lineStart = text.lastIndexOf('\n', definition.from - 1) + 1;
        const after = /^\n[ \t]*(\n[ \t]*)*(?=\S)/.exec(text.slice(definition.to));
        const to = definition.to + (after ? after[0].lastIndexOf('\n') + 1 : 0);
        // A reference edit can not sit inside what is being removed.
        for (let i = edits.length - 1; i >= 0; i--) {
            if (edits[i].from >= lineStart && edits[i].to <= to) edits.splice(i, 1);
        }
        edits.push({ from: lineStart, to, insert: '' });
    }

    if (text.slice(bodyEnd).trimEnd() !== newTail.trimEnd()) {
        edits.push({ from: bodyEnd, to: text.length, insert: newTail });
    }

    return edits.sort((a, b) => a.from - b.from);
}

/** Apply tidy()'s edits to a string. The editor applies them its own way; this is for tests. */
export function applyEdits(text, edits) {
    let result = '';
    let cursor = 0;
    for (const edit of edits) {
        result += text.slice(cursor, edit.from) + edit.insert;
        cursor = edit.to;
    }
    return result + text.slice(cursor);
}
