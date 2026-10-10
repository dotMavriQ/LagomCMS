<?php

return [
    'name' => 'posts',
    'label' => 'Blog',
    'group' => 'Site',
    'order' => 50,

    // 'quiet' fields stay out of the editor's way until they hold something.
    'fields' => [
        ['name' => 'title', 'type' => 'text', 'required' => true, 'sortable' => true, 'filterable' => true],
        ['name' => 'status', 'type' => 'select', 'required' => true, 'filterable' => true, 'default' => 'draft', 'options' => ['draft', 'published', 'archived']],
        ['name' => 'published_at', 'type' => 'datetime', 'sortable' => true, 'filterable' => true],
        ['name' => 'tags', 'type' => 'text', 'multiple' => true, 'list' => true, 'filterable' => true],
        ['name' => 'author', 'type' => 'relation', 'filterable' => true, 'collection' => 'authors'],
        ['name' => 'cover', 'type' => 'asset', 'accept' => ['image/*']],
        ['name' => 'hero_path', 'type' => 'text', 'label' => 'Hero image path', 'help' => 'Legacy. A path like /img/blog/name.webp served by the frontend.'],
        ['name' => 'summary', 'type' => 'text', 'label' => 'Summary', 'help' => 'Shown in listings and feeds. Falls back to the first lines of the body.'],
        ['name' => 'revised_at', 'type' => 'datetime', 'quiet' => true, 'label' => 'Last updated', 'help' => 'Set only when a substantive revision is worth announcing.'],
        ['name' => 'series', 'type' => 'text', 'quiet' => true, 'label' => 'Series ID', 'sortable' => true, 'filterable' => true, 'help' => 'A slug shared by every part, e.g. building-a-cms.'],
        ['name' => 'series_label', 'type' => 'text', 'quiet' => true, 'label' => 'Label in the series', 'help' => 'How this part is named in the list of parts, e.g. "Part II: The Confidence Game". Leave empty to use the post\'s title.'],
        ['name' => 'series_title', 'type' => 'text', 'quiet' => true, 'label' => 'Series title', 'help' => 'The human name, shown above the part list.'],
        ['name' => 'standfirst', 'type' => 'text', 'multiple' => true, 'quiet' => true, 'label' => 'Series intro', 'help' => 'Opening paragraphs shown in the series box, under the list of parts. One box per paragraph.'],
        ['name' => 'part', 'type' => 'number', 'quiet' => true, 'label' => 'Part number', 'sortable' => true, 'filterable' => true],
        ['name' => 'parts_total', 'type' => 'number', 'quiet' => true, 'label' => 'Parts in total'],
    ],

    'body' => ['enabled' => true, 'blocks' => ['paragraph', 'heading', 'code', 'blockquote', 'list', 'table', 'thematic_break', 'image', 'gallery', 'callout']],

    // read: 'public' (anyone) or 'published' (anyone once status is published, otherwise signed in).
    // The rest name the lowest role allowed; an action left out is not offered at all.
    'access' => ['read' => 'published', 'create' => 'editor', 'update' => 'editor', 'delete' => 'admin'],
];
