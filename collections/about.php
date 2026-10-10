<?php

return [
    'name' => 'about',
    'label' => 'About',
    'group' => 'Site',
    'order' => 40,
    'singleton' => true,
    // The About page is one screen built from three collections. This one holds the
    // top of the page and the closing text; the journey and the stack name it as
    // their 'parent' and show up as tabs beside it.
    'tab' => 'Page',
    // It has its own title and description, written on the page itself.
    'seo' => false,

    'fields' => [
        ['name' => 'title', 'type' => 'text', 'label' => 'Name', 'required' => true, 'help' => 'The large heading. The job title under it comes from the CV.'],
        ['name' => 'tab_title', 'type' => 'text', 'label' => 'Browser tab title', 'help' => 'The text in the browser tab, and the headline in search results.'],
        ['name' => 'description', 'type' => 'text', 'label' => 'Search description', 'help' => 'The line under the headline in search results and link previews. Leave empty for your name and job title.'],
        ['name' => 'facts', 'type' => 'text', 'label' => 'Facts', 'multiple' => true, 'help' => 'The short line under the job title. One fact per entry.'],
        ['name' => 'availability', 'type' => 'text', 'label' => 'Availability', 'help' => 'The last, highlighted item on that line. Empty it to show nothing.'],
        ['name' => 'portrait', 'type' => 'asset', 'label' => 'Portrait', 'builtin' => '/img/portrait.webp', 'accept' => ['image/jpeg', 'image/png', 'image/webp', 'image/avif'], 'help' => 'Shown upright, about 565 by 754 pixels.'],
        ['name' => 'portrait_alt', 'type' => 'text', 'label' => 'Portrait description', 'help' => 'For readers who cannot see the photo.'],
        ['name' => 'stats', 'type' => 'rows', 'label' => 'Numbers', 'help' => 'The band of figures under the photo. Type "heart" as the value to draw a heart.', 'columns' => [
            ['name' => 'value', 'label' => 'Value'],
            ['name' => 'label', 'label' => 'Label'],
        ]],
        ['name' => 'next', 'type' => 'rows', 'label' => 'Closing buttons', 'help' => 'The row of buttons at the very bottom of the page.', 'columns' => [
            ['name' => 'label', 'label' => 'Label'],
            ['name' => 'url', 'label' => 'Address'],
            ['name' => 'note', 'label' => 'Note'],
        ]],
    ],

    // The text is the page's last section, "outside the editor". To mark a link as
    // one of your own profiles (rel="me"), give it the title "me":
    //     [OpenStreetMap](https://www.openstreetmap.org/user/you "me")
    'body' => ['enabled' => true, 'blocks' => ['paragraph', 'list']],

    // read: 'public' (anyone) or 'published' (anyone once status is published, otherwise signed in).
    // The rest name the lowest role allowed; an action left out is not offered at all.
    'access' => ['read' => 'public', 'update' => 'editor'],
];
