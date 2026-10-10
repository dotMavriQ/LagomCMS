<?php

/**
 * Settings for this installation. Everything that differs between your laptop and
 * the server comes from an environment variable, with the local value as fallback.
 */

return [
    // The Astro project that is the public website. It is built into plain files
    // whenever something is published (see src/Site/Builder.php), and those files
    // are served from this same address.
    'site_path' => rtrim(getenv('LAGOM_SITE') ?: __DIR__ . '/site', '/'),

    // What builds it. Run inside the folder above; needs Node on this machine. If
    // the web server's PATH is too bare to find npx, give the full path here.
    'build_command' => getenv('LAGOM_BUILD') ?: 'npx --no-install astro build',

    // Where the build can reach this CMS to fetch the content. Left empty, it is
    // the address the admin was opened at. Set it when that address is not usable
    // from the machine itself, e.g. to http://127.0.0.1:8080 behind a proxy.
    'internal_url' => rtrim((string) getenv('LAGOM_INTERNAL_URL'), '/'),

    // Where the public website is, for the "View on site" links in the admin. Empty
    // means "right here", which is the normal case. Only set it when the files are
    // served from somewhere else.
    'site_url' => rtrim((string) getenv('LAGOM_SITE_URL'), '/'),

    // Where a document ends up on the website, per collection. {slug} is filled in.
    // A collection that is missing here simply gets no "View on site" link.
    'routes' => [
        'home' => '/',
        'site' => '/',
        'posts' => '/blog/{slug}',
        'projects' => '/portfolio',
        'cv' => '/cv',
        'cv_roles' => '/cv',
        'cv_skills' => '/cv',
        'cv_references' => '/cv',
    ],

    // Where the website keeps the picture it shows when a link is shared, per collection.
    // The editor shows it under "Search and sharing". The site draws these itself when it
    // is built, so the picture is as fresh as the last publish.
    'share_images' => [
        'posts' => '/og/{slug}.png',
    ],
];
