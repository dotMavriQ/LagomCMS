/**
 * The admin's JavaScript, entry point.
 *
 * Most of the admin is plain server-rendered HTML and needs none of this. What
 * lives here are the small conveniences every page shares: the theme switch, the
 * collapsible sidebar, the quick switcher, text boxes that grow as you type.
 *
 * The editor itself is a much bigger piece and is only loaded on pages that have
 * a document to edit.
 */

const root = document.documentElement;

/** localStorage throws in some private modes. Nothing here is worth crashing over. */
function remember(key, value) {
    try {
        if (value === undefined) return localStorage.getItem(key);
        localStorage.setItem(key, value);
    } catch {
        /* not remembered, and that is fine */
    }
    return null;
}

// ---- Light and dark ---------------------------------------------------------

document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => {
    const isDark = root.dataset.theme
        ? root.dataset.theme === 'dark'
        : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = isDark ? 'light' : 'dark';
    remember('blog-theme', root.dataset.theme);
});

// ---- Sidebar ----------------------------------------------------------------

const app = document.querySelector('[data-app]');
// On a phone the sidebar is a drawer over the page, so it starts out of the way.
const isNarrow = matchMedia('(width < 48rem)').matches;
if (app && (isNarrow || remember('lagom-sidebar') === 'closed')) {
    app.classList.add('app--focus');
}
document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-toggle-sidebar]')) return;
    const closed = app.classList.toggle('app--focus');
    remember('lagom-sidebar', closed ? 'closed' : 'open');
});

// ---- "Site is up to date": the website's publishing status ------------------------

// Saving something visitors can see rebuilds the website in the background, which
// takes a few seconds. This keeps the line at the bottom of the sidebar honest
// about it: it asks the server how the build is going, once a second while one is
// running and not at all otherwise.
const publish = document.querySelector('[data-site-status]');
if (publish) {
    const text = publish.querySelector('[data-site-status-text]');
    const again = publish.querySelector('[data-site-status-again]');
    let timer = null;

    const ago = (seconds) => {
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
        return `${Math.floor(seconds / 86400)} d ago`;
    };

    const draw = (status) => {
        publish.dataset.state = status.state;
        publish.title = '';
        if (status.state === 'building') text.textContent = 'Publishing…';
        if (status.state === 'never') text.textContent = 'Site not published yet';
        if (status.state === 'published') {
            text.textContent = 'Site is up to date';
            publish.title = `Published ${ago(Date.now() / 1000 - status.finished)}, in ${status.seconds} s`;
        }
        if (status.state === 'failed') {
            text.textContent = 'Publishing failed';
            // The live site is untouched by a failed build; the reason is in the tooltip.
            publish.title = `${status.message ?? ''} The site still shows the last version that worked.`.trim();
        }
        again.hidden = status.state === 'building' || status.state === 'published';
        again.querySelector('button').textContent = status.state === 'never' ? 'publish' : 'try again';
    };

    const check = async () => {
        clearTimeout(timer);
        try {
            const status = await (await fetch('/admin/publish', { headers: { accept: 'application/json' } })).json();
            draw(status);
            if (status.state === 'building') timer = setTimeout(check, 1000);
        } catch {
            /* signed out, or the server is restarting: the line just stops updating */
        }
    };

    draw({
        state: publish.dataset.state,
        finished: Number(publish.dataset.finished),
        message: publish.dataset.message,
        seconds: publish.dataset.seconds,
    });
    if (publish.dataset.state === 'building') check();
    // A save may or may not have started a build (drafts do not); the server knows.
    document.addEventListener('lagom:saved', check);
}

// ---- The filter box above a list of documents ---------------------------------

const filter = document.querySelector('[data-filter]');
if (filter) {
    const rows = [...document.querySelectorAll('[data-filter-table] tbody tr')];
    const none = document.querySelector('[data-filter-none]');

    filter.addEventListener('input', () => {
        // Every word typed has to appear somewhere in the row.
        const words = filter.value.toLowerCase().split(/\s+/).filter(Boolean);
        let shown = 0;
        for (const row of rows) {
            const text = row.textContent.toLowerCase();
            row.hidden = !words.every((word) => text.includes(word));
            if (!row.hidden) shown++;
        }
        none.hidden = shown > 0;
    });

    // Enter opens the first match, so "type three letters, Enter" gets you to a post.
    filter.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            rows.find((row) => !row.hidden)?.querySelector('a')?.click();
        }
    });
}

