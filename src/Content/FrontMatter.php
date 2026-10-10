<?php

declare(strict_types=1);

namespace Lagom\Content;

use Symfony\Component\Yaml\Exception\ParseException;
use Symfony\Component\Yaml\Yaml;

/**
 * Front matter: the YAML between the two `---` lines at the top of a content file.
 *
 * Every document on disk looks like this:
 *
 *     ---
 *     title: "Going European"
 *     status: published
 *     ---
 *
 *     The Markdown body starts here.
 *
 * This class does exactly two jobs: cut a file into (front matter, body), and turn
 * the front matter into a plain array of fields. It knows nothing about collections
 * or validation. That happens later, once we know which collection the file is in.
 */
final class FrontMatter
{
    /**
     * Cut raw file contents into the YAML source and the Markdown body.
     *
     * The opening `---` has to be the very first line of the file. That one rule is
     * what stops a horizontal rule halfway down a post from being mistaken for front
     * matter. A file with no front matter at all is fine: you get '' and the whole
     * file back as the body.
     *
     * @return array{0: string, 1: string} [yaml source, markdown body]
     */
    public static function split(string $contents): array
    {
        // The usual case: front matter, closing line, then a body.
        if (preg_match('/\A---[ \t]*\r?\n(.*?)\r?\n---[ \t]*\r?\n/s', $contents, $found)) {
            return [$found[1], substr($contents, strlen($found[0]))];
        }

        // Fields only, nothing after the closing line. CV entries look like this.
        if (preg_match('/\A---[ \t]*\r?\n(.*?)\r?\n---[ \t]*\z/s', $contents, $found)) {
            return [$found[1], ''];
        }

        return ['', $contents];
    }

    /**
     * Parse the YAML source into fields.
     *
     * Throws ParseException on broken YAML. The caller decides what to do with that;
     * a broken file should show up in the admin with its error, never just vanish.
     *
     * @return array<string, mixed>
     *
     * @throws ParseException
     */
    public static function parse(string $yaml): array
    {
        if (trim($yaml) === '') {
            return [];
        }

        $fields = Yaml::parse(self::keepDatesAsText($yaml));

        // `---\njust a string\n---` is valid YAML and useless to us.
        return is_array($fields) ? $fields : [];
    }

    /**
     * The key names in the order the author wrote them.
     *
     * Saved files keep this order, so editing a post in the admin does not reshuffle
     * the front matter and bury the real change in a noisy diff.
     *
     * @return list<string>
     */
    public static function keyOrder(string $yaml): array
    {
        preg_match_all('/^([\w-]+):/m', $yaml, $found);

        return $found[1];
    }

    /**
     * Write fields back out as YAML, ready to sit between the `---` lines.
     *
     * $order lists the keys in the order they should appear; keys it does not
     * mention follow at the end. Lists are written one item per line and long
     * text with line breaks (the home page's ASCII art) as a literal block, so the
     * file stays pleasant to read and to diff.
     *
     * @param array<string, mixed> $fields
     * @param list<string>         $order
     */
    public static function dump(array $fields, array $order = []): string
    {
        $sorted = [];
        foreach ($order as $key) {
            if (array_key_exists($key, $fields)) {
                $sorted[$key] = $fields[$key];
            }
        }
        $sorted += $fields;

        if ($sorted === []) {
            return '';
        }

        return Yaml::dump($sorted, 2, 2, Yaml::DUMP_MULTI_LINE_LITERAL_BLOCK);
    }

    /**
     * Stop the YAML parser from "helping" with dates.
     *
     * Symfony reads an unquoted `published_at: 2026-01-02T09:00:00Z` as a timestamp
     * and hands back an integer. We want the string exactly as written: it goes out
     * through the API untouched, and it gets written back to the file on save.
     * Quoting the value before parsing is the least clever way to get that.
     */
    private static function keepDatesAsText(string $yaml): string
    {
        return preg_replace(
            '/^([\w-]+):[ \t]+(\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?)[ \t]*$/m',
            '$1: "$2"',
            $yaml
        ) ?? $yaml;
    }
}
