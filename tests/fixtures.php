<?php

declare(strict_types=1);

/**
 * Does our parser produce what production serves?
 *
 * reference/<snapshot>/api/ holds real responses saved from the live site, and
 * reference/<snapshot>/content/ holds the Markdown files those responses were built
 * from. This script parses each file and compares the result with the saved
 * response, field by field.
 *
 *     php tests/fixtures.php            every document
 *     php tests/fixtures.php breaking   only documents whose path contains "breaking"
 *
 * Exit code 0 means every document matched.
 */

use Lagom\Content\Blocks;
use Lagom\Content\FrontMatter;

require __DIR__ . '/../vendor/autoload.php';

// The recorded responses are one real site's content, so they are not in this repository.
// Point LAGOM_SNAPSHOT at a folder with api/ and content/ in it to run against your own.
$snapshot = getenv('LAGOM_SNAPSHOT') ?: __DIR__ . '/../reference/snapshot';
if (!is_dir($snapshot)) {
    echo "No snapshot at $snapshot, nothing to check. Set LAGOM_SNAPSHOT to run this.\n";
    exit(0);
}
$only = $argv[1] ?? '';

/**
 * The old CMS wrote an empty list as {} (a Lua quirk), we write []. Both mean
 * "nothing here", so they are folded together before comparing.
 */
function normalise(mixed $value): mixed
{
    if (!is_array($value)) {
        return $value;
    }
    $out = [];
    foreach ($value as $key => $item) {
        $out[$key] = normalise($item);
    }
    if (!array_is_list($out)) {
        ksort($out);
    }

    return $out;
}

/** The path to the first place two values differ, or null when they are equal. */
function firstDifference(mixed $expected, mixed $actual, string $path = ''): ?string
{
    if (is_array($expected) && is_array($actual)) {
        foreach (array_unique(array_merge(array_keys($expected), array_keys($actual))) as $key) {
            if (!array_key_exists($key, $expected)) {
                return "$path.$key: unexpected " . json_encode($actual[$key]);
            }
            if (!array_key_exists($key, $actual)) {
                return "$path.$key: missing " . json_encode($expected[$key]);
            }
            $difference = firstDifference($expected[$key], $actual[$key], "$path.$key");
            if ($difference !== null) {
                return $difference;
            }
        }

        return null;
    }

    return $expected === $actual
        ? null
        : "$path:\n      expected " . json_encode($expected) . "\n      actual   " . json_encode($actual);
}

$blocks = new Blocks();
$checked = 0;
$failed = 0;

foreach (glob("$snapshot/api/*/*.json") as $fixture) {
    if ($only !== '' && !str_contains($fixture, $only)) {
        continue;
    }

    $expected = json_decode(file_get_contents($fixture), true)['data'] ?? null;

    // Listings (a list of documents) and refusals (archived posts) are not single
    // documents. The API tests cover those.
    if (!is_array($expected) || array_is_list($expected) || !isset($expected['slug'])) {
        continue;
    }

    $collection = $expected['collection'];
    $slug = $expected['slug'];
    $file = $collection === $slug
        ? "$snapshot/content/$collection/index.md"
        : "$snapshot/content/$collection/$slug/index.md";

    $contents = file_get_contents($file);
    [$yaml, $body] = FrontMatter::split($contents);
    $parsed = $blocks->parse($body);

    $actual = [
        'hash' => hash('sha256', $contents),
        'fields' => FrontMatter::parse($yaml),
        'blocks' => $parsed,
        'excerpt' => Blocks::toText($parsed, 200),
        'words' => Blocks::countWords($parsed),
        'updated_at' => filemtime($file),
    ];
    $wanted = [
        'hash' => $expected['hash'],
        'fields' => $expected['fields'],
        'blocks' => $expected['blocks'] ?? [],
        'excerpt' => $expected['excerpt'],
        'words' => $expected['reading_time']['words'],
        'updated_at' => $expected['updated_at'],
    ];

    $checked++;
    $difference = firstDifference(normalise($wanted), normalise($actual));
    if ($difference !== null) {
        $failed++;
        echo "FAIL $collection/$slug\n    $difference\n";
    }
}

echo "\n$checked documents checked, $failed failed\n";
exit($failed === 0 ? 0 : 1);
