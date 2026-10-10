<?php

declare(strict_types=1);

namespace Lagom\Api;

use Lagom\Collections;
use Lagom\Http\Response;
use Lagom\Index\Index;
use Lagom\Role;

/**
 * The read side of the JSON API. This is what the website is built from.
 *
 *     GET /api/v1/collections           the content model
 *     GET /api/v1/system/health         is anybody home
 *     GET /api/v1/<collection>          a page of documents, without their bodies
 *                                       (add ?include=blocks to get the bodies too)
 *     GET /api/v1/<collection>/<slug>   one document, body included
 *
 * A singleton (site, home, cv, ...) has one document and no slug, so listing it
 * returns that document directly.
 *
 * The response shapes are a contract with the frontend and are checked against
 * saved production responses by tests/api.php.
 */
final class ReadApi
{
    private const WORDS_PER_MINUTE = 220;
    private const DEFAULT_PAGE_SIZE = 100;
    private const MAX_PAGE_SIZE = 500;

    public function __construct(
        private readonly Collections $collections,
        private readonly Index $index,
    ) {
    }

    /**
     * @param string               $path  the part after /api/v1/, e.g. "posts/hello-world"
     * @param array<string, mixed> $query the parsed query string
     * @param Role|null            $role  who is asking; null for an anonymous visitor
     */
    public function handle(string $path, array $query, ?Role $role): Response
    {
        $segments = explode('/', trim($path, '/'));

        if ($segments === ['collections']) {
            return $this->describeCollections();
        }
        if ($segments === ['system', 'health']) {
            return Response::json(200, ['status' => 'ok', 'documents' => $this->index->count()]);
        }
        if (count($segments) === 1 && $segments[0] !== '') {
            return $this->list($segments[0], $query, $role);
        }
        if (count($segments) === 2) {
            return $this->show($segments[0], $segments[1], $role);
        }

        return Response::error(404, 'not_found', 'No such endpoint.');
    }

    private function describeCollections(): Response
    {
        $data = [];
        foreach ($this->collections->all() as $definition) {
            // Access rules and the SEO switch are our business, not the client's.
            unset($definition['access'], $definition['seo']);
            $data[] = $definition;
        }

        return Response::json(200, ['data' => $data]);
    }

    /** @param array<string, mixed> $query */
    private function list(string $collection, array $query, ?Role $role): Response
    {
        $definition = $this->collections->get($collection);
        if ($definition === null) {
            return Response::error(400, 'validation_failed', "Unknown collection '$collection'.");
        }
        if ($definition['singleton']) {
            return $this->show($collection, $collection, $role);
        }

        $sort = is_string($query['sort'] ?? null) ? $query['sort'] : '-published_at';
        if (!$this->canSortOn($definition, ltrim($sort, '-'))) {
            return Response::error(400, 'validation_failed', "Cannot sort on '" . ltrim($sort, '-') . "'.");
        }

        // ?page[size]=20&page[number]=2
        $page = is_array($query['page'] ?? null) ? $query['page'] : [];
        $size = max(1, min(self::MAX_PAGE_SIZE, (int) ($page['size'] ?? self::DEFAULT_PAGE_SIZE)));
        $number = max(1, (int) ($page['number'] ?? 1));

        // Anonymous visitors only ever see published documents. That is decided in
        // the query, not afterwards, so a page is always full and "has more" is
        // always true to what the visitor can actually reach.
        $publishedOnly = $definition['access']['read'] === 'published' && $role === null;

        $result = $this->index->list($collection, $sort, $size, ($number - 1) * $size, $publishedOnly);

        // Bodies are left out unless asked for. The blog index asks, because it
        // needs every post's reading time and headings; a menu of titles would not.
        $withBody = ($query['include'] ?? '') === 'blocks';

        $data = [];
        foreach ($result['rows'] as $row) {
            $data[] = $this->present($row, $withBody);
        }

        return Response::json(200, [
            'data' => $data,
            'meta' => ['count' => count($data), 'has_more' => $result['hasMore'], 'page' => $number],
        ]);
    }

    private function show(string $collection, string $slug, ?Role $role): Response
    {
        $row = $this->index->find($collection, $slug);
        if ($row === null) {
            return Response::error(404, 'not_found', "No document at $collection/$slug.");
        }

        if (!$this->collections->allows($collection, 'read', $role, $row['status'])) {
            return Response::error(401, 'unauthenticated', 'not permitted');
        }

        return Response::json(200, ['data' => $this->present($row, true)]);
    }

    /**
     * Turn an index row into the document the API serves.
     *
     * Listings leave the body out. Sending every post's full text to draw a list of
     * titles is the easiest way there is to make a listing slow.
     *
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>
     */
    private function present(array $row, bool $withBody): array
    {
        $fields = json_decode($row['fields'], true);

        $document = [
            'id' => $row['collection'] . '/' . $row['slug'],
            'collection' => $row['collection'],
            'slug' => $row['slug'],
            'locale' => 'en',
            'hash' => $row['hash'],
            // An empty PHP array would go out as [] and clients expect an object here.
            'fields' => $fields === [] ? new \stdClass() : $fields,
            'excerpt' => $row['excerpt'],
            'updated_at' => (int) $row['updated_at'],
            // Resolved here so every frontend applies the same fallbacks: the SEO
            // title falls back to the title, the description to the excerpt.
            'seo' => [
                'title' => $fields['seo_title'] ?? $fields['title'] ?? $row['slug'],
                'description' => $fields['seo_description'] ?? $row['excerpt'],
                'noindex' => ($fields['noindex'] ?? false) === true || ($fields['noindex'] ?? false) === 'true',
            ],
        ];

        if ($row['status'] !== null) {
            $document['status'] = $row['status'];
        }
        if (isset($fields['canonical'])) {
            $document['seo']['canonical'] = $fields['canonical'];
        }
        if ($row['parse_error'] !== null) {
            $document['parse_error'] = $row['parse_error'];
        }

        // Uploaded images the fields refer to, with their sizes. Left out entirely
        // when there are none, which is most documents.
        $assets = json_decode($row['assets'], true);
        if ($assets !== []) {
            $document['assets'] = $assets;
        }

        if ($withBody) {
            $words = (int) $row['words'];
            $document['blocks'] = json_decode($row['blocks'], true);
            $document['translations'] = ['en'];
            $document['reading_time'] = [
                'words' => $words,
                'minutes' => max(1, (int) floor($words / self::WORDS_PER_MINUTE + 0.5)),
            ];
        }

        return $document;
    }

    /**
     * Sorting is allowed on the handful of built-in keys and on any field the
     * collection marked as sortable. The name ends up inside a SQL statement, so
     * this check is also what keeps that safe.
     *
     * @param array<string, mixed> $definition
     */
    private function canSortOn(array $definition, string $name): bool
    {
        if (in_array($name, ['published_at', 'updated_at', 'title', 'slug'], true)) {
            return true;
        }
        foreach ($definition['fields'] as $field) {
            if ($field['name'] === $name) {
                return $field['sortable'];
            }
        }

        return false;
    }
}