// ---- Panels that remember whether you left them open --------------------------

for (const panel of document.querySelectorAll('details[data-remember]')) {
    const key = 'lagom-panel-' + panel.dataset.remember;
    const saved = remember(key);
    if (saved !== null) panel.open = saved === 'open';
    panel.addEventListener('toggle', () => remember(key, panel.open ? 'open' : 'closed'));
}

// ---- The share image: nothing to show until the site has been published with this post in it ----

for (const figure of document.querySelectorAll('[data-share-image]')) {
    const image = figure.querySelector('img');
    const hide = () => { figure.hidden = true; };
    image.addEventListener('error', hide);
    if (image.complete && image.naturalWidth === 0) hide();
}

// ---- "3 more": properties that are hidden while empty ----------------------------

for (const button of document.querySelectorAll('[data-show-quiet]')) {
    const panel = button.closest('.props');
    const count = panel.querySelectorAll('.prop--quiet').length;
    if (count > 0) {
        button.hidden = false;
        button.textContent = `+ ${count} more`;
        button.addEventListener('click', () => {
            panel.classList.add('props--all');
            button.remove();
            panel.querySelectorAll('textarea[data-autogrow]').forEach((t) => t.dispatchEvent(new Event('input')));
        });
    }
}

// ---- Text boxes that grow with their text -------------------------------------

export function autogrow(textarea) {
    const fit = () => {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    };
    textarea.addEventListener('input', fit);
    fit();
}
document.querySelectorAll('textarea[data-autogrow]').forEach(autogrow);

// A folded panel has no height to measure, so fit its boxes when it opens.
document.addEventListener('toggle', (event) => {
    if (event.target.matches?.('details')) {
        event.target.querySelectorAll('textarea[data-autogrow]').forEach((t) => t.dispatchEvent(new Event('input')));
    }
}, true);

// ---- "New document": suggest an address from the title --------------------------

const slugSource = document.querySelector('[data-slug-source]');
const slugTarget = document.querySelector('[data-slug-target]');
if (slugSource && slugTarget) {
    slugSource.addEventListener('input', () => {
        slugTarget.placeholder = slugSource.value
            .normalize('NFKD').replace(/[̀-ͯ]/g, '')
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
            .slice(0, 80) || 'made from the title';
    });
    // Enter in the title creates the document rather than adding a line break.
    slugSource.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            slugSource.form.requestSubmit();
        }
    });
}

// ---- Quick switcher (Ctrl+O, as in Obsidian) ----------------------------------------------------

const switcher = document.getElementById('quick-open');
if (switcher) {
    const outline = JSON.parse(document.getElementById('lagom-outline').textContent);
    const input = switcher.querySelector('[data-switcher-input]');
    const results = switcher.querySelector('[data-switcher-results]');
    let matches = [];
    let chosen = 0;

    const draw = () => {
        // Every word typed has to appear somewhere in the title or its collection.
        const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
        matches = outline
            .filter((doc) => words.every((word) => (doc.title + ' ' + doc.where).toLowerCase().includes(word)))
            .slice(0, 12);
        chosen = Math.min(chosen, Math.max(0, matches.length - 1));

        results.replaceChildren(...matches.map((doc, i) => {
            const item = document.createElement('li');
            const link = document.createElement('a');
            link.href = doc.url;
            link.textContent = doc.title;
            const where = document.createElement('small');
            where.textContent = doc.status && doc.status !== 'published' ? `${doc.where} · ${doc.status}` : doc.where;
            link.append(where);
            if (i === chosen) link.setAttribute('aria-selected', 'true');
            item.append(link);
            return item;
        }));
    };

    const open = () => {
        input.value = '';
        chosen = 0;
        draw();
        switcher.showModal();
    };

    input.addEventListener('input', () => { chosen = 0; draw(); });
    input.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            chosen = (chosen + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % Math.max(1, matches.length);
            draw();
        } else if (event.key === 'Enter' && matches[chosen]) {
            location.href = matches[chosen].url;
        }
    });
    // A click on the dimmed area around the box closes it.
    switcher.addEventListener('click', (event) => {
        if (event.target === switcher) switcher.close();
    });

    document.querySelector('[data-quick-open]')?.addEventListener('click', open);
    document.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o' && !event.shiftKey) {
            event.preventDefault();
            open();
        }
    });
}

// ---- The editor -------------------------------------------------------------------

if (document.getElementById('lagom-document')) {
    import('./document.js');
}
