<?php

declare(strict_types=1);

namespace Lagom\Site;

use Lagom\Http\Response;

/**
 * Serves the published website: the folder of files that Builder produces.
 *
 * This is the simplest web server there is. A request for /blog/hello is answered
 * with the file blog/hello.html, and that is the whole job. It exists so that a
 * LagomCMS installation is one thing to run: the same PHP app serves the admin, the
 * API, the uploads and the site.
 *
 * On a busy site you would point nginx or Caddy at var/site/current and let it
 * serve these files itself, sending only /admin, /api and /media to PHP. Nothing
 * here needs to change for that; this class just stops being asked.
 */
final class StaticSite
{
    private const TYPES = [
        'html' => 'text/html; charset=utf-8',
        'css' => 'text/css; charset=utf-8',
        'js' => 'text/javascript; charset=utf-8',
        'mjs' => 'text/javascript; charset=utf-8',
        'json' => 'application/json; charset=utf-8',
        'xml' => 'application/xml; charset=utf-8',
        'txt' => 'text/plain; charset=utf-8',
        'webmanifest' => 'application/manifest+json',
        'svg' => 'image/svg+xml',
        'png' => 'image/png',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'webp' => 'image/webp',
        'avif' => 'image/avif',
        'gif' => 'image/gif',
        'ico' => 'image/x-icon',
        'woff2' => 'font/woff2',
        'woff' => 'font/woff',
        'pdf' => 'application/pdf',
    ];

    public function __construct(private readonly string $directory)
    {
    }

    public function exists(): bool
    {
        return is_file($this->directory . '/index.html');
    }

    public function serve(string $path): Response
    {
        $file = $this->find($path);
        if ($file !== null) {
            return $this->file($file, 200);
        }

        $forward = $this->forwardFor($path);
        if ($forward !== null) {
            return new Response($forward['status'], '', ['Location' => $forward['to']]);
        }

        // The site's own "not found" page, with the status that says so.
        $notFound = $this->directory . '/404.html';
        if (is_file($notFound)) {
            return $this->file($notFound, 404);
        }

        return Response::html(404, 'Not found.');
    }

    /**
     * The file a path stands for, or null.
     *
     * Pages are built as blog/hello.html but linked to as /blog/hello, so a path is
     * tried three ways: as it is, with .html added, and as a folder's index.html.
     */
    private function find(string $path): ?string
    {
        // Nothing outside the site folder, however the path is dressed up.
        if (str_contains($path, '..') || str_contains($path, "\0")) {
            return null;
        }

        $base = $this->directory . '/' . trim($path, '/');
        foreach ([$base, $base . '.html', rtrim($base, '/') . '/index.html'] as $candidate) {
            if (is_file($candidate)) {
                return $candidate;
            }
        }

        return null;
    }

    /**
     * Has this address moved? The build writes the list of forwards to
     * lagom-redirects.json (see the page of that name in the Astro package). It is
     * only read when no file matched, so ordinary page views never touch it.
     *
     * @return array{to: string, status: int}|null
     */
    private function forwardFor(string $path): ?array
    {
        $list = $this->directory . '/lagom-redirects.json';
        $forwards = is_file($list) ? json_decode((string) file_get_contents($list), true) : null;
        $forward = is_array($forwards) ? ($forwards[rtrim($path, '/')] ?? null) : null;

        if (!is_array($forward) || !is_string($forward['to'] ?? null)) {
            return null;
        }

        return ['to' => $forward['to'], 'status' => (int) ($forward['status'] ?? 302) === 301 ? 301 : 302];
    }

    private function file(string $file, int $status): Response
    {
        $extension = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        // A few generated files have no extension (see /defaults/ in the Astro package);
        // for those the first bytes of the file say what it is.
        $type = self::TYPES[$extension] ?? (mime_content_type($file) ?: 'application/octet-stream');

        $response = Response::file($file, $type);

        // Files under /_astro/ carry a fingerprint of their contents in their name, so a
        // given address never changes and browsers may keep it for good. Pages are the
        // opposite: always ask, so a publish is seen straight away.
        $cache = str_contains($file, '/_astro/')
            ? 'public, max-age=31536000, immutable'
            : (str_starts_with($type, 'text/html') ? 'no-cache' : 'public, max-age=3600');

        $response = $response->withHeader('Cache-Control', $cache);

        return $status === 200 ? $response : new Response($status, '', $response->headers, $file);
    }
}
