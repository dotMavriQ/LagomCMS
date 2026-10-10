<?php

declare(strict_types=1);

namespace Lagom\Content;

/**
 * Checks and tidies the fields somebody submitted for a document.
 *
 * The editor sends whatever was in its form: numbers arrive as strings, an
 * untouched text box arrives as '', a list may have blank rows. This turns that
 * into what belongs in a content file, using the collection's field list as the
 * rulebook, and collects a readable complaint for anything that cannot be fixed.
 */
final class Fields
{
    /**
     * @param array<string, mixed> $definition a collection definition
     * @param array<string, mixed> $submitted  field name => raw value
     *
     * @return array{0: array<string, mixed>, 1: array<string, string>} [clean fields, errors by field name]
     */
    public static function clean(array $definition, array $submitted): array
    {
        $clean = [];
        $errors = [];

        foreach ($definition['fields'] as $field) {
            $name = $field['name'];
            $value = self::cleanValue($field, $submitted[$name] ?? null);

            if ($value === null) {
                if ($field['required']) {
                    $errors[$name] = $field['label'] . ' is required.';
                }
                continue;
            }

            if ($field['type'] === 'select' && !in_array($value, $field['options'], true)) {
                $errors[$name] = $field['label'] . ' must be one of: ' . implode(', ', $field['options']) . '.';
                continue;
            }
            if ($field['type'] === 'datetime' && strtotime($value) === false) {
                $errors[$name] = $field['label'] . ' is not a date I can read.';
                continue;
            }

            $clean[$name] = $value;
        }

        return [$clean, $errors];
    }

    /**
     * A 'rows' field: a list of small records, such as the home page's link buttons.
     *
     * Each row keeps only the columns the field defines. A row with no text in it
     * at all is the editor's spare empty row (or one somebody cleared out) and is
     * dropped. Ticked boxes alone do not make a row.
     *
     * @param array<string, mixed> $field
     *
     * @return list<array<string, mixed>>|null
     */
    private static function cleanRows(array $field, mixed $value): ?array
    {
        $rows = [];
        foreach (is_array($value) ? $value : [] as $submitted) {
            if (!is_array($submitted)) {
                continue;
            }

            $row = [];
            $hasText = false;
            foreach ($field['columns'] as $column) {
                $cell = $submitted[$column['name']] ?? null;

                if (($column['type'] ?? 'text') === 'boolean') {
                    if ($cell === true || $cell === 'true' || $cell === '1') {
                        $row[$column['name']] = true;
                    }
                    continue;
                }

                $cell = is_scalar($cell) ? trim((string) $cell) : '';
                if (isset($column['options']) && !in_array($cell, $column['options'], true)) {
                    $cell = '';
                }
                if ($cell !== '') {
                    $row[$column['name']] = $cell;
                    $hasText = true;
                }
            }

            if ($hasText) {
                $rows[] = $row;
            }
        }

        return $rows === [] ? null : $rows;
    }

    /**
     * One value, tidied. Null means "nothing was entered", and the field is then
     * left out of the file altogether rather than written as an empty string.
     *
     * @param array<string, mixed> $field
     */
    private static function cleanValue(array $field, mixed $value): mixed
    {
        if ($field['type'] === 'rows') {
            return self::cleanRows($field, $value);
        }

        if ($field['multiple']) {
            $items = [];
            foreach (is_array($value) ? $value : [] as $item) {
                $item = is_scalar($item) ? trim((string) $item) : '';
                if ($item !== '') {
                    $items[] = $item;
                }
            }

            return $items === [] ? null : $items;
        }

        if ($field['type'] === 'boolean') {
            // An unticked box is a real answer ("no"), not a missing one. But writing
            // `featured: false` into every file is noise, so only "yes" is stored.
            return $value === true || $value === 'true' || $value === '1' || $value === 'on' ? true : null;
        }

        if (!is_scalar($value) || trim((string) $value) === '') {
            return null;
        }

        if ($field['type'] === 'number') {
            if (!is_numeric($value)) {
                return null;
            }

            // 3 stays 3 and does not become 3.0 in the file.
            return (float) $value == (int) $value ? (int) $value : (float) $value;
        }

        // Text keeps its inner whitespace (ASCII art depends on it); only the
        // line endings are normalised so Windows pastes do not sneak \r in.
        return str_replace("\r\n", "\n", (string) $value);
    }
}
