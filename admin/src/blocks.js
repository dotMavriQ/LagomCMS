/**
 * Custom blocks: the things plain Markdown has no syntax for.
 *
 * In the file, a block is a fenced code block whose language is "lagom:<type>"
 * and whose body is JSON:
 *
 *     ```lagom:figure
 *     {
 *       "src": "/media/posts/hello/harbour.jpg",
 *       "alt": "Fishing boats in the harbour",
 *       "caption": "Sagres, early morning"
 *     }
 *     ```
 *
 * In the editor you never have to look at that. The block is drawn as what it is
 * (the picture, the gallery, the embed), with an Edit button that opens a small
 * form. This file holds the list of block types, the drawing, and the form.
 *
 * Adding a block type means: an entry in BLOCKS here, a preview() for it, and a
 * renderer for it on the website (site/src/lib/blocks.ts).
 *
 * Callouts are NOT in here. They are ordinary Markdown ("> [!note] Title"), the
 * same syntax Obsidian uses, so they need no JSON and no form.
 */

import { syntaxTree } from '@codemirror/language';
import { WidgetType } from '@codemirror/view';

import { getJson, upload } from './api.js';

export const BLOCKS = {
    figure: {
        label: 'Figure',
        hint: 'One image, with a caption',
        fields: [
            { name: 'src', label: 'Image', kind: 'image' },
            { name: 'alt', label: 'Alt text', hint: 'What a reader who cannot see the image should know.' },
            { name: 'caption', label: 'Caption' },
            { name: 'link', label: 'Link', hint: 'Optional. Where a click on the image goes.' },
            { name: 'size', label: 'Size', kind: 'choice', options: ['normal', 'wide', 'small'] },
        ],
        blank: { src: '', alt: '', caption: '' },
    },
    gallery: {
        label: 'Gallery',
        hint: 'Several images in a grid',
        fields: [
            { name: 'images', label: 'Images', kind: 'images' },
            { name: 'caption', label: 'Caption' },
        ],
        blank: { images: [] },
    },
    embed: {
        label: 'Embed',
        hint: 'A video or a page from elsewhere',
        fields: [
            { name: 'url', label: 'Address', hint: 'YouTube and Vimeo become players. Anything else becomes a link card.' },
            { name: 'caption', label: 'Caption' },
        ],
        blank: { url: '' },
    },
};

/** Where uploads for the open document go. Set once by the editor. */
let mediaUrl = '';
export function setMediaUrl(url) {
    mediaUrl = url;
}

/** The Markdown for a block. Empty values are left out to keep the file tidy. */
export function fenceText(type, data) {
    const tidy = {};
    for (const [key, value] of Object.entries(data)) {
        if (value !== '' && value !== null && value !== undefined && value !== 'normal') tidy[key] = value;
    }
    return '```lagom:' + type + '\n' + JSON.stringify(tidy, null, 2) + '\n```';
}

