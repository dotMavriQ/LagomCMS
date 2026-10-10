<?php

return [
    'name' => 'cv_roles',
    'label' => 'Entries',
    'group' => 'Site',
    'order' => 21,
    'parent' => 'cv',
    // How the admin lists them: newest role on top, the way the CV page prints them.
    'sort' => '-sort_key',
    // Configuration or a fragment of a page, not a page of its own.
    'seo' => false,

    'fields' => [
        ['name' => 'title', 'type' => 'text', 'label' => 'Role', 'required' => true, 'list' => true, 'sortable' => true, 'help' => 'The job title, programme, or certificate name.'],
        ['name' => 'org', 'type' => 'text', 'label' => 'Organisation', 'required' => true, 'list' => true, 'filterable' => true],
        ['name' => 'kind', 'type' => 'select', 'required' => true, 'list' => true, 'filterable' => true, 'default' => 'job', 'options' => ['job', 'additional', 'education', 'certificate']],
        ['name' => 'dates', 'type' => 'text', 'label' => 'Dates', 'help' => 'As it should read, e.g. \'Mar 2021 – present\'.'],
        ['name' => 'sort_key', 'type' => 'number', 'label' => 'Sort key', 'required' => true, 'sortable' => true, 'filterable' => true, 'help' => 'Higher sorts first. Leave gaps so a role can be slotted in.'],
        ['name' => 'location', 'type' => 'text', 'label' => 'Location'],
        ['name' => 'bullets', 'type' => 'text', 'label' => 'Bullet points', 'multiple' => true, 'help' => 'One line each. Comma separated.'],
        ['name' => 'tags', 'type' => 'text', 'label' => 'Tags', 'multiple' => true, 'list' => true, 'filterable' => true],
        ['name' => 'current', 'type' => 'boolean', 'label' => 'Current role', 'help' => 'Marks the role as ongoing'],
    ],

    'body' => ['enabled' => false],

    // read: 'public' (anyone) or 'published' (anyone once status is published, otherwise signed in).
    // The rest name the lowest role allowed; an action left out is not offered at all.
    'access' => ['read' => 'public', 'create' => 'editor', 'update' => 'editor', 'delete' => 'admin'],
];
