<?php

return [
    'name' => 'cv',
    'label' => 'CV',
    'group' => 'Site',
    'order' => 20,
    // The CV is one page built from four collections. This one is its header; the
    // other three name it as their 'parent' and show up as tabs beside it.
    'tab' => 'Header',
    'singleton' => true,
    // Configuration or a fragment of a page, not a page of its own.
    'seo' => false,

    'fields' => [
        ['name' => 'title', 'type' => 'text', 'label' => 'Name', 'required' => true],
        ['name' => 'role_title', 'type' => 'text', 'label' => 'Professional title'],
        ['name' => 'location', 'type' => 'text', 'label' => 'Location'],
        ['name' => 'email', 'type' => 'text', 'label' => 'Email'],
        ['name' => 'linkedin', 'type' => 'text', 'label' => 'LinkedIn URL'],
        ['name' => 'github', 'type' => 'text', 'label' => 'GitHub URL'],
        ['name' => 'languages', 'type' => 'text', 'label' => 'Languages', 'multiple' => true, 'help' => 'One per entry, e.g. \'Swedish — native\'.'],
        ['name' => 'knows_about', 'type' => 'text', 'label' => 'Knows about', 'multiple' => true, 'help' => 'Flat list for structured data. Comma separated.'],
        ['name' => 'employer', 'type' => 'text', 'label' => 'Current employer'],
        ['name' => 'same_as', 'type' => 'text', 'label' => 'Profile URLs', 'multiple' => true, 'help' => 'Full URLs of your profiles elsewhere (GitHub, LinkedIn, fediverse...). One per entry.'],
    ],

    'body' => ['enabled' => true, 'blocks' => ['paragraph', 'list']],

    // read: 'public' (anyone) or 'published' (anyone once status is published, otherwise signed in).
    // The rest name the lowest role allowed; an action left out is not offered at all.
    'access' => ['read' => 'public', 'update' => 'admin'],
];
