<?php

return [
    'name' => 'stack',
    'label' => 'Stack',
    'group' => 'Site',
    'order' => 42,
    'parent' => 'about',
    // A row of a page, not a page of its own.
    'seo' => false,
    'sort' => 'sort_key',

    // One row of the "stack" section on the About page: a label and its chips.
    'fields' => [
        ['name' => 'title', 'type' => 'text', 'label' => 'Group', 'required' => true, 'list' => true, 'sortable' => true],
        ['name' => 'items', 'type' => 'text', 'label' => 'Entries', 'required' => true, 'multiple' => true, 'list' => true, 'help' => 'In the order they should read. Strongest first.'],
        ['name' => 'hue', 'type' => 'select', 'label' => 'Colour', 'required' => true, 'default' => 'green', 'options' => ['red', 'green', 'yellow', 'blue', 'purple', 'aqua']],
        ['name' => 'sort_key', 'type' => 'number', 'label' => 'Sort key', 'required' => true, 'sortable' => true, 'help' => 'Lower comes first.'],
    ],

    'body' => ['enabled' => false],

    // read: 'public' (anyone) or 'published' (anyone once status is published, otherwise signed in).
    // The rest name the lowest role allowed; an action left out is not offered at all.
    'access' => ['read' => 'public', 'create' => 'editor', 'update' => 'editor', 'delete' => 'admin'],
];
