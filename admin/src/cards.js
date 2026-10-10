/**
 * Cards: records shown as a preview with an Edit button (the Contact page's cards).
 *
 * A card's values live in ordinary form controls inside the card, the same as a table row's,
 * so saving reads them the same way. The difference is only in how you get at them: the
 * controls sit in a <dialog> that Edit opens, and the card itself shows a preview of the
 * result. Cancel puts every control back the way it was when the dialog opened.
 */

const control = (card, column) => card.querySelector(`[data-column="${column}"]`);
const valueOf = (card, column) => control(card, column)?.value.trim() ?? '';

/**
 * What somebody typed for a Cal.com booking, boiled down to the part Cal.com calls the link:
 * "yourname" or "yourname/intro-call". A pasted address works too, so
 * "https://cal.com/yourname/intro-call?month=2026-11" gives "yourname/intro-call".
 * Null when it cannot be one.
 */
export function calLink(typed) {
    const link = typed
        .trim()
        .replace(/^(https?:\/\/)?(www\.|app\.)?cal\.com\//i, '')
        .split(/[?#]/)[0]
        .replace(/^\/+|\/+$/g, '');
    return /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)?$/.test(link) ? link : null;
}

const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
};

/** Redraw a card's preview from its controls. */
export function drawCard(card) {
    const view = card.querySelector('[data-card-view]');
    const title = valueOf(card, 'title');
    const text = valueOf(card, 'text');
    const button = valueOf(card, 'button');
    const isBooking = valueOf(card, 'action') === 'booking';

    const parts = [];
    if (title) parts.push(element('h3', 'card__title', title));
    if (text) parts.push(element('p', 'card__text', text));
    if (button) {
        const pill = element('span', 'card__button', button);
        if (control(card, 'primary')?.checked) pill.classList.add('card__button--primary');
        parts.push(pill);

        // Under the button: what pressing it does, in words.
        const link = calLink(valueOf(card, 'url'));
        parts.push(element('p', 'card__does', isBooking
            ? `opens the Cal.com booking window for ${link ?? '…'}`
            : `goes to ${valueOf(card, 'url') || '…'}`));
    }
    if (parts.length === 0) parts.push(element('p', 'card__empty', 'Empty card. Press Edit to fill it in.'));

    view.replaceChildren(...parts);
}

/**
 * The address box means two different things depending on what the button does. This keeps
 * its label, placeholder and hint telling the truth about which.
 */
function describeAddress(card) {
    const row = card.querySelector('[data-for="url"]');
    if (!row) return;
    const isBooking = valueOf(card, 'action') === 'booking';
    const hint = row.querySelector('.dialog__hint');

    row.querySelector('.dialog__label').textContent = isBooking ? 'Cal.com link' : 'Address';
    control(card, 'url').placeholder = isBooking ? 'yourname or yourname/intro-call' : '/cv or https://…';

    if (!isBooking) {
        hint.textContent = 'A page on this site (/cv) or a full address (https://…).';
        return;
    }

    const link = calLink(valueOf(card, 'url'));
    if (link === null) {
        hint.textContent = 'Your Cal.com name, optionally followed by an event: the part after cal.com/ in its address.';
        return;
    }
    // A way to check the link is real before saving: it opens the same page the window will show.
    const check = element('a', '', 'Check it on cal.com');
    check.href = `https://cal.com/${link}`;
    check.target = '_blank';
    check.rel = 'noopener';
    hint.replaceChildren(`The booking window opens on the page for cal.com/${link}. Without JavaScript the button is a plain link there. `, check);
}

/**
 * Open a card's dialog. Resolves to true when it was confirmed with Done, false when it was
 * cancelled (Cancel, Escape), in which case every control is back to what it was.
 */
export function editCard(card) {
    const dialog = card.querySelector('[data-card-dialog]');
    const error = card.querySelector('[data-card-error]');
    const controls = [...dialog.querySelectorAll('[data-column]')];
    const before = controls.map((c) => (c.type === 'checkbox' ? c.checked : c.value));

    error.hidden = true;
    describeAddress(card);
    dialog.showModal();
    control(card, 'title')?.focus();

    return new Promise((resolve) => {
        const onInput = () => describeAddress(card);

        const finish = (confirmed) => {
            dialog.removeEventListener('input', onInput);
            dialog.removeEventListener('change', onInput);
            dialog.removeEventListener('click', onClick);
            dialog.removeEventListener('cancel', onEscape);
            if (!confirmed) {
                controls.forEach((c, i) => { if (c.type === 'checkbox') c.checked = before[i]; else c.value = before[i]; });
            }
            dialog.close();
            drawCard(card);
            resolve(confirmed);
        };

        const done = () => {
            const hasButton = valueOf(card, 'button') !== '';
            if (valueOf(card, 'action') === 'booking') {
                const link = calLink(valueOf(card, 'url'));
                if (link === null) {
                    error.textContent = 'That is not a Cal.com link. It should look like "yourname" or "yourname/intro-call".';
                    error.hidden = false;
                    control(card, 'url').focus();
                    return;
                }
                // Stored as the full address, so the file reads sensibly and the link works anywhere.
                control(card, 'url').value = `https://cal.com/${link}`;
            } else if (hasButton && valueOf(card, 'url') === '') {
                error.textContent = 'The button needs an address to go to. Or clear its label to have no button.';
                error.hidden = false;
                control(card, 'url').focus();
                return;
            }
            finish(true);
        };

        const onClick = (event) => {
            if (event.target.closest('[data-card-done]')) done();
            else if (event.target.closest('[data-card-cancel]')) finish(false);
        };
        const onEscape = (event) => { event.preventDefault(); finish(false); };

        dialog.addEventListener('input', onInput);
        dialog.addEventListener('change', onInput);
        dialog.addEventListener('click', onClick);
        dialog.addEventListener('cancel', onEscape);
    });
}
