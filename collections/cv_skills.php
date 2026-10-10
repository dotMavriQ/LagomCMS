<?php

return [
    'name' => 'cv_skills',
    'label' => 'Skills',
    'group' => 'Site',
    'order' => 22,
    'parent' => 'cv',
    // Configuration or a fragment of a page, not a page of its own.
    'seo' => false,

    'fields' => [
        ['name' => 'title', 'type' => 'text', 'label' => 'Category', 'required' => true, 'list' => true, 'sortable' => true, 'help' => 'e.g. Languages, Frameworks, Infrastructure.'],
        ['name' => 'skills', 'type' => 'text', 'label' => 'Skills', 'required' => true, 'multiple' => true, 'list' => true, 'help' => 'Comma separated, in the order they should read.'],
        ['name' => 'sort_key', 'type' => 'number', 'label' => 'Sort key', 'required' => true, 'sortable' => true, 'help' => 'Lower sorts first.'],
    ],

    'body' => ['enabled' => false],

    // read: 'public' (anyone) or 'published' (anyone once status is published, otherwise signed in).
    // The rest name the lowest role allowed; an action left out is not offered at all.
    'access' => ['read' => 'public', 'create' => 'editor', 'update' => 'editor', 'delete' => 'admin'],
];