/** Take a fenced block apart. Null when it is an ordinary code block. */
export function parseFence(text) {
    const match = /^(`{3,}|~{3,})lagom:(\S+)[^\n]*\n([\s\S]*?)\n?\1\s*$/.exec(text);
    return match ? { type: match[2], json: match[3] } : null;
}

const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
};

/** Draw a block's contents the way the site roughly will. */
function preview(type, data) {
    const box = element('div', `block__preview block__preview--${type}`);

    if (type === 'figure') {
        const figure = element('figure');
        if (data.src) {
            const image = element('img');
            image.src = data.src;
            image.alt = data.alt ?? '';
            figure.append(image);
        } else {
            figure.append(element('p', 'block__empty', 'No image chosen yet.'));
        }
        if (data.caption) figure.append(element('figcaption', '', data.caption));
        box.append(figure);
        if (data.src && !data.alt) box.append(element('p', 'block__warning', 'Missing alt text.'));
    } else if (type === 'gallery') {
        const grid = element('div', 'block__grid');
        for (const item of data.images ?? []) {
            const image = element('img');
            image.src = item.src;
            image.alt = item.alt ?? '';
            grid.append(image);
        }
        if (!(data.images ?? []).length) grid.append(element('p', 'block__empty', 'No images yet.'));
        box.append(grid);
        if (data.caption) box.append(element('p', 'block__caption', data.caption));
    } else if (type === 'embed') {
        box.append(element('p', 'block__url', data.url || 'No address yet.'));
        if (data.caption) box.append(element('p', 'block__caption', data.caption));
    } else {
        box.append(element('pre', '', JSON.stringify(data, null, 2)));
    }

    return box;
}

/** Find the fenced block that a widget's DOM node stands for. */
function fenceAt(view, dom) {
    const position = view.posAtDOM(dom);
    let node = syntaxTree(view.state).resolveInner(position, 1);
    while (node && node.name !== 'FencedCode') node = node.parent;
    return node ? { from: node.from, to: node.to } : null;
}

/** What the editor shows in place of a ```lagom:<type> fence. */
export class BlockWidget extends WidgetType {
    constructor(type, json) {
        super();
        this.type = type;
        this.json = json;
    }

    eq(other) {
        return other.type === this.type && other.json === this.json;
    }

    toDOM(view) {
        const definition = BLOCKS[this.type];
        const wrapper = element('div', 'block');
        wrapper.contentEditable = 'false';

        let data = null;
        try {
            data = JSON.parse(this.json);
        } catch {
            /* handled just below */
        }

        const bar = element('div', 'block__bar');
        bar.append(element('span', 'block__name', definition?.label ?? this.type));

        if (data === null || typeof data !== 'object') {
            wrapper.classList.add('block--broken');
            wrapper.append(bar, element('p', 'block__warning', 'This block’s JSON is broken. Open the source to fix it.'));
        } else {
            wrapper.append(bar, preview(this.type, data));
            if (definition) {
                const edit = element('button', 'block__button', 'Edit');
                edit.type = 'button';
                edit.addEventListener('click', async () => {
                    const changed = await editBlock(this.type, data);
                    const range = fenceAt(view, wrapper);
                    if (changed && range) {
                        view.dispatch({ changes: { ...range, insert: fenceText(this.type, changed) } });
                    }
                });
                bar.append(edit);
            }
        }

        // The escape hatch: put the cursor inside, which makes the raw JSON appear.
        const source = element('button', 'block__button', 'Source');
        source.type = 'button';
        source.title = 'Show the Markdown behind this block';
        source.addEventListener('click', () => {
            const range = fenceAt(view, wrapper);
            if (range) {
                view.dispatch({ selection: { anchor: view.state.doc.lineAt(range.from).to + 1 } });
                view.focus();
            }
        });
        bar.append(source);

        return wrapper;
    }
}

// ---- The form -----------------------------------------------------------------------------

/** A text box, or a dropdown, for one simple value. */
function simpleControl(field, value, onChange) {
    if (field.kind === 'choice') {
        const select = element('select');
        for (const option of field.options) {
            const item = element('option', '', option);
            item.selected = option === (value ?? field.options[0]);
            select.append(item);
        }
        select.addEventListener('change', () => onChange(select.value));
        return select;
    }
    const input = element('input');
    input.type = 'text';
    input.value = value ?? '';
    input.addEventListener('input', () => onChange(input.value));
    return input;
}

/** An "Upload" button that hands every chosen file's stored details to `onUploaded`. */
function uploadButton(label, multiple, onUploaded) {
    const picker = element('input');
    picker.type = 'file';
    picker.accept = 'image/*';
    picker.multiple = multiple;
    picker.hidden = true;

    const button = element('button', 'button', label);
    button.type = 'button';
    button.addEventListener('click', () => picker.click());

    picker.addEventListener('change', async () => {
        button.disabled = true;
        button.textContent = 'Uploading…';
        try {
            for (const file of picker.files) onUploaded(await upload(mediaUrl, file));
        } catch (error) {
            alert(error.message);
        }
        button.disabled = false;
        button.textContent = label;
        picker.value = '';
    });

    const holder = element('span');
    holder.append(button, picker);
    return holder;
}

/** Thumbnails of what this document already has uploaded. Click one to use it. */
function libraryStrip(onPick) {
    const strip = element('div', 'dialog__library');
    getJson(mediaUrl).then((files) => {
        for (const file of files.filter((f) => f.width !== null)) {
            const thumb = element('img');
            thumb.src = file.url;
            thumb.alt = file.name;
            thumb.title = `Use ${file.name}`;
            thumb.addEventListener('click', () => onPick(file));
            strip.append(thumb);
        }
    }).catch(() => { /* no library is not worth an error message */ });
    return strip;
}

/**
 * Open the form for a block. Resolves to the edited data, or null if cancelled.
 */
export function editBlock(type, original) {
    const definition = BLOCKS[type];
    const data = structuredClone({ ...definition.blank, ...original });

    const dialog = element('dialog', 'dialog');
    const form = element('form', 'dialog__form');
    form.method = 'dialog';
    form.append(element('h2', 'dialog__title', definition.label));

    for (const field of definition.fields) {
        const row = element('div', 'dialog__row');
        row.append(element('label', 'dialog__label', field.label));

        if (field.kind === 'image') {
            const shown = element('img', 'dialog__image');
            const draw = () => { shown.hidden = !data.src; shown.src = data.src || ''; };
            const use = (file) => {
                data.src = file.url;
                if (file.width) { data.width = file.width; data.height = file.height; }
                draw();
            };
            draw();
            row.append(shown, uploadButton(data.src ? 'Replace' : 'Upload', false, use), libraryStrip(use));
        } else if (field.kind === 'images') {
            const list = element('div', 'dialog__images');
            const draw = () => {
                list.replaceChildren(...data.images.map((item, i) => {
                    const entry = element('div', 'dialog__imagerow');
                    const thumb = element('img');
                    thumb.src = item.src;
                    const alt = element('input');
                    alt.type = 'text';
                    alt.placeholder = 'Alt text';
                    alt.value = item.alt ?? '';
                    alt.addEventListener('input', () => { item.alt = alt.value; });
                    const remove = element('button', 'block__button', 'Remove');
                    remove.type = 'button';
                    remove.addEventListener('click', () => { data.images.splice(i, 1); draw(); });
                    entry.append(thumb, alt, remove);
                    return entry;
                }));
            };
            const add = (file) => {
                data.images.push({ src: file.url, alt: '', width: file.width, height: file.height });
                draw();
            };
            draw();
            row.append(list, uploadButton('Add images', true, add), libraryStrip(add));
        } else {
            row.append(simpleControl(field, data[field.name], (value) => { data[field.name] = value; }));
        }

        if (field.hint) row.append(element('small', 'dialog__hint', field.hint));
        form.append(row);
    }

    const actions = element('div', 'dialog__actions');
    const cancel = element('button', 'button', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => dialog.close('cancel'));
    const done = element('button', 'button button--primary', 'Done');
    done.value = 'done';
    actions.append(cancel, done);
    form.append(actions);

    dialog.append(form);
    document.body.append(dialog);
    dialog.showModal();

    return new Promise((resolve) => {
        dialog.addEventListener('close', () => {
            dialog.remove();
            resolve(dialog.returnValue === 'done' ? data : null);
        });
    });
}
