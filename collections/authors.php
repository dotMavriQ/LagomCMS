<?php

return [
    'name' => 'authors',
    'label' => 'Authors',
    'group' => 'Blog',
    'order' => 70,
    // The site has one author and never asks for this. Posts still point at it through their author field.
    // Hidden from the admin's menu until something does. The files stay where they are,
    // and /admin/authors still opens it.
    'hidden' => true,

    'fields' => [
        ['name' => 'title', 'type' => 'text', 'required' => true, 'sortable' => true, 'filterable' => true],
        ['name' => 'bio', 'type' => 'text'],
    ],

    'body' => ['enabled' => true],

    // read: 'public' (anyone) or 'published' (anyone once status is published, otherwise signed in).
    // The rest name the lowest role allowed; an action left out is not offered at all.
    'access' => ['read' => 'public', 'create' => 'editor'],
];
