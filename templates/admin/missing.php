<?php
/**
 * Shown for an address that leads nowhere, or somewhere this user may not go.
 *
 * @var string $title
 */
?>
<header class="bar">
    <button class="ghost" type="button" data-toggle-sidebar title="Show or hide the sidebar"><?= icon('sidebar') ?></button>
    <span class="crumbs"><?= e($title) ?></span>
</header>
<div class="empty">
    <h1><?= e($title) ?></h1>
    <p>There is nothing here. It may have been renamed or moved to the trash.</p>
    <p><a class="button" href="/admin">Back to the start page</a></p>
</div>
