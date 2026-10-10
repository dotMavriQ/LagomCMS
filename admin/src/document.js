/**
 * Everything on the editor page that is not the text editor itself: reading the
 * properties form, saving, publishing, deleting, and keeping the "Saved" label honest.
 *
 * Saving sends the whole document (all fields plus the Markdown) to
 * PUT /api/v1/<collection>/<slug> along with the hash the page was loaded with.
 * If the file changed on disk in the meantime the server answers 409 and we ask
 * what to do, rather than quietly overwriting somebody's work.
 */

import { ApiError, sendJson, setCsrfToken, upload } from './api.js';
import { autogrow } from './app.js';
import { drawCard, editCard } from './cards.js';
import { createEditor } from './editor.js';

const boot = JSON.parse(document.getElementById('lagom-document').textContent);
setCsrfToken(boot.csrf);

const form = document.getElementById('document');
const saveState = document.querySelector('[data-save-state]');
const saveButton = document.querySelector('[data-save]');
const publishButton = document.querySelector('[data-publish]');
const wordCount = document.querySelector('[data-word-count]');

const documentUrl = boot.singleton
    ? `/api/v1/${boot.collection}/${boot.collection}`
    : `/api/v1/${boot.collection}/${boot.slug}`;

/** The hash of the file as we last saw it. Every save is based on this. */
let hash = boot.hash;
/** What the server has. Compared against the form to tell whether anything changed. */
let savedSnapshot = '';
let saving = false;
let autosaveTimer = null;

// ---- Dates ----------------------------------------------------------------------
// Files store dates in UTC ("2026-10-02T09:00:00Z"). The date picker works in your
// local time. So: show local, and convert back to UTC only if you changed it. An
// untouched date is sent back exactly as it was, down to the last character.

const pad = (n) => String(n).padStart(2, '0');

