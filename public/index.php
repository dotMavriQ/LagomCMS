<?php

declare(strict_types=1);

/**
 * The front controller. Every request that is not a static file lands here.
 *
 * It does as little as possible: build the app, hand it the request, send what
 * comes back. Where a URL goes is decided in src/App.php.
 *
 * Run it locally with bin/dev, or by hand:
 *     php -S 127.0.0.1:4702 -t public public/index.php
 */

use Lagom\App;
use Lagom\Http\Request;

// PHP's built-in server sends everything through this script, including requests
// for files that exist in public/ (the admin's CSS and JavaScript). Returning
// false tells it to serve the file itself.
if (PHP_SAPI === 'cli-server') {
    $file = __DIR__ . rawurldecode((string) parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
    if (is_file($file)) {
        return false;
    }
}

require dirname(__DIR__) . '/vendor/autoload.php';

$root = dirname(__DIR__);

// LAGOM_DATA says where this installation's content/ and var/ live. Unset, they sit
// next to the code, which is all a single site needs.
$app = new App($root, rtrim(getenv('LAGOM_DATA') ?: $root, '/'));
$app->handle(Request::fromGlobals())->send();
