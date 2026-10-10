<?php

declare(strict_types=1);

/**
 * The two functions templates use on nearly every line. They are global on
 * purpose: `<?= e($title) ?>` is the whole point.
 */

/** Escape a value for HTML. Everything printed into a template goes through this. */
function e(mixed $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/**
 * An inline SVG icon. Drawn with the text colour, sized to the text.
 * The shapes are from Lucide (ISC licence), trimmed to what the admin uses.
 */
function icon(string $name): string
{
    $paths = [
        'search' => '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
        'plus' => '<path d="M12 5v14M5 12h14"/>',
        'chevron' => '<path d="m9 6 6 6-6 6"/>',
        'external' => '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
        'trash' => '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
        'sun' => '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
        'logout' => '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
        'sidebar' => '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
        'list' => '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    ];

    return '<svg class="icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"'
        . ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        . ($paths[$name] ?? '') . '</svg>';
}