function toLocalInput(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
        + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function toIso(localValue) {
    return new Date(localValue).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

for (const input of form.querySelectorAll('[data-kind="datetime"]')) {
    input.value = input.dataset.iso ? toLocalInput(input.dataset.iso) : '';
    input.dataset.shown = input.value;
}

// ---- Lists (tags, bullet points) ----------------------------------------------------
// One box per entry, and always one empty box at the end to type the next into.

function keepSpareRow(list) {
    const boxes = [...list.querySelectorAll('textarea')];
    const last = boxes[boxes.length - 1];
    if (last.value.trim() !== '') {
        const item = document.createElement('li');
        const box = document.createElement('textarea');
        box.rows = 1;
        box.placeholder = 'Add…';
        item.append(box);
        list.append(item);
        autogrow(box);
    }
    // Emptied boxes in the middle are cleared away, but never the one being typed in.
    for (const box of boxes.slice(0, -1)) {
        if (box.value.trim() === '' && box !== document.activeElement) box.closest('li').remove();
    }
}

for (const list of form.querySelectorAll('[data-kind="list"]')) {
    list.addEventListener('input', () => keepSpareRow(list));
    list.addEventListener('focusout', () => keepSpareRow(list));
    list.addEventListener('keydown', (event) => {
        // Enter moves to the next entry instead of breaking the line.
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            keepSpareRow(list);
            const boxes = [...list.querySelectorAll('textarea')];
            boxes[boxes.indexOf(event.target) + 1]?.focus();
        }
    });
}

// ---- Image fields (logo, background photo) --------------------------------------------
// Upload stores the file with the document and puts its address in the field. The
// field is only really changed once you save; until then the page just shows it.

for (const asset of form.querySelectorAll('[data-kind="asset"]')) {
    const picker = asset.querySelector('input[type="file"]');
    const preview = asset.querySelector('.asset__preview');
    const fallback = asset.querySelector('.asset__default');
    const uploadButton = asset.querySelector('[data-asset-upload]');
    const clearButton = asset.querySelector('[data-asset-clear]');

    const set = (address) => {
        asset.dataset.value = address;
        // With no upload, show the image the site falls back to.
        preview.src = address || asset.dataset.builtin;
        preview.hidden = preview.getAttribute('src') === '';
        fallback.hidden = address !== '';
        clearButton.hidden = address === '';
        changed();
    };

    // The site's own image is fetched from the site. If the site has none for this field
    // (or cannot be reached right now), say so instead of showing a broken picture.
    const showNone = () => {
        if (asset.dataset.value !== '') return;
        preview.hidden = true;
        fallback.textContent = 'none';
    };
    preview.addEventListener('error', showNone);
    preview.addEventListener('load', () => {
        if (asset.dataset.value === '') fallback.textContent = 'the site\'s own';
    });
    // The picture may have failed before this script was even running, in which case the
    // error event has already come and gone. A finished image with no width is a failed one.
    if (preview.getAttribute('src') && preview.complete && preview.naturalWidth === 0) showNone();

    uploadButton.addEventListener('click', () => picker.click());
    clearButton.addEventListener('click', () => set(''));
    picker.addEventListener('change', async () => {
        if (!picker.files[0]) return;
        uploadButton.disabled = true;
        try {
            set((await upload(boot.mediaUrl, picker.files[0])).url);
        } catch (error) {
            show('error', error.message);
        }
        uploadButton.disabled = false;
        picker.value = '';
    });
}

// ---- Lists of records: small tables (link buttons) and cards (contact cards) --------------
// Both are the same thing underneath: rows of named values. A table always keeps a spare empty
// row at the end to type into. Cards get an "Add card" tile instead, can be dragged, and are
// edited in a dialog (see cards.js).

const rowIsEmpty = (row) => [...row.querySelectorAll('input[type="text"], textarea')].every((box) => box.value.trim() === '');

function addRow(set) {
    const template = set.querySelector('template');
    set.insertBefore(template.content.cloneNode(true), template);
    const row = template.previousElementSibling;
    row.querySelectorAll('textarea[data-autogrow]').forEach(autogrow);
    return row;
}

function keepSpareTableRow(set) {
    if (set.dataset.layout === 'cards') return;
    const rows = [...set.querySelectorAll('.rowset__row')];
    if (rows.length === 0 || !rowIsEmpty(rows[rows.length - 1])) addRow(set);
}

for (const set of form.querySelectorAll('[data-kind="rows"]')) {
    keepSpareTableRow(set);
    set.addEventListener('input', () => keepSpareTableRow(set));
    // Only the real cards: the "Add card" tile shares the card look but has nothing to draw.
    set.querySelectorAll('.rowset__row.card').forEach(drawCard);

    set.addEventListener('click', async (event) => {
        if (event.target.closest('[data-row-add]')) {
            // A new card opens straight into its dialog. Backing out of that leaves no empty card behind.
            const card = addRow(set);
            if (!(await editCard(card))) card.remove();
            changed();
            return;
        }

        const row = event.target.closest('.rowset__row');
        if (!row) return;
        const isRow = (node) => node?.matches?.('.rowset__row');

        if (event.target.closest('[data-card-edit]')) {
            if (await editCard(row)) changed();
            return;
        }
        // The buttons inside a card's own dialog are handled by cards.js.
        if (event.target.closest('[data-card-dialog]')) return;

        if (event.target.closest('[data-row-remove]')) {
            row.remove();
        } else if (event.target.closest('[data-row-up]') && isRow(row.previousElementSibling)) {
            row.parentNode.insertBefore(row, row.previousElementSibling);
        } else if (event.target.closest('[data-row-down]') && isRow(row.nextElementSibling)) {
            row.parentNode.insertBefore(row.nextElementSibling, row);
        } else {
            return;
        }
        keepSpareTableRow(set);
        changed();
    });

    // Dragging, for cards. A card only becomes draggable while its grip is held, so that
    // selecting text inside a card with the mouse still works as it should.
    let dragged = null;
    set.addEventListener('pointerdown', (event) => {
        const grip = event.target.closest('.card__grip');
        if (grip) grip.closest('.rowset__row').draggable = true;
    });
    set.addEventListener('dragstart', (event) => {
        dragged = event.target.closest('.rowset__row');
        dragged?.classList.add('card--dragging');
        event.dataTransfer.effectAllowed = 'move';
    });
    set.addEventListener('dragover', (event) => {
        const over = event.target.closest('.rowset__row');
        if (!dragged || !over || over === dragged) return;
        event.preventDefault();
        // Drop before or after the card under the pointer, whichever half the pointer is in.
        const box = over.getBoundingClientRect();
        const sideBySide = box.width < set.getBoundingClientRect().width * 0.75;
        const after = sideBySide ? event.clientX > box.left + box.width / 2 : event.clientY > box.top + box.height / 2;
        set.insertBefore(dragged, after ? over.nextSibling : over);
    });
    set.addEventListener('dragend', () => {
        if (!dragged) return;
        dragged.classList.remove('card--dragging');
        dragged.draggable = false;
        dragged = null;
        changed();
    });
}

// The title is one line. Enter jumps into the text.
form.querySelector('.note__title')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        editor?.focus();
    }
});

