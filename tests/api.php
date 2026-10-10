<?php

declare(strict_types=1);

/**
 * Does the API answer the way production does?
 *
 * Replays every response saved under reference/<snapshot>/api/ against our own
 * ReadApi (called directly, no web server needed) and compares the two.
 *
 *     php tests/api.php
 *
 * One difference is on purpose. The old CMS cut a listing at 20 rows *before*
 * hiding drafts, so the blog list came back with 15 posts out of 24. Ours returns
 * them all. So a listing is checked for holding every document production showed,
 * each one identical, and not for being the same page with the same paging info.
 */

use Lagom\Api\ReadApi;
use Lagom\Collections;
use Lagom\Index\Index;

require __DIR__ . '/../vendor/autoload.php';

$root = dirname(__DIR__);
// The recorded responses are one real site's content, so they are not in this repository.
// Point LAGOM_SNAPSHOT at a folder with api/ and content/ in it to run against your own.
$snapshot = getenv('LAGOM_SNAPSHOT') ?: $root . '/reference/snapshot';
if (!is_dir($snapshot)) {
    echo "No snapshot at $snapshot, nothing to check. Set LAGOM_SNAPSHOT to run this.\n";
    exit(0);
}

// Index the snapshot's own content, into a throwaway database, so the test does
// not depend on (or disturb) whatever is being edited in content/ right now.
$database = sys_get_temp_dir() . '/lagom-test-' . getmypid() . '.sqlite';
$collections = new Collections($root . '/collections');
$index = new Index($database, $snapshot . '/content', $collections);
$index->refresh();
$api = new ReadApi($collections, $index);

function normalise(mixed $value): mixed
{
    if ($value instanceof stdClass) {
        $value = (array) $value;
    }
    if (!is_array($value)) {
        return $value;
    }
    $out = array_map('normalise', $value);
    if (!array_is_list($out)) {
        ksort($out);
    }

    return $out;
}

$checked = 0;
$failures = [];

foreach (glob($snapshot . '/api/*/*.json') as $fixture) {
    $collection = basename(dirname($fixture));
    $name = basename($fixture, '.json');
    $path = $name === '_index' ? $collection : "$collection/$name";

    $expected = json_decode(file_get_contents($fixture), true);
    $response = $api->handle($path, [], null);
    $actual = json_decode($response->body, true);
    $checked++;

    // A refusal (archived post): same status code, same body.
    if (isset($expected['error'])) {
        if ($response->status !== 401 || $actual !== $expected) {
            $failures[] = "$path: expected a 401 refusal, got $response->status $response->body";
        }
        continue;
    }

    // A listing: the documents production showed must all be there, each identical.
    if (array_is_list($expected['data'])) {
        $ours = array_column($actual['data'], null, 'slug');
        foreach ($expected['data'] as $document) {
            if (normalise($ours[$document['slug']] ?? null) !== normalise($document)) {
                $failures[] = "$path: listing entry {$document['slug']} differs";
            }
        }
        continue;
    }

    if (normalise($actual['data']) !== normalise($expected['data'])) {
        $failures[] = "$path: document differs";
    }
}

unlink($database);

foreach ($failures as $failure) {
    echo "FAIL $failure\n";
}
echo "\n$checked responses checked, " . count($failures) . " failed\n";
exit($failures === [] ? 0 : 1);
