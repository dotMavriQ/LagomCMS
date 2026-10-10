<?php

return [
    'name' => 'contact',
    'label' => 'Contact',
    'group' => 'Site',
    'order' => 60,
    'singleton' => true,
    // It has its own title and description, right here among the fields.
    'seo' => false,

    // The Contact page, top to bottom: a heading block, a row of channel buttons,
    // then a row of cards.
    'fields' => [
        ['name' => 'title', 'type' => 'text', 'label' => 'Heading', 'required' => true],
        ['name' => 'tab_title', 'type' => 'text', 'label' => 'Browser tab title', 'help' => 'The text in the browser tab, and the headline in search results.'],
        ['name' => 'description', 'type' => 'text', 'label' => 'Search description', 'help' => 'The line under the headline in search results and link previews.'],
        ['name' => 'tagline', 'type' => 'text', 'label' => 'Tagline', 'help' => 'The line directly under the heading.'],
        ['name' => 'intro', 'type' => 'text', 'label' => 'Introduction', 'help' => 'The sentence above the channel buttons.'],
        ['name' => 'channels', 'type' => 'rows', 'label' => 'Channels', 'help' => 'The row of buttons, in this order. For the email button, type the address itself: the site hides it from scrapers and reveals it on click.', 'columns' => [
            ['name' => 'label', 'label' => 'Label'],
            ['name' => 'url', 'label' => 'Address'],
            ['name' => 'icon', 'label' => 'Icon', 'options' => ['', 'github', 'linkedin', 'email', 'fediverse', 'matrix']],
        ]],
        // 'layout' => 'cards' shows each row as a card with an Edit button, instead of a table line.
        ['name' => 'cards', 'type' => 'rows', 'layout' => 'cards', 'label' => 'Cards', 'help' => 'The cards under the channels, side by side on a wide screen.', 'columns' => [
            ['name' => 'title', 'label' => 'Title'],
            ['name' => 'text', 'label' => 'What it says', 'long' => true],
            ['name' => 'button', 'label' => 'Button label'],
            // What pressing the button does. 'booking' opens Cal.com's booking window on the
            // page itself (site/src/scripts/cal.ts); without JavaScript it is a plain link to cal.com.
            ['name' => 'action', 'label' => 'The button', 'options' => ['link', 'booking'], 'option_labels' => ['link' => 'opens a link', 'booking' => 'opens the Cal.com booking window']],
            ['name' => 'url', 'label' => 'Address'],
            ['name' => 'primary', 'label' => 'Highlight the button', 'type' => 'boolean', 'help' => 'Draws it filled. Best kept for the one thing you most want pressed.'],
        ]],
    ],

    'body' => ['enabled' => false],

    // read: 'public' (anyone) or 'published' (anyone once status is published, otherwise signed in).
    // The rest name the lowest role allowed; an action left out is not offered at all.
    'access' => ['read' => 'public', 'update' => 'editor'],
];
