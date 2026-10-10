<?php

return [
    'name' => 'projects',
    'label' => 'Portfolio',
    'group' => 'Site',
    'order' => 30,

    'fields' => [
        ['name' => 'title', 'type' => 'text', 'required' => true, 'sortable' => true, 'filterable' => true],
        ['name' => 'status', 'type' => 'select', 'required' => true, 'list' => true, 'filterable' => true, 'default' => 'draft', 'options' => ['draft', 'published', 'archived']],
        ['name' => 'summary', 'type' => 'text', 'label' => 'Card description', 'help' => 'The sentence shown on the card.'],
        ['name' => 'featured', 'type' => 'boolean', 'label' => 'Featured', 'filterable' => true, 'help' => 'Renders as a large card rather than a compact one'],
        ['name' => 'sort_key', 'type' => 'number', 'label' => 'Sort key', 'required' => true, 'sortable' => true, 'help' => 'Lower sorts first.'],
        ['name' => 'tags', 'type' => 'text', 'multiple' => true, 'list' => true, 'filterable' => true],
        ['name' => 'link_labels', 'type' => 'text', 'label' => 'Link labels', 'multiple' => true],
        ['name' => 'link_urls', 'type' => 'text', 'label' => 'Link URLs', 'multiple' => true],
        ['name' => 'image', 'type' => 'asset', 'label' => 'Card image', 'accept' => ['image/*']],
        ['name' => 'image_path', 'type' => 'text', 'label' => 'Card image path'],
        ['name' => 'image_w', 'type' => 'number', 'label' => 'Image width'],
        ['name' => 'image_h', 'type' => 'number', 'label' => 'Image height'],
        ['name' => 'image_alt', 'type' => 'text', 'label' => 'Image alt text'],
        ['name' => 'image_secondary_path', 'type' => 'text', 'label' => 'Second image path'],
        ['name' => 'image_contain', 'type' => 'boolean', 'label' => 'Contain, not cover', 'help' => 'Fits the whole image inside the frame rather than filling it'],
        ['name' => 'kind', 'type' => 'select', 'required' => true, 'list' => true, 'filterable' => true, 'default' => 'compact-card', 'options' => ['featured-card', 'primary-card', 'compact-card', 'meta-card']],
        ['name' => 'hue', 'type' => 'select', 'label' => 'Card hue', 'required' => true, 'default' => 'blue', 'options' => ['red', 'green', 'yellow', 'blue', 'purple', 'aqua']],
        ['name' => 'category', 'type' => 'text', 'label' => 'Card category', 'help' => 'Shown under the image, e.g. "headless cms", "browser extension".'],
    ],

    // A project is a card and nothing else: the site has no page per project, so there is
    // nowhere for body text to appear. The copy is the card description above.
    'body' => ['enabled' => false],

    // read: 'public' (anyone) or 'published' (anyone once status is published, otherwise signed in).
    // The rest name the lowest role allowed; an action left out is not offered at all.
    'access' => ['read' => 'published', 'create' => 'editor', 'update' => 'editor', 'delete' => 'admin'],
];
