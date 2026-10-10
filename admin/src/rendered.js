/**
 * Tables and raw HTML, drawn as what they are.
 *
 * Both are ordinary text in the file: a Markdown table is rows of "| a | b |", and
 * HTML is HTML. Left as source they are the two things in a post that look nothing
 * like the published page, so outside the cursor they are drawn finished:
 *
 *   - a table as a table. Click a row and you are in that row's source;
 *   - HTML as the thing it produces, in a frame with a "Source" button, the same
 *     frame the figure and gallery blocks use.
 *
 * As everywhere in the live preview, not a character of the document changes.
 */

import { WidgetType } from '@codemirror/view';

const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
};

// ---- Inline Markdown, for table cells -----------------------------------------

/**
 * One of: `code`, **bold**, *italic*, [text](url), <url>, or a backslash escape.
 * Tried at each position, in this order, so `**` wins over `*`.
 */
const INLINE = /(`+)([\s\S]+?)\1|\*\*([\s\S]+?)\*\*|\*([^\s*][\s\S]*?)\*|_([^\s_][\s\S]*?)_|\[([^\]]*)\]\(([^)\s]*)[^)]*\)|<(https?:\/\/[^>\s]+)>|\\([\\`*_[\]|<>])/g;

/**
 * A cell's Markdown as DOM nodes. This is a small reading of Markdown, enough for
 * what goes in a table cell; anything it does not know is shown as typed.
 */
function inline(text) {
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const match of text.matchAll(INLINE)) {
        fragment.append(text.slice(cursor, match.index));
        cursor = match.index + match[0].length;

        const [, , code, strong, emStar, emUnderscore, linkText, linkUrl, bareUrl, escaped] = match;
        if (code !== undefined) {
            fragment.append(element('code', 'lp-code', code.trim()));
        } else if (strong !== undefined) {
            const node = element('strong');
            node.append(inline(strong));
            fragment.append(node);
        } else if (emStar !== undefined || emUnderscore !== undefined) {
            const node = element('em');
            node.append(inline(emStar ?? emUnderscore));
            fragment.append(node);
        } else if (linkText !== undefined) {
            const node = element('span', 'lp-link');
            node.title = linkUrl;
            node.append(inline(linkText));
            fragment.append(node);
        } else if (bareUrl !== undefined) {
            fragment.append(element('span', 'lp-link', bareUrl));
        } else {
            fragment.append(escaped);
        }
    }
    fragment.append(text.slice(cursor));
    return fragment;
}

// ---- Tables ---------------------------------------------------------------------

/** "| a | b \| c |" as ["a", "b \| c"]. A pipe after a backslash is part of the cell. */
function cells(line) {
    const trimmed = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
    return trimmed.split(/(?<!\\)\|/).map((cell) => cell.trim());
}

/** The row under the header, "| :-- | --: |", as one alignment per column. */
function alignments(line) {
    return cells(line).map((cell) => {
        const left = cell.startsWith(':');
        const right = cell.endsWith(':');
        return left && right ? 'center' : right ? 'right' : left ? 'left' : '';
    });
}

export class TableWidget extends WidgetType {
    constructor(source) {
        super();
        this.source = source;
    }

    eq(other) {
        return other.source === this.source;
    }

    toDOM(view) {
        const lines = this.source.split('\n');
        const align = alignments(lines[1] ?? '');
        const wrapper = element('div', 'lp-table-drawn');
        const table = element('table');

        lines.forEach((line, number) => {
            if (number === 1) return; // the |---|---| row is the rule under the header, not a row
            const row = element('tr');
            row.dataset.line = String(number);
            cells(line).forEach((text, column) => {
                const cell = element(number === 0 ? 'th' : 'td');
                if (align[column]) cell.style.textAlign = align[column];
                cell.append(inline(text));
                row.append(cell);
            });
            table.append(row);
        });
        wrapper.append(table);

        // A click goes to that row's line in the source, which is what makes the
        // source appear. Without this a table could only be reached with the arrow keys.
        wrapper.addEventListener('mousedown', (event) => {
            event.preventDefault();
            const first = view.state.doc.lineAt(view.posAtDOM(wrapper));
            const offset = Number(event.target.closest('tr')?.dataset.line ?? 0);
            const line = view.state.doc.line(Math.min(first.number + offset, view.state.doc.lines));
            view.dispatch({ selection: { anchor: line.to } });
            view.focus();
        });

        return wrapper;
    }
}

// ---- Raw HTML -------------------------------------------------------------------

/** Tags that have no business running inside the admin, whatever the post says. */
const UNSAFE = 'script, style, iframe, object, embed, link, meta, base, form';

/**
 * HTML from a post, made safe to show next to the editor.
 *
 * The published site trusts this HTML, because only its authors can write it. The
 * admin is a different place: whoever opens the post here is signed in, so a
 * script smuggled into a post by one account must not run in another's session.
 * Scripts, frames and "on..." handlers are dropped; what is left is only looked at.
 */
function safeHtml(source) {
    const parsed = new DOMParser().parseFromString(source, 'text/html');
    for (const node of parsed.body.querySelectorAll(UNSAFE)) node.remove();
    for (const node of parsed.body.querySelectorAll('*')) {
        for (const attribute of [...node.attributes]) {
            const isHandler = attribute.name.toLowerCase().startsWith('on');
            const isScriptAddress = /^\s*javascript:/i.test(attribute.value);
            if (isHandler || isScriptAddress) node.removeAttribute(attribute.name);
        }
    }
    const fragment = document.createDocumentFragment();
    fragment.append(...parsed.body.childNodes);
    return fragment;
}

export class HtmlWidget extends WidgetType {
    constructor(source) {
        super();
        this.source = source;
    }

    eq(other) {
        return other.source === this.source;
    }

    toDOM(view) {
        const wrapper = element('div', 'block block--html');
        wrapper.contentEditable = 'false';

        const bar = element('div', 'block__bar');
        bar.append(element('span', 'block__name', 'HTML'));
        const source = element('button', 'block__button', 'Source');
        source.type = 'button';
        source.title = 'Show the HTML behind this';
        source.addEventListener('click', () => {
            view.dispatch({ selection: { anchor: view.posAtDOM(wrapper) } });
            view.focus();
        });
        bar.append(source);

        const preview = element('div', 'block__preview block__preview--html');
        preview.append(safeHtml(this.source));
        // It is a picture of the page, not the page: links in it go nowhere from here.
        preview.addEventListener('click', (event) => {
            if (event.target.closest('a')) event.preventDefault();
        });

        wrapper.append(bar, preview);
        return wrapper;
    }
}
