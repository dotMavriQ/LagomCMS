<?php
/**
 * Every document in one collection, as a table.
 *
 * @var array<string, mixed>       $definition
 * @var list<array<string, mixed>> $documents  index rows, each with its front matter under 'data'
 * @var bool                       $canCreate
 */

// Columns: the title, then whatever the collection flagged with 'list' => true.
// The status is always worth a column when a collection has one.
$columns = [];
foreach ($definition['fields'] as $field) {
    if (($field['list'] || $field['name'] === 'status') && $field['name'] !== 'title') {
        $columns[] = $field;
    }
}
$hasDate = in_array('published_at', array_column($definition['fields'], 'name'), true);
?>
<header class="bar">
    <button class="ghost" type="button" data-toggle-sidebar title="Show or hide the sidebar"><?= icon('sidebar') ?></button>
    <nav class="crumbs">
        <?php if ($definition['parent'] !== null): ?>
            <a href="/admin/<?= e($definition['parent']) ?>"><?= e($tabs[0]['label']) ?></a>
            <span aria-hidden="true">/</span>
        <?php endif; ?>
        <span><?= e($definition['label']) ?></span>
    </nav>
    <span class="bar__spacer"></span>
    <?php if ($canCreate): ?>
        <a class="button button--primary" href="/admin/<?= e($definition['name']) ?>/new"><?= icon('plus') ?> New</a>
    <?php endif; ?>
</header>

<?php require __DIR__ . '/_tabs.php'; ?>

<div class="listing">
    <h1 class="listing__title"><?= e($definition['label']) ?> <small><?= count($documents) ?></small></h1>

    <?php if ($documents === []): ?>
        <p class="empty">Nothing here yet.</p>
    <?php else: ?>
        <?php // Typing here hides the rows that do not match. Every cell is searched, so "draft" or a tag works too. ?>
        <input class="listing__filter" type="search" placeholder="Filter by title, tag or status…" autocomplete="off"
            aria-label="Filter <?= e($definition['label']) ?>" data-filter autofocus>
        <p class="listing__none" data-filter-none hidden>Nothing matches.</p>

        <table class="table" data-filter-table>
            <thead>
                <tr>
                    <th>Title</th>
                    <?php foreach ($columns as $column): ?>
                        <th><?= e($column['label']) ?></th>
                    <?php endforeach; ?>
                    <?php if ($hasDate): ?><th>Published</th><?php endif; ?>
                    <th>Edited</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($documents as $document): ?>
                    <tr>
                        <td class="table__title">
                            <a href="/admin/<?= e($definition['name']) ?>/<?= e($document['slug']) ?>"><?= e($document['title'] ?? $document['slug']) ?></a>
                            <?php if ($document['parse_error'] !== null): ?>
                                <span class="pill pill--error" title="<?= e($document['parse_error']) ?>">broken file</span>
                            <?php endif; ?>
                        </td>
                        <?php foreach ($columns as $column): ?>
                            <?php $value = $document['data'][$column['name']] ?? null; ?>
                            <td>
                                <?php if ($column['name'] === 'status' && $value !== null): ?>
                                    <span class="pill" data-status="<?= e($value) ?>"><?= e($value) ?></span>
                                <?php else: ?>
                                    <?= e(is_array($value) ? implode(', ', $value) : $value) ?>
                                <?php endif; ?>
                            </td>
                        <?php endforeach; ?>
                        <?php if ($hasDate): ?>
                            <td class="table__date"><?= e(substr((string) $document['published_at'], 0, 10)) ?></td>
                        <?php endif; ?>
                        <td class="table__date"><?= e(date('Y-m-d', (int) $document['updated_at'])) ?></td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    <?php endif; ?>
</div>
