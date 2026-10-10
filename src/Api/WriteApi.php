<?php

declare(strict_types=1);

namespace Lagom\Api;

use Lagom\Auth\User;
use Lagom\Collections;
use Lagom\Content\Conflict;
use Lagom\Content\Fields;
use Lagom\Content\Media;
use Lagom\Content\Writer;
use Lagom\Http\Request;
use Lagom\Http\Response;
use Lagom\Index\Index;

/**
 * The write side of the JSON API. This is what the editor talks to.
 *
 *     POST   /api/v1/<collection>                 create   {slug, fields, body}
 *     PUT    /api/v1/<collection>/<slug>          save     {base_hash, fields, body}
 *     DELETE /api/v1/<collection>/<slug>          move to the trash
 *     GET    /api/v1/<collection>/<slug>/media    list uploaded files
 *     POST   /api/v1/<collection>/<slug>/media    upload one (multipart, field "file")
 *
 * "body" is the Markdown source, exactly as typed. The editor never sends blocks;
 * the file on disk is Markdown and stays the single source of truth.
 *
 * Everything here needs a signed-in user. App checks the CSRF token before any
 * of these methods run.
 */
final class WriteApi
{
    public function __construct(
        private readonly Collections $collections,
        private readonly Index $index,
        private readonly Writer $writer,
    ) {
    }

    /** @param list<string> $segments the path after /api/v1/, split on "/" */
    public function handle(Request $request, array $segments, User $user): Response
    {
        $collection = $segments[0] ?? '';
        $definition = $this->collections->get($collection);
        if ($definition === null) {
            return Response::error(400, 'validation_failed', "Unknown collection '$collection'.");
        }

        // A singleton has no slug of its own; its collection name stands in.
        $slug = $segments[1] ?? ($definition['singleton'] ? $collection : '');

        if (($segments[2] ?? '') === 'media' && count($segments) === 3) {
            return $this->media($request, $collection, $slug, $user);
        }
        if (count($segments) > 2) {
            return Response::error(404, 'not_found', 'No such endpoint.');
        }

        return match (true) {
            $request->method === 'POST' && count($segments) === 1 => $this->create($request, $definition, $user),
            $request->method === 'PUT' && $slug !== '' => $this->update($request, $definition, $slug, $user),
            $request->method === 'DELETE' && $slug !== '' => $this->delete($collection, $slug, $user),
            default => Response::error(405, 'method_not_allowed', 'That method is not supported here.'),
        };
    }

    /** @param array<string, mixed> $definition */
    private function create(Request $request, array $definition, User $user): Response
    {
        $collection = $definition['name'];
        if (!$this->collections->allows($collection, 'create', $user->role)) {
            return Response::error(403, 'unauthorized', 'You may not create documents here.');
        }

        $input = $request->json();
        if ($input === null) {
            return Response::error(400, 'validation_failed', 'A JSON body is required.');
        }

        $slug = (string) ($input['slug'] ?? '');
        if (!Writer::isValidSlug($slug)) {
            return Response::error(422, 'validation_failed', 'The slug may only hold lowercase letters, digits, hyphens and underscores.');
        }

        $submitted = $this->withDefaults($definition, (array) ($input['fields'] ?? []));
        [$fields, $errors] = Fields::clean($definition, $submitted);

        // A new document starts as a stub: a title and little else. Complaining now
        // about every required field it has not got yet would make "New post"
        // impossible, so only what was actually sent is held to the rules. The
        // first real save from the editor checks the lot.
        $errors = array_intersect_key($errors, $submitted);
        if ($errors !== []) {
            return Response::json(422, ['error' => 'validation_failed', 'message' => implode(' ', $errors), 'fields' => $errors]);
        }

        try {
            $this->writer->create($collection, $slug, $fields, (string) ($input['body'] ?? ''));
        } catch (Conflict $e) {
            return Response::error(409, 'conflict', $e->getMessage());
        }

        return $this->saved(201, $collection, $slug);
    }

