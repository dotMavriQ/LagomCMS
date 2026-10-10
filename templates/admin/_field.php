<?php
/**
 * One row in the Properties panel: a label and the right control for the field.
 *
 * This file is pulled in with `require`, so it shares its variables with the page
 * around it (edit.php). Mind the names used for loops in here: one called $row
 * would overwrite the page's own $row, the document being edited.
 *
 * Every control carries data-field (the field's name) and data-kind (how the
 * editor's JavaScript should read its value back when saving).
 *
 * @var array<string, mixed>             $field   from the collection definition
 * @var mixed                            $value   what the document currently holds
 * @var array<string, list<array<string, mixed>>> $choices documents a relation field may point at
 * @var string                           $siteUrl where the public website is, for previews of its own images
 */
$name = $field['name'];
$id = 'field-' . $name;
$isEmpty = $value === null || $value === '' || $value === [] || $value === false;

// Fields that print their help text underneath do not also need it as a tooltip.
$showsHelp = in_array($field['type'], ['rows', 'asset'], true);
?>
<div class="prop<?= $field['quiet'] && $isEmpty ? ' prop--quiet' : '' ?><?= $field['type'] === 'rows' ? ' prop--wide' : '' ?>"<?= isset($field['help']) && !$showsHelp ? ' title="' . e($field['help']) . '"' : '' ?>>
    <label class="prop__label" for="<?= e($id) ?>"><?= e($field['label']) ?><?= $field['required'] ? ' <abbr title="required">*</abbr>' : '' ?></label>

    <div class="prop__value">
        <?php if ($field['multiple']): ?>
            <?php // One box per entry. The script keeps an empty one at the end to type the next into. ?>
            <ul class="rows" data-field="<?= e($name) ?>" data-kind="list">
                <?php foreach (array_merge(is_array($value) ? $value : [], ['']) as $i => $item): ?>
                    <li><textarea rows="1" data-autogrow<?= $i === 0 ? ' id="' . e($id) . '"' : '' ?> placeholder="Add…"><?= e($item) ?></textarea></li>
                <?php endforeach; ?>
            </ul>

        <?php elseif ($field['type'] === 'rows'): ?>
            <?php
            // A list of small records. Two looks, same data:
            //   - the default is a compact table, one line per record (link buttons);
            //   - 'layout' => 'cards' shows each record as a card: a preview of how it will
            //     look, with an Edit button that opens its fields in a dialog.
            // Either way the script makes new records by copying the <template> at the bottom.
            $asCards = ($field['layout'] ?? '') === 'cards';

            /** One control for one column of one record. */
            $printCell = static function (array $column, mixed $cell): void {
                $name = $column['name'];
                if (($column['type'] ?? 'text') === 'boolean') {
                    ?>
                    <label class="rowset__check" title="<?= e($column['help'] ?? $column['label']) ?>">
                        <input type="checkbox" data-column="<?= e($name) ?>"<?= $cell === true ? ' checked' : '' ?>>
                        <?= e($column['label']) ?>
                    </label>
                    <?php
                } elseif (isset($column['options'])) {
                    ?>
                    <select data-column="<?= e($name) ?>" aria-label="<?= e($column['label']) ?>">
                        <?php foreach ($column['options'] as $i => $option): ?>
                            <?php // With nothing chosen yet, the first option is the one in force. ?>
                            <option value="<?= e($option) ?>"<?= $option === ($cell ?? $column['options'][0]) ? ' selected' : '' ?>>
                                <?= e($column['option_labels'][$option] ?? ($option === '' ? 'no icon' : $option)) ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                    <?php
                } elseif ($column['long'] ?? false) {
                    ?>
                    <textarea rows="3" data-column="<?= e($name) ?>" placeholder="<?= e($column['label']) ?>"
                        aria-label="<?= e($column['label']) ?>"><?= e(is_scalar($cell) ? $cell : '') ?></textarea>
                    <?php
                } else {
                    ?>
                    <input type="text" data-column="<?= e($name) ?>" value="<?= e(is_scalar($cell) ? $cell : '') ?>"
                        placeholder="<?= e($column['label']) ?>" aria-label="<?= e($column['label']) ?>" spellcheck="false">
                    <?php
                }
            };

            $printRow = static function (array $columns, array $record) use ($asCards, $printCell): void {
                if (!$asCards) {
                    ?>
                    <div class="rowset__row">
                        <?php foreach ($columns as $column): ?>
                            <?php $printCell($column, $record[$column['name']] ?? null); ?>
                        <?php endforeach; ?>
                        <button class="block__button" type="button" data-row-up title="Move up">↑</button>
                        <button class="block__button" type="button" data-row-remove title="Remove">✕</button>
                    </div>
                    <?php
                    return;
                }
                ?>
                <div class="rowset__row card">
                    <div class="card__bar">
                        <span class="card__grip" title="Drag to reorder" aria-hidden="true">⠿</span>
                        <button class="block__button" type="button" data-row-up title="Move earlier">←</button>
                        <button class="block__button" type="button" data-row-down title="Move later">→</button>
                        <button class="block__button" type="button" data-card-edit>Edit</button>
                        <button class="block__button" type="button" data-row-remove title="Remove this card">✕</button>
                    </div>

                    <?php // What the card will look like. Drawn by the script from the fields below. ?>
                    <div class="card__view" data-card-view></div>

                    <?php // The card's fields. They live here, in the card, and this dialog is how you get at them. ?>
                    <dialog class="dialog" data-card-dialog>
                        <div class="dialog__form">
                            <h2 class="dialog__title">Edit card</h2>
                            <?php foreach ($columns as $column): ?>
                                <div class="dialog__row" data-for="<?= e($column['name']) ?>">
                                    <?php if (($column['type'] ?? 'text') !== 'boolean'): ?>
                                        <span class="dialog__label"><?= e($column['label']) ?></span>
                                    <?php endif; ?>
                                    <?php $printCell($column, $record[$column['name']] ?? null); ?>
                                    <small class="dialog__hint"><?= e($column['help'] ?? '') ?></small>
                                </div>
                            <?php endforeach; ?>
                            <p class="dialog__error" data-card-error hidden></p>
                            <div class="dialog__actions">
                                <button class="button" type="button" data-card-cancel>Cancel</button>
                                <button class="button button--primary" type="button" data-card-done>Done</button>
                            </div>
                        </div>
                    </dialog>
                </div>
                <?php
            };
            ?>
            <div class="rowset<?= $asCards ? ' rowset--cards' : '' ?>" data-field="<?= e($name) ?>" data-kind="rows"<?= $asCards ? ' data-layout="cards"' : '' ?>>
                <?php foreach (is_array($value) ? $value : [] as $entry): ?>
                    <?php $printRow($field['columns'], is_array($entry) ? $entry : []); ?>
                <?php endforeach; ?>
                <template><?php $printRow($field['columns'], []); ?></template>
                <?php if ($asCards): ?>
                    <button class="card card--add" type="button" data-row-add><?= icon('plus') ?> Add card</button>
                <?php endif; ?>
            </div>
            <?php if (isset($field['help'])): ?>
                <small class="prop__help"><?= e($field['help']) ?></small>
            <?php endif; ?>

        <?php elseif ($field['type'] === 'asset'): ?>
            <?php
            // An uploaded image. Its /media/... address is kept in data-value for the script.
            //
            // With nothing uploaded, the site uses an image of its own. 'builtin' is where
            // on the site that image is, so the field shows what is actually on the page
            // right now. It is fetched from the site itself: the CMS ships no pictures, and
            // a site that has no image of its own for this simply shows "none".
            $uploaded = is_string($value) ? $value : '';
            $builtin = isset($field['builtin']) ? rtrim($siteUrl, '/') . $field['builtin'] : '';
            $shown = $uploaded !== '' ? $uploaded : $builtin;
            ?>
            <div class="asset" data-field="<?= e($name) ?>" data-kind="asset" data-value="<?= e($uploaded) ?>" data-builtin="<?= e($builtin) ?>">
                <img class="asset__preview" src="<?= e($shown) ?>" alt=""<?= $shown === '' ? ' hidden' : '' ?>>
                <span class="asset__default"<?= $uploaded !== '' ? ' hidden' : '' ?>>the site's own</span>
                <button class="button" type="button" id="<?= e($id) ?>" data-asset-upload>Replace</button>
                <button class="button" type="button" data-asset-clear<?= $uploaded === '' ? ' hidden' : '' ?>>Back to the site's own</button>
                <input type="file" accept="<?= e(implode(',', $field['accept'] ?? ['image/*'])) ?>" hidden>
            </div>
            <?php if (isset($field['help'])): ?>
                <small class="prop__help"><?= e($field['help']) ?></small>
            <?php endif; ?>

        <?php elseif ($field['type'] === 'boolean'): ?>
            <input type="checkbox" id="<?= e($id) ?>" data-field="<?= e($name) ?>" data-kind="boolean"<?= $value === true ? ' checked' : '' ?>>

        <?php elseif ($field['type'] === 'select'): ?>
            <select id="<?= e($id) ?>" data-field="<?= e($name) ?>" data-kind="text">
                <?php foreach ($field['options'] as $option): ?>
                    <option<?= $option === $value ? ' selected' : '' ?>><?= e($option) ?></option>
                <?php endforeach; ?>
            </select>

        <?php elseif ($field['type'] === 'relation'): ?>
            <select id="<?= e($id) ?>" data-field="<?= e($name) ?>" data-kind="text">
                <option value="">—</option>
                <?php foreach ($choices[$name] ?? [] as $choice): ?>
                    <option value="<?= e($choice['slug']) ?>"<?= $choice['slug'] === $value ? ' selected' : '' ?>><?= e($choice['title'] ?? $choice['slug']) ?></option>
                <?php endforeach; ?>
            </select>

        <?php elseif ($field['type'] === 'datetime'): ?>
            <?php // The stored value rides along in data-iso; the script shows it in local time. ?>
            <input type="datetime-local" step="1" id="<?= e($id) ?>" data-field="<?= e($name) ?>" data-kind="datetime" data-iso="<?= e($value) ?>">

        <?php elseif ($field['type'] === 'number'): ?>
            <input type="number" step="any" id="<?= e($id) ?>" data-field="<?= e($name) ?>" data-kind="text" value="<?= e($value) ?>">

        <?php else: ?>
            <textarea rows="1" id="<?= e($id) ?>" data-field="<?= e($name) ?>" data-kind="text" data-autogrow
                placeholder="Empty"><?= e(is_scalar($value) ? $value : '') ?></textarea>
        <?php endif; ?>
    </div>
</div>
