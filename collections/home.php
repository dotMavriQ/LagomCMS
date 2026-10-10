<?php

return [
    'name' => 'home',
    'label' => 'Home',
    'group' => 'Site',
    'order' => 10,
    'singleton' => true,
    // Configuration or a fragment of a page, not a page of its own.
    'seo' => false,

    // Exactly what the home page draws, and nothing it does not: a name, the
    // slogan under it, the link buttons, the large logo beside them, and the
    // photograph behind it all.
    'fields' => [
        ['name' => 'title', 'type' => 'text', 'label' => 'Name', 'required' => true, 'help' => 'The large heading, with the blinking cursor after it.'],
        ['name' => 'tagline', 'type' => 'text', 'label' => 'Slogan', 'multiple' => true, 'help' => 'One entry per line, as they should break on the page.'],
        // How the page presents itself in a browser tab, in search results and when shared.
        ['name' => 'tab_title', 'type' => 'text', 'label' => 'Browser tab title', 'help' => 'The text in the browser tab, and the headline in search results. About 60 characters are shown.'],
        ['name' => 'description', 'type' => 'text', 'label' => 'Search description', 'help' => 'The line under the headline in search results and link previews. Phones show about 120 characters, desktops about 155.'],
        // A 'rows' field is a small table: one row per entry, with the columns named here.
        ['name' => 'links', 'type' => 'rows', 'label' => 'Link buttons', 'help' => 'The row of buttons under the slogan, in this order. Buttons with the GitHub or fediverse icon are marked as your own profile, which is what lets those two verify you. For the email button, type the address itself: the site hides it from scrapers and reveals it on click.', 'columns' => [
            ['name' => 'label', 'label' => 'Label'],
            ['name' => 'url', 'label' => 'Address'],
            ['name' => 'icon', 'label' => 'Icon', 'options' => ['', 'github', 'linkedin', 'email', 'fediverse', 'matrix']],
        ]],
        ['name' => 'mark', 'type' => 'asset', 'label' => 'Large logo', 'builtin' => '/logo-mask.webp', 'accept' => ['image/png', 'image/webp'], 'help' => 'The big mark to the right of the slogan, on wide screens. It is separate from the header logo, which is under Settings. Used as a stencil: only its shape matters and the page\'s accent colour fills it, so it has to be a PNG or WebP with a transparent background.'],
        ['name' => 'backdrop', 'type' => 'asset', 'label' => 'Background photo', 'builtin' => '/defaults/home-backdrop', 'accept' => ['image/jpeg', 'image/png', 'image/webp', 'image/avif'], 'help' => 'With none, the page has no photo behind it. Any photo is shown in black and white and coloured by the theme. Large and landscape works best: 2880 pixels wide or more.'],
    ],

    // The home page has no running text, so there is no text editor for it.
    'body' => ['enabled' => false],

    // read: 'public' (anyone) or 'published' (anyone once status is published, otherwise signed in).
    // The rest name the lowest role allowed; an action left out is not offered at all.
    'access' => ['read' => 'public', 'update' => 'editor'],
];
