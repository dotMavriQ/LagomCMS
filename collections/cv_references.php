<?php

return [
    'name' => 'cv_references',
    'label' => 'References',
    'group' => 'Site',
    'order' => 23,
    'parent' => 'cv',
    // Configuration or a fragment of a page, not a page of its own.
    'seo' => false,

    'fields' => [
        ['name' => 'title', 'type' => 'text', 'label' => 'Name', 'required' => true, 'list' => true, 'sortable' => true],
        ['name' => 'org', 'type' => 'text', 'label' => 'Where we worked together', 'required' => true, 'list' => true, 'help' => 'The employer this person can speak to.'],
        ['name' => 'role', 'type' => 'text', 'label' => 'Their relationship to the work', 'list' => true, 'help' => 'Optional. e.g. Manager, Team Lead. Left blank it is not printed.'],
        ['name' => 'url', 'type' => 'text', 'label' => 'LinkedIn', 'help' => 'Printed as a link on the web and as the bare address on paper.'],
        ['name' => 'sort_key', 'type' => 'number', 'label' => 'Sort key', 'required' => true, 'sortable' => true, 'help' => 'Lower sorts first. Group by employer.'],
    ],

    'body' => ['enabled' => false],

    // read: 'public' (anyone) or 'published' (anyone once status is published, otherwise signed in).
    // The rest name the lowest role allowed; an action left out is not offered at all.
    'access' => ['read' => 'public', 'create' => 'editor', 'update' => 'editor', 'delete' => 'admin'],
];
