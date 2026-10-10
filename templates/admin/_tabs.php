<?php
/**
 * Tabs for a screen made of several collections. The CV is the one example today:
 * Header, Entries, Skills, References. A collection with no relatives has a family
 * of one and gets no tabs at all.
 *
 * @var list<array<string, mixed>> $tabs       the family, parent first
 * @var array<string, mixed>       $definition the collection being looked at
 */
if (count($tabs) < 2) {
    return;
}
?>
<nav class="tabs" aria-label="Sections">
    <?php foreach ($tabs as $tab): ?>
        <a class="tabs__tab" href="/admin/<?= e($tab['name']) ?>"<?= $tab['name'] === $definition['name'] ? ' aria-current="page"' : '' ?>>
            <?= e($tab['parent'] === null ? $tab['tab'] : $tab['label']) ?>
        </a>
    <?php endforeach; ?>
</nav>
