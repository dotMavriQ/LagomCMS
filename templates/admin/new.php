<?php
/**
 * "New document": a title is all it takes. Everything else is filled in the editor.
 *
 * @var array<string, mixed> $definition
 * @var Lagom\Auth\User      $user
 * @var string               $documentTitle
 * @var string               $slug
 * @var string|null          $error
 */
?>
<header class="bar">
    <button class="ghost" type="button" data-toggle-sidebar title="Show or hide the sidebar"><?= icon('sidebar') ?></button>
    <nav class="crumbs">
        <?php if ($definition['parent'] !== null): ?>
            <a href="/admin/<?= e($definition['parent']) ?>"><?= e($tabs[0]['label']) ?></a>
            <span aria-hidden="true">/</span>
        <?php endif; ?>
        <a href="/admin/<?= e($definition['name']) ?>"><?= e($definition['label']) ?></a>
        <span aria-hidden="true">/</span>
        <span>New</span>
    </nav>
</header>

<?php require __DIR__ . '/_tabs.php'; ?>

<form class="note stack" method="post" action="/admin/<?= e($definition['name']) ?>/new">
    <input type="hidden" name="csrf" value="<?= e($user->csrfToken) ?>">

    <?php if ($error !== null): ?>
        <p class="notice notice--error" role="alert"><?= e($error) ?></p>
    <?php endif; ?>

    <textarea class="note__title" name="title" rows="1" placeholder="Untitled" required autofocus
        data-autogrow data-slug-source><?= e($documentTitle) ?></textarea>

    <label class="field">
        <span>Address</span>
        <input type="text" name="slug" value="<?= e($slug) ?>" placeholder="made from the title" pattern="[a-z0-9][a-z0-9_\-]*"
            spellcheck="false" data-slug-target>
        <small>This becomes the folder name and the last part of the URL. It starts life as a draft.</small>
    </label>

    <p><button class="button button--primary" type="submit">Create and start writing</button></p>
</form>
