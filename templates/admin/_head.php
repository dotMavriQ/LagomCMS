<?php
/**
 * The <head> every admin page shares.
 *
 * @var string $title
 */
$version = static fn (string $file): string => (string) @filemtime(dirname(__DIR__, 2) . '/public/admin/' . $file);
?>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title><?= e($title) ?> · Lagom</title>
<link rel="preload" href="/admin/fonts/source-serif-4-latin-opsz-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/admin/admin.css?v=<?= $version('admin.css') ?>">
<script>
    // Runs before the first paint so a dark-mode user never sees a white flash.
    // The choice is the same key the public site uses, so the two stay in step.
    (function () {
        try {
            var saved = localStorage.getItem('blog-theme');
            if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
        } catch (e) { /* private mode: just follow the OS */ }
    })();
</script>
