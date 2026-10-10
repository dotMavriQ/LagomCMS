<?php
/**
 * The frame around every signed-in page: menu on the left, the page on the right.
 *
 * The menu is deliberately short. Things you write (posts, projects) come first,
 * then the pages built from fixed pieces (home, CV), and settings sit at the very
 * bottom where every CMS keeps them. Nothing in it grows as you publish.
 *
 * @var string                $title
 * @var string                $content the page itself, already rendered
 * @var Lagom\Auth\User       $user
 * @var string|null           $current the menu entry being looked at
 * @var bool                  $isStart true on the start page
 * @var array<string, mixed>|null $publishing how the website's last build went; null when there is no site to build
 * @var array<string, list<array{definition: array<string, mixed>, documents: list<array<string, mixed>>}>> $menu
 */

// The quick switcher (Ctrl+O) searches this list in the browser, so it is instant.
// It is sorted with the most recently edited first: opened with nothing typed, the
// switcher shows what you were last working on.
$outline = [];
foreach ($menu as $group) {
    foreach ($group as $entry) {
        $definition = $entry['definition'];
        if ($definition['singleton']) {
            // Singletons sort last. They never move, and are one click away in the menu.
            $outline[] = ['title' => $definition['label'], 'where' => $definition['group'], 'url' => '/admin/' . $definition['name'], 'edited' => 0];
        }
        foreach ($entry['documents'] as $document) {
            if ($document['collection'] === $document['slug']) {
                continue; // a singleton's own document, already listed above
            }
            $outline[] = [
                'title' => $document['title'] ?? $document['slug'],
                'where' => $document['label'],
                'status' => $document['status'],
                'url' => '/admin/' . $document['collection'] . '/' . $document['slug'],
                'edited' => (int) $document['updated_at'],
            ];
        }
    }
}
usort($outline, fn (array $a, array $b): int => $b['edited'] <=> $a['edited']);

// Settings are pulled out of the flow and pinned to the bottom of the sidebar.
$settings = $menu['Settings'] ?? [];
unset($menu['Settings']);

/** One line of the menu. Collections you add to get a count and a "+" on hover. */
$menuLine = static function (array $entry) use ($current): void {
    $definition = $entry['definition'];
    $name = $definition['name'];
    ?>
    <div class="tree__row">
        <a class="tree__item" href="/admin/<?= e($name) ?>"<?= $name === $current ? ' aria-current="page"' : '' ?>>
            <span class="tree__name"><?= e($definition['label']) ?></span>
            <?php if (!$definition['singleton']): ?>
                <span class="tree__count"><?= count($entry['documents']) ?></span>
            <?php endif; ?>
        </a>
        <?php if (!$definition['singleton']): ?>
            <a class="tree__add" href="/admin/<?= e($name) ?>/new" title="New in <?= e($definition['label']) ?>">
                <?= icon('plus') ?><span class="sr-only">New in <?= e($definition['label']) ?></span>
            </a>
        <?php endif; ?>
    </div>
    <?php
};
?>
<!doctype html>
<html lang="en">
<head>
    <?php require __DIR__ . '/_head.php'; ?>
</head>
<body>
<div class="app" data-app>
    <aside class="sidebar" aria-label="Content">
        <div class="sidebar__top">
            <?php // The wordmark is drawn by CSS from /admin/lagomcms.webp; the text is for screen readers. ?>
            <a class="brand" href="/admin"<?= $isStart ? ' aria-current="page"' : '' ?> title="Start page">
                <span class="brand__mark" aria-hidden="true"></span>
                <span class="sr-only">LagomCMS, start page</span>
            </a>
            <button class="ghost" type="button" data-quick-open title="Find a document (Ctrl+O)">
                <?= icon('search') ?><span class="sr-only">Find a document</span>
            </button>
        </div>

        <nav class="tree">
            <?php foreach ($menu as $group): ?>
                <div class="tree__section">
                    <?php foreach ($group as $entry): ?>
                        <?php $menuLine($entry); ?>
                    <?php endforeach; ?>
                </div>
            <?php endforeach; ?>
        </nav>

        <?php if ($settings !== []): ?>
            <nav class="tree tree--settings" aria-label="Settings">
                <?php foreach ($settings as $entry): ?>
                    <?php $menuLine($entry); ?>
                <?php endforeach; ?>
            </nav>
        <?php endif; ?>

        <?php if ($publishing !== null): ?>
            <?php
            // One quiet line saying whether the website matches what is in here. The
            // wording is filled in by app.js, which also keeps it current while a build
            // runs; the sentence below is what shows until it has.
            $states = ['never' => 'Site not published yet', 'building' => 'Publishing…', 'published' => 'Site is up to date', 'failed' => 'Publishing failed'];
            ?>
            <div class="publish" data-site-status
                 data-state="<?= e($publishing['state']) ?>"
                 data-finished="<?= (int) ($publishing['finished'] ?? 0) ?>"
                 data-seconds="<?= e((string) ($publishing['seconds'] ?? '')) ?>"
                 data-message="<?= e($publishing['message'] ?? '') ?>">
                <span class="publish__dot" aria-hidden="true"></span>
                <span class="publish__text" role="status" data-site-status-text><?= e($states[$publishing['state']] ?? '') ?></span>
                <form method="post" action="/admin/publish" data-site-status-again<?= in_array($publishing['state'], ['never', 'failed'], true) ? '' : ' hidden' ?>>
                    <input type="hidden" name="csrf" value="<?= e($user->csrfToken) ?>">
                    <button class="publish__again" type="submit"><?= $publishing['state'] === 'never' ? 'publish' : 'try again' ?></button>
                </form>
            </div>
        <?php endif; ?>

        <div class="sidebar__bottom">
            <span class="sidebar__user" title="<?= e($user->email) ?>"><?= e($user->email) ?></span>
            <button class="ghost" type="button" data-theme-toggle title="Light or dark">
                <?= icon('sun') ?><span class="sr-only">Switch between light and dark</span>
            </button>
            <form method="post" action="/admin/logout">
                <input type="hidden" name="csrf" value="<?= e($user->csrfToken) ?>">
                <button class="ghost" type="submit" title="Sign out">
                    <?= icon('logout') ?><span class="sr-only">Sign out</span>
                </button>
            </form>
        </div>
    </aside>

    <main class="pane">
        <?= $content ?>
    </main>
</div>

<dialog class="switcher" id="quick-open" aria-label="Find a document">
    <input type="text" placeholder="Find a document…" autocomplete="off" spellcheck="false" data-switcher-input>
    <ul class="switcher__results" data-switcher-results></ul>
</dialog>

<script type="application/json" id="lagom-outline"><?= json_encode($outline, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE) ?></script>
<script type="module" src="/admin/build/app.js?v=<?= (string) @filemtime(dirname(__DIR__, 2) . '/public/admin/build/app.js') ?>"></script>
</body>
</html>
