<?php

return [
    'name' => 'social',
    'label' => 'Social',
    'group' => 'Integrations',
    'order' => 70,
    'singleton' => true,
    // Configuration or a fragment of a page, not a page of its own.
    'seo' => false,

    // Which fediverse posts appear on the site's /social page. These are the rules
    // src/Social/Feed.php applies. Saving them rebuilds the archive, which means a
    // dozen or so requests to the instance and takes several seconds.
    'fields' => [
        ['name' => 'title', 'type' => 'text', 'label' => 'Name', 'required' => true],
        ['name' => 'instance', 'type' => 'text', 'label' => 'Instance', 'help' => 'The address of the fediverse server the posts come from.'],
        ['name' => 'profile_url', 'type' => 'text', 'label' => 'Your profile', 'help' => 'The address of your own profile on that server. It is what "follow" and "open profile" point at. The first account below is treated as yours.'],
        ['name' => 'lede', 'type' => 'text', 'label' => 'Introduction', 'help' => 'The sentence under your handle on the page.'],
        ['name' => 'description', 'type' => 'text', 'label' => 'Search description', 'help' => 'The line under the headline in search results and link previews.'],
        ['name' => 'media_host', 'type' => 'text', 'label' => 'Image host that resizes', 'quiet' => true, 'help' => 'Optional. If your media is served from a host that resizes on request with ?width= (Bunny, for one), name it here (media.example.com) and the page asks for small images instead of originals.'],
        ['name' => 'accounts', 'type' => 'rows', 'label' => 'Accounts shown', 'help' => 'Each account on the instance whose posts appear on the page, with what to leave out for that account. "Media only" keeps just the posts that have a photo or video.', 'columns' => [
            ['name' => 'acct', 'label' => 'Account'],
            ['name' => 'hide_replies', 'label' => 'Hide replies', 'type' => 'boolean'],
            ['name' => 'hide_boosts', 'label' => 'Hide boosts', 'type' => 'boolean'],
            ['name' => 'media_only', 'label' => 'Media only', 'type' => 'boolean'],
        ]],
        ['name' => 'public_only', 'type' => 'boolean', 'label' => 'Public posts only', 'help' => 'Leave out unlisted and followers-only posts.'],
        ['name' => 'hide_mention_openers', 'type' => 'boolean', 'label' => 'Hide posts that open with a mention', 'help' => 'A post starting with @somebody is half of a conversation, not something written for the page.'],
        ['name' => 'posts_per_page', 'type' => 'number', 'label' => 'Posts per page', 'help' => 'How many load at a time on the page.'],
    ],

    // The text is the "why the fediverse?" note behind the button of that name. Leave it
    // empty and the button is not shown. Plain Markdown is fine; HTML works too, and an
    // <article lang="sv" data-lang="sv"> per language gives visitors a language switch.
    'body' => ['enabled' => true, 'blocks' => ['paragraph', 'list']],

    // read: 'public' (anyone) or 'published' (anyone once status is published, otherwise signed in).
    // The rest name the lowest role allowed; an action left out is not offered at all.
    'access' => ['read' => 'public', 'update' => 'admin'],
];