// ---- The text editor ------------------------------------------------------------------

const editorHost = form.querySelector('[data-editor]');
const editor = editorHost
    ? createEditor(editorHost, {
        text: editorHost.querySelector('[data-body]').value,
        mediaUrl: boot.mediaUrl,
        onChange: () => changed(),
        onSave: () => save(),
    })
    : null;

// ---- Reading the form ------------------------------------------------------------------

function readFields() {
    const fields = {};
    for (const control of form.querySelectorAll('[data-field]')) {
        const name = control.dataset.field;
        switch (control.dataset.kind) {
            case 'list':
                fields[name] = [...control.querySelectorAll('textarea')].map((box) => box.value.trim()).filter(Boolean);
                break;
            case 'boolean':
                fields[name] = control.checked;
                break;
            case 'asset':
                fields[name] = control.dataset.value;
                break;
            case 'rows':
                // The spare empty row is skipped here, and the server drops any it is sent anyway.
                fields[name] = [...control.querySelectorAll('.rowset__row')].filter((row) => !rowIsEmpty(row)).map((row) => {
                    const record = {};
                    for (const cell of row.querySelectorAll('[data-column]')) {
                        record[cell.dataset.column] = cell.type === 'checkbox' ? cell.checked : cell.value;
                    }
                    return record;
                });
                break;
            case 'datetime':
                if (control.value === '') fields[name] = '';
                else fields[name] = control.value === control.dataset.shown ? control.dataset.iso : toIso(control.value);
                break;
            default:
                fields[name] = control.value;
        }
    }
    return fields;
}

function readDocument() {
    return { fields: readFields(), body: editor ? editor.getText() : '' };
}

const isDirty = () => JSON.stringify(readDocument()) !== savedSnapshot;
const currentStatus = () => form.querySelector('[data-field="status"]')?.value;

// ---- Saving ------------------------------------------------------------------------------

function show(state, message) {
    saveState.dataset.state = state;
    saveState.textContent = message;
}

function drawPublishButton(savedStatus) {
    if (!publishButton) return;
    publishButton.hidden = false;
    publishButton.textContent = savedStatus === 'published' ? 'Unpublish' : 'Publish';
    publishButton.dataset.action = savedStatus === 'published' ? 'unpublish' : 'publish';
}

/** What the server last confirmed as the status. A published post is never autosaved. */
let savedStatus = currentStatus();

function changed() {
    if (wordCount && editor) {
        const words = editor.getText().split(/\s+/).filter(Boolean).length;
        wordCount.textContent = `${words} words · ${Math.max(1, Math.round(words / 220))} min read`;
    }
    if (!isDirty()) {
        show('saved', 'Saved');
        return;
    }
    show('dirty', 'Unsaved changes');

    // Drafts save themselves a moment after you stop typing. Nothing else does.
    // A published post, and any page without a draft state at all (Home, About,
    // Contact, Settings), is live: every save there goes straight to the site, so
    // that stays a deliberate Ctrl+S.
    clearTimeout(autosaveTimer);
    if (savedStatus === 'draft' && currentStatus() === 'draft') {
        autosaveTimer = setTimeout(() => save({ quiet: true }), 2000);
    }
}

