<?php

return [
    'name' => 'site',
    'label' => 'Settings',
    'group' => 'Settings',
    'order' => 90,
    'singleton' => true,
    // Configuration or a fragment of a page, not a page of its own.
    'seo' => false,

    // Everything about the site as a whole. The Astro package reads these on every
    // request (cached for a minute), so a change here shows up without a rebuild.
    'fields' => [
        ['name' => 'title', 'type' => 'text', 'label' => 'Site name', 'required' => true, 'help' => 'Shown in the header of every page, and to search engines as the name of the site.'],
        ['name' => 'short_name', 'type' => 'text', 'label' => 'Short name', 'help' => 'The ending of every browser tab title ("blog // short name") and the name in the footer. Leave empty to use the site name.'],
        ['name' => 'author', 'type' => 'text', 'label' => 'Author', 'help' => 'Your name, as it should appear in feeds and to search engines.'],
        ['name' => 'alternate_name', 'type' => 'text', 'label' => 'Also known as', 'help' => 'A handle or pen name, if people know you by one.'],
        ['name' => 'locale', 'type' => 'text', 'label' => 'Language', 'default' => 'en', 'help' => 'A language code such as en, sv or pt.'],
        ['name' => 'logo', 'type' => 'asset', 'label' => 'Header logo', 'builtin' => '/logo-mask.webp', 'accept' => ['image/png', 'image/webp'], 'help' => 'The small logo in the header of every page. The large one on the home page is separate, under Home. Used as a stencil: only its shape matters, the theme supplies the colour. So it has to be a PNG or WebP with a transparent background.'],
        ['name' => 'favicon', 'type' => 'asset', 'label' => 'Favicon', 'builtin' => '/icon-192.png', 'accept' => ['image/png', 'image/webp'], 'help' => 'The small icon in the browser tab, in bookmarks and on a phone\'s home screen. Upload a square PNG or WebP of 512 pixels or more and it is used exactly as it is. With nothing uploaded here, the icon is made from the header logo above: the logo in cream on a dark rounded tile.'],
        ['name' => 'nav', 'type' => 'rows', 'label' => 'Navigation', 'help' => 'The links in the header, in this order.', 'columns' => [
            ['name' => 'label', 'label' => 'Label'],
            ['name' => 'url', 'label' => 'Address'],
        ]],
        ['name' => 'blog_description', 'type' => 'text', 'label' => 'Blog description', 'help' => 'What the blog is about, for search results and link previews of the blog page.'],
        ['name' => 'portfolio_description', 'type' => 'text', 'label' => 'Portfolio description', 'help' => 'The same, for the portfolio page.'],
        ['name' => 'portfolio_tagline', 'type' => 'text', 'label' => 'Portfolio tagline', 'help' => 'The line under the heading on the portfolio page.'],
        ['name' => 'portfolio_intro', 'type' => 'text', 'label' => 'Portfolio introduction', 'multiple' => true, 'help' => 'The sentence or two under the tagline. One entry per line, as they should break on the page.'],
        ['name' => 'feed_title', 'type' => 'text', 'label' => 'Feed title', 'help' => 'The name of your RSS and Atom feeds, as feed readers show it. Leave empty to use the site name.'],
        ['name' => 'feed_description', 'type' => 'text', 'label' => 'Feed description'],
        ['name' => 'feed_email', 'type' => 'text', 'label' => 'Feed email', 'quiet' => true, 'help' => 'RSS asks for an author address. It is public in the feed, so use one you do not mind being seen.'],
        ['name' => 'tag_colours', 'type' => 'rows', 'label' => 'Tag colours', 'help' => 'The colour of the dot next to a tag. A tag that is not listed here gets a colour picked for it, and keeps it.', 'columns' => [
            ['name' => 'tag', 'label' => 'Tag'],
            ['name' => 'hue', 'label' => 'Colour', 'options' => ['red', 'green', 'yellow', 'blue', 'purple', 'aqua']],
        ]],
        ['name' => 'geo_region', 'type' => 'text', 'label' => 'Country code', 'quiet' => true, 'help' => 'Two letters, such as PT or SE. Tells search engines where you are based. Optional.'],
        ['name' => 'geo_placename', 'type' => 'text', 'label' => 'Town or city', 'quiet' => true],
    ],

    'body' => ['enabled' => false],

    // read: 'public' (anyone) or 'published' (anyone once status is published, otherwise signed in).
    // The rest name the lowest role allowed; an action left out is not offered at all.
    'access' => ['read' => 'public', 'update' => 'admin'],
];