    /** @param array<string, mixed> $definition */
    private function update(Request $request, array $definition, string $slug, User $user): Response
    {
        $collection = $definition['name'];
        if (!$this->collections->allows($collection, 'update', $user->role)) {
            return Response::error(403, 'unauthorized', 'You may not edit documents here.');
        }
        if ($this->index->find($collection, $slug) === null) {
            return Response::error(404, 'not_found', "No document at $collection/$slug.");
        }

        $input = $request->json();
        if ($input === null || !is_string($input['base_hash'] ?? null)) {
            return Response::error(400, 'validation_failed', 'A JSON body with base_hash is required.');
        }

        [$fields, $errors] = Fields::clean($definition, (array) ($input['fields'] ?? []));
        if ($errors !== []) {
            return Response::json(422, ['error' => 'validation_failed', 'message' => implode(' ', $errors), 'fields' => $errors]);
        }

        // A collection without a body ignores whatever body was sent.
        $body = $definition['body']['enabled'] ? (string) ($input['body'] ?? '') : '';

        try {
            $known = array_column($definition['fields'], 'name');
            $this->writer->update($collection, $slug, $fields, $known, $body, $input['base_hash']);
        } catch (Conflict $e) {
            $current = $this->index->find($collection, $slug);

            return Response::json(409, [
                'error' => 'stale_base',
                'message' => $e->getMessage(),
                'current_hash' => $current['hash'] ?? null,
            ]);
        }

        return $this->saved(200, $collection, $slug);
    }

    private function delete(string $collection, string $slug, User $user): Response
    {
        if (!$this->collections->allows($collection, 'delete', $user->role)) {
            return Response::error(403, 'unauthorized', 'You may not delete documents here.');
        }
        if ($this->index->find($collection, $slug) === null) {
            return Response::error(404, 'not_found', "No document at $collection/$slug.");
        }

        $this->writer->trash($collection, $slug);
        $this->index->refresh();

        return Response::json(200, ['data' => ['deleted' => "$collection/$slug"]]);
    }

    private function media(Request $request, string $collection, string $slug, User $user): Response
    {
        if ($slug === '' || $this->index->find($collection, $slug) === null) {
            return Response::error(404, 'not_found', "No document at $collection/$slug.");
        }

        $directory = $this->writer->directory($collection, $slug);
        $baseUrl = '/media/' . $collection . '/' . $slug . '/';

        if ($request->method === 'GET') {
            $files = Media::list($directory);
            foreach ($files as $i => $file) {
                $files[$i]['url'] = $baseUrl . $file['name'];
            }

            return Response::json(200, ['data' => $files]);
        }

        if ($request->method !== 'POST') {
            return Response::error(405, 'method_not_allowed', 'That method is not supported here.');
        }
        if (!$this->collections->allows($collection, 'update', $user->role)) {
            return Response::error(403, 'unauthorized', 'You may not upload files here.');
        }

        $stored = Media::store($request->files['file'] ?? [], $directory);
        if (is_string($stored)) {
            return Response::error(422, 'validation_failed', $stored);
        }

        return Response::json(201, ['data' => $stored + ['url' => $baseUrl . $stored['name']]]);
    }

    /**
     * Re-index and answer with the document as it now is on disk, so the editor
     * gets the new hash to base its next save on.
     */
    private function saved(int $status, string $collection, string $slug): Response
    {
        $this->index->refresh();
        $row = $this->index->find($collection, $slug);

        return Response::json($status, ['data' => [
            'id' => "$collection/$slug",
            'collection' => $collection,
            'slug' => $slug,
            'hash' => $row['hash'],
            'status' => $row['status'],
            'updated_at' => (int) $row['updated_at'],
            'words' => (int) $row['words'],
            'fields' => json_decode($row['fields'], true) ?: new \stdClass(),
        ]]);
    }

    /**
     * Fill in the defaults a collection declares (status "draft", for one) for
     * fields a new document did not mention.
     *
     * @param array<string, mixed> $definition
     * @param array<string, mixed> $fields
     *
     * @return array<string, mixed>
     */
    private function withDefaults(array $definition, array $fields): array
    {
        foreach ($definition['fields'] as $field) {
            if (!isset($fields[$field['name']]) && isset($field['default'])) {
                $fields[$field['name']] = $field['default'];
            }
        }

        return $fields;
    }
}
