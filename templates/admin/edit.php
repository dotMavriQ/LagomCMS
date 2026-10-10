<?php
/**
 * The editor: one document, laid out the way Obsidian lays out a note.
 * Title on top, properties under it, then the text.
 *
 * The form is never submitted the old-fashioned way. The script in admin/src/
 * reads the controls and saves through the JSON API (PUT /api/v1/...).
 *
 * @var array<string, mixed>  $definition
 * @var list<array<string, mixed>> $tabs    this collection's family, see _tabs.php
 * @var array<string, mixed>  $row       the document's row from the index
 * @var array<string, mixed>  $fields    its front matter
 * @var string                $body      its Markdown, as typed
 * @var array<string, mixed>  $choices
 * @var string|null           $viewUrl
 * @var string|null           $shareImageUrl  the picture shown when a link to this is shared
 * @var bool                  $canDelete
 * @var Lagom\Auth\User       $user
 */
$collection = $definition['name'];
$slug = $row['slug'];
$hasBody = $definition['body']['enabled'];
$hasStatus = in_array('status', array_column($definition['fields'], 'name'), true);

// The title gets the big line at the top, and the SEO fields get a panel of their
// own that starts folded shut. Everything else is an ordinary property.
$seoNames = ['seo_title', 'seo_description', 'canonical', 'noindex'];
$main = [];
$seo = [];
foreach ($definition['fields'] as $field) {
    if ($field['name'] === 'title') {
        continue;
    }
    if (in_array($field['name'], $seoNames, true)) {
        $seo[] = $field;
    } else {
        $main[] = $field;
    }
}

// What the script needs to know about this document.
$boot = [
    'collection' => $collection,
    'slug' => $slug,
    'singleton' => $definition['singleton'],
    'hash' => $row['hash'],
    'csrf' => $user->csrfToken,
    'hasBody' => $hasBody,
    'mediaUrl' => '/api/v1/' . $collection . '/' . $slug . '/media',
];
?>
<header class="bar">
    <button class="ghost" type="button" data-toggle-sidebar title="Show or hide the sidebar"><?= icon('sidebar') ?></button>
    <nav class="crumbs">
        <?php if ($definition['parent'] !== null): ?>
            <a href="/admin/<?= e($definition['parent']) ?>"><?= e($tabs[0]['label']) ?></a>
            <span aria-hidden="true">/</span>
        <?php endif; ?>
        <?php if ($definition['singleton']): ?>
            <span><?= e($definition['label']) ?></span>
        <?php else: ?>
            <a href="/admin/<?= e($collection) ?>"><?= e($definition['label']) ?></a>
            <span aria-hidden="true">/</span>
            <span><?= e($slug) ?></span>
        <?php endif; ?>
    </nav>

    <span class="bar__spacer"></span>

    <span class="save-state" data-save-state aria-live="polite">Saved</span>

    <?php if ($viewUrl !== null): ?>
        <a class="ghost" href="<?= e($viewUrl) ?>" target="_blank" rel="noopener" title="View on the site"><?= icon('external') ?><span class="sr-only">View on the site</span></a>
    <?php endif; ?>

    <?php if ($hasStatus): ?>
        <button class="button" type="button" data-publish hidden></button>
    <?php endif; ?>
    <button class="button button--primary" type="button" data-save title="Save (Ctrl+S)">Save</button>

    <?php if ($canDelete): ?>
        <button class="ghost" type="button" data-delete title="Move to the trash"><?= icon('trash') ?><span class="sr-only">Move to the trash</span></button>
    <?php endif; ?>
</header>

<?php require __DIR__ . '/_tabs.php'; ?>

<?php if ($definition['notice'] !== null): ?>
    <p class="notice"><?= e($definition['notice']) ?></p>
<?php endif; ?>

<?php if ($row['parse_error'] !== null): ?>
    <p class="notice notice--error" role="alert">
        This file's front matter could not be read, so its properties are shown empty.
        Saving now would overwrite them. Fix the file by hand first.<br>
        <code><?= e($row['parse_error']) ?></code>
    </p>
<?php endif; ?>

<form class="note" id="document" autocomplete="off" onsubmit="return false">
    <textarea class="note__title" rows="1" placeholder="Untitled" spellcheck="true"
        data-field="title" data-kind="text" data-autogrow><?= e($fields['title'] ?? '') ?></textarea>

    <?php if ($main !== []): ?>
        <?php // Remembered per collection: folding the properties away while writing a post must not
              // hide a portfolio entry, where the properties are all there is. ?>
        <details class="props" <?= $hasBody ? 'data-remember="props-' . e($collection) . '"' : '' ?> open>
            <summary>Properties</summary>
            <?php foreach ($main as $field): ?>
                <?php $value = $fields[$field['name']] ?? null; ?>
                <?php require __DIR__ . '/_field.php'; ?>
            <?php endforeach; ?>
            <?php // The script fills in how many are hidden, and removes the button if none are. ?>
            <button class="props__more" type="button" data-show-quiet hidden></button>
        </details>
    <?php endif; ?>

    <?php if ($seo !== []): ?>
        <details class="props" data-remember="seo">
            <summary>Search and sharing</summary>
            <?php foreach ($seo as $field): ?>
                <?php $value = $fields[$field['name']] ?? null; ?>
                <?php require __DIR__ . '/_field.php'; ?>
            <?php endforeach; ?>
            <?php if ($shareImageUrl !== null): ?>
                <?php // Drawn by the website when it is built. The script hides this if there is none yet. ?>
                <figure class="share-image" data-share-image>
                    <img src="<?= e($shareImageUrl) ?>?v=<?= (int) $row['updated_at'] ?>" alt="The picture shown when a link to this is shared" loading="lazy">
                    <figcaption>Shown when a link is shared. Drawn from the title, the first tag and the illustration; updated at the next publish.</figcaption>
                </figure>
            <?php endif; ?>
        </details>
    <?php endif; ?>

    <?php if ($hasBody): ?>
        <?php // The script replaces this textarea with the real editor. Without JavaScript you still see your text. ?>
        <div class="editor" data-editor>
            <textarea class="editor__fallback" data-body spellcheck="true"><?= e($body) ?></textarea>
        </div>
    <?php endif; ?>
</form>

<footer class="statusbar">
    <?php if ($hasBody): ?>
        <span data-word-count><?= (int) $row['words'] ?> words</span>
    <?php endif; ?>
    <span>edited <?= e(date('j M Y, H:i', (int) $row['updated_at'])) ?></span>
</footer>

<script type="application/json" id="lagom-document"><?= json_encode($boot, JSON_HEX_TAG | JSON_HEX_AMP) ?></script>
