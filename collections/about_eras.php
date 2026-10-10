<?php

return [
    'name' => 'about_eras',
    'label' => 'Journey',
    'group' => 'Site',
    'order' => 41,
    'parent' => 'about',
    // A chapter of a page, not a page of its own.
    'seo' => false,
    // How the admin lists them: in the order they appear on the page.
    'sort' => 'sort_key',

    // One chapter of the "journey" timeline on the About page. The text of the
    // document is the chapter's paragraphs.
    'fields' => [
        ['name' => 'title', 'type' => 'text', 'label' => 'Chapter', 'required' => true, 'list' => true, 'help' => 'The chapter\'s name, as shown in the timeline.'],
        ['name' => 'when', 'type' => 'text', 'label' => 'When', 'list' => true, 'help' => 'As it should read, e.g. "2018 – 2023".'],
        ['name' => 'where', 'type' => 'text', 'label' => 'Where', 'list' => true],
        ['name' => 'lead', 'type' => 'text', 'label' => 'Opening line', 'help' => 'The emphasised sentence above the paragraphs.'],
        ['name' => 'now', 'type' => 'boolean', 'label' => 'This is the current chapter', 'help' => 'Marks it as ongoing on the timeline.'],
        ['name' => 'sort_key', 'type' => 'number', 'label' => 'Sort key', 'required' => true, 'sortable' => true, 'help' => 'Lower comes first. Leave gaps so a chapter can be slotted in.'],
    ],

    'body' => ['enabled' => true, 'blocks' => ['paragraph']],

    // read: 'public' (anyone) or 'published' (anyone once status is published, otherwise signed in).
    // The rest name the lowest role allowed; an action left out is not offered at all.
    'access' => ['read' => 'public', 'create' => 'editor', 'update' => 'editor', 'delete' => 'admin'],
];