async function save({ quiet = false, baseHash = hash } = {}) {
    if (saving) return;
    clearTimeout(autosaveTimer);

    // A save you asked for puts the footnotes in order first. The quiet autosave of
    // a draft does not: it runs while you type, and text should not move under your hands.
    if (!quiet) editor?.tidy();

    const sent = readDocument();
    saving = true;
    show('saving', 'Saving…');

    try {
        const saved = await sendJson('PUT', documentUrl, { base_hash: baseHash, ...sent });
        hash = saved.hash;
        savedStatus = saved.status;
        savedSnapshot = JSON.stringify(sent);
        drawPublishButton(savedStatus);
        // The sidebar's "Publishing…" line listens for this (see app.js).
        document.dispatchEvent(new CustomEvent('lagom:saved'));
        // You may well have typed more while the request was in the air.
        saving = false;
        changed();
    } catch (error) {
        saving = false;
        if (error instanceof ApiError && error.status === 409) {
            resolveConflict(error.data.current_hash);
        } else if (error instanceof ApiError && error.status === 401) {
            show('error', 'Signed out. Sign in again in another tab, then save.');
        } else {
            show('error', error.message);
            if (!quiet && error.data?.fields) {
                const first = Object.keys(error.data.fields)[0];
                form.querySelector(`[data-field="${first}"]`)?.focus();
            }
        }
    }
}

/**
 * The file changed on disk after this page loaded it. Could be another tab, could
 * be an edit in Obsidian. There is no merge here; you pick a side.
 */
function resolveConflict(currentHash) {
    show('error', 'Changed elsewhere');
    const keepMine = confirm(
        'This document was changed somewhere else after you opened it.\n\n'
        + 'OK: keep what is on this page and overwrite the other change.\n'
        + 'Cancel: leave it, so you can copy your text out and reload.',
    );
    if (keepMine && currentHash) {
        save({ baseHash: currentHash });
    }
}

saveButton.addEventListener('click', () => save());

publishButton?.addEventListener('click', () => {
    const status = form.querySelector('[data-field="status"]');
    if (publishButton.dataset.action === 'publish') {
        status.value = 'published';
        // First time out: stamp it with now, unless a date was already chosen.
        const date = form.querySelector('[data-field="published_at"]');
        if (date && date.value === '') {
            date.value = toLocalInput(new Date().toISOString());
        }
    } else {
        status.value = 'draft';
    }
    save();
});

document.querySelector('[data-delete]')?.addEventListener('click', async () => {
    if (!confirm('Move this document to the trash?\n\nIt is kept in var/trash/ on the server, so it can be brought back by hand.')) return;
    try {
        await sendJson('DELETE', documentUrl, {});
        savedSnapshot = JSON.stringify(readDocument());
        location.href = `/admin/${boot.collection}`;
    } catch (error) {
        show('error', error.message);
    }
});

// Typing inside a card's dialog is not a change yet: it only counts once Done is pressed
// (Cancel throws it away), and the card code reports that itself.
const insideCardDialog = (event) => event.target.closest?.('[data-card-dialog]') !== null;
form.addEventListener('input', (event) => { if (!insideCardDialog(event)) changed(); });
form.addEventListener('change', (event) => { if (!insideCardDialog(event)) changed(); });

document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        save();
    }
});

// Closing the tab with unsaved work gets the browser's "are you sure?".
window.addEventListener('beforeunload', (event) => {
    if (isDirty()) event.preventDefault();
});

savedSnapshot = JSON.stringify(readDocument());
drawPublishButton(savedStatus);
changed();
