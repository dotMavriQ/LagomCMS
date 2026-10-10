/**
 * Checks for the editor's footnote logic (admin/src/footnotes-core.js).
 *
 *     node tests/footnotes.mjs
 *
 * Two kinds of check: small made-up texts with a known right answer, and every
 * real post in content/, where tidying must either change nothing or leave the
 * notes numbered exactly as they were.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { applyEdits, scan, tidy } from '../admin/src/footnotes-core.js';

let failed = 0;
const check = (name, actual, expected) => {
    if (JSON.stringify(actual) === JSON.stringify(expected)) return;
    failed++;
    console.log(`FAILED: ${name}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
};
const tidied = (text) => applyEdits(text, tidy(text));

// A note used lower down is numbered later, whatever its label says.
check('numbers follow the text', [...scan('B[^2] then A[^1].\n\n[^1]: one\n[^2]: two\n').numbers], [['2', 1], ['1', 2]]);

// ...and tidying makes the source agree: labels renumbered, definitions reordered.
check('renumber and reorder', tidied('B[^2] then A[^1].\n\n[^1]: one\n[^2]: two\n'), 'B[^1] then A[^2].\n\n[^1]: two\n[^2]: one\n');

// Already tidy: not a character changes.
check('tidy text is left alone', tidy('A[^1] and B[^2].\n\n[^1]: one\n\n[^2]: two\n'), []);

// Named labels are the author's and stay; only their definitions are put in order.
check('named labels are kept', tidied('B[^beta] A[^alpha]\n\n[^alpha]: a\n[^beta]: b\n'), 'B[^beta] A[^alpha]\n\n[^beta]: b\n[^alpha]: a\n');

// A definition in the middle of the text moves to the end.
check('definitions gather at the end', tidied('One.[^1]\n\n[^1]: note\n\nTwo.\n'), 'One.[^1]\n\nTwo.\n\n[^1]: note\n');

// Used twice: one number, taken from the first use.
check('a note used twice', [...scan('A[^x] B[^y] C[^x]\n\n[^x]: x\n[^y]: y').numbers], [['x', 1], ['y', 2]]);

// Code is not footnotes.
check('code is skipped', scan('Type `[^1]` like so:\n\n```\n[^1]: not a note\n```\n').references.length + scan('```\n[^1]: no\n```').definitions.length, 0);

// A note with a second paragraph (indented) is one note and moves as one.
check('multi-line notes stay whole', tidied('B[^2] A[^1]\n\n[^1]: one\n\n    more\n\n[^2]: two\n'), 'B[^1] A[^2]\n\n[^1]: two\n\n[^2]: one\n\n    more\n');

// A definition nothing refers to is kept, after the ones in use.
check('unused notes go last', tidied('A[^2]\n\n[^1]: orphan\n[^2]: used\n'), 'A[^1]\n\n[^1]: used\n[^2]: orphan\n');

// A reference with no definition is left as typed.
check('undefined references are left alone', tidy('A[^nope] B[^1]\n\n[^1]: one\n'), []);

// Tidying twice is the same as tidying once.
const messy = 'C[^3] A[^1] B[^2]\n\n[^1]: one\n\nText between.\n\n[^2]: two\n[^3]: three\n';
check('tidy settles in one go', tidy(tidied(messy)), []);

// Real posts: the numbers a reader sees must survive a tidy untouched.
const posts = new URL('../content/posts/', import.meta.url);
let checkedPosts = 0;
for (const slug of existsSync(posts) ? readdirSync(posts) : []) {
    const file = new URL(`${slug}/index.md`, posts);
    if (!existsSync(file)) continue;
    const body = readFileSync(file, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
    const notesInOrder = (text) => {
        const found = scan(text);
        return [...found.numbers.keys()].map((label) => {
            const definition = found.definitions.find((d) => d.label === label);
            return text.slice(definition.bodyFrom, definition.to);
        });
    };
    check(`${slug}: same notes in the same order after a tidy`, notesInOrder(tidied(body)), notesInOrder(body));
    check(`${slug}: tidy settles`, tidy(tidied(body)), []);
    if (tidy(body).length > 0) console.log(`note: ${slug} would be tidied (${tidy(body).length} edits)`);
    checkedPosts++;
}

console.log(failed === 0 ? `all passed (${checkedPosts} posts checked)` : `${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
