<?php

declare(strict_types=1);

namespace Lagom;

use Lagom\Admin\Admin;
use Lagom\Api\ReadApi;
use Lagom\Api\WriteApi;
use Lagom\Auth\Accounts;
use Lagom\Content\Media;
use Lagom\Content\Writer;
use Lagom\Http\Request;
use Lagom\Http\Response;
use Lagom\Index\Index;
use Lagom\Site\Builder;
use Lagom\Site\StaticSite;
use Lagom\Social\Feed;

/**
 * The application: takes a request, decides who should answer it, returns a response.
 *
 * There are four things a URL can belong to:
 *
 *     /api/v1/...   the JSON API. Reading is public, writing needs a login.
 *                   (/api/v1/social/... is the fediverse archive, see Social\Feed.)
 *     /media/...    uploaded images, served straight from the content folder.
 *     /admin/...    the editor and everything around it.
 *     anything else the public website: plain files, built from the content by the
 *                   Astro project whenever something is published (see Site\Builder).
 *
 * The parts are wired together by hand in the constructor. There is no container;
 * with this few objects, "new" is the clearest dependency injection there is.
 */
final class App
{
    private Collections $collections;
    private Index $index;
    private Accounts $accounts;
    private Writer $writer;
    private Builder $builder;

    /** @var array<string, mixed> */
    private array $config;

    /**
     * @param string $root where the CMS's own code is (this repository)
     * @param string $data where this installation keeps what is its own: content/ (the
     *                     site's pages and posts) and var/ (accounts, the index, the trash).
     *                     By default that is the same folder as the code. Pointing it
     *                     elsewhere (the LAGOM_DATA variable) lets one copy of the code
     *                     serve a site whose content lives in its own repository.
     */
    public function __construct(private readonly string $root, private readonly string $data)
    {
        foreach (['/content', '/var'] as $folder) {
            if (!is_dir($data . $folder)) {
                mkdir($data . $folder, 0775, true);
            }
        }

        $this->config = require $root . '/config.php';
        $this->collections = new Collections($root . '/collections');
        $this->index = new Index($data . '/var/index.sqlite', $data . '/content', $this->collections);
        $this->accounts = new Accounts($data . '/var/accounts.sqlite');
        $this->writer = new Writer($data . '/content', $data . '/var/trash');
        $this->builder = new Builder($this->config['site_path'], $this->config['build_command'], $data, $root);
    }

    public function handle(Request $request): Response
    {
        if (str_starts_with($request->path, '/media/')) {
            return $this->media($request);
        }

        $isApi = str_starts_with($request->path, '/api/v1/');
        $isAdmin = $request->path === '/admin' || str_starts_with($request->path, '/admin/');
        if (!$isApi && !$isAdmin) {
            return $this->website($request);
        }

        // Pick up anything that changed on disk since the last request.
        // See Index::refresh() for why this is cheap enough to do every time.
        $this->index->refresh();

        if ($isApi) {
            return $this->api($request);
        }

        $admin = new Admin($this->collections, $this->index, $this->accounts, $this->writer, $this->builder, $this->config, $this->root, $this->data);

        return $admin->handle($request);
    }

    /**
     * The public website: a file from the last successful build.
     *
     * Before the first build there are no files. That is a brand-new installation,
     * and the only useful thing to show is the way to the admin.
     */
    private function website(Request $request): Response
    {
        if (!$request->isReadOnly()) {
            return Response::error(405, 'method_not_allowed', 'The website only answers GET.');
        }

        $site = new StaticSite($this->builder->currentSite());
        if (!$site->exists()) {
            return Response::html(503, '<!doctype html><meta charset="utf-8"><title>Not published yet</title>'
                . '<body style="font:1.1rem/1.6 Georgia,serif;max-width:32rem;margin:20vh auto;padding:0 1rem">'
                . '<p>This site has not been published yet.</p><p><a href="/admin">Open the admin</a> to set it up.</p>');
        }

        return $site->serve($request->path);
    }

    /**
     * Publish the website in the background, after something visitors can see changed.
     *
     * @param Request|null $request the signed-in request that caused it, when there is one.
     *                              It tells the build where this CMS answers; see Builder::request().
     */
    private function publish(?Request $request): void
    {
        $address = $this->config['internal_url'] ?: $request?->origin();
        $this->builder->request($address ?: null);
    }

    private function api(Request $request): Response
    {
        $path = substr($request->path, strlen('/api/v1/'));
        $segments = explode('/', trim($path, '/'));
        $user = $this->accounts->currentUser($request);

        // The one GET that is not public: listing a document's uploads.
        $isMediaList = count($segments) === 3 && $segments[2] === 'media';

        if ($request->isReadOnly() && $segments === ['social', 'feed']) {
            return $this->socialFeedPage((int) ($request->query['page'] ?? 1));
        }
        if ($request->isReadOnly() && $segments === ['social', 'tag']) {
            return $this->socialTag((string) ($request->query['tag'] ?? ''));
        }

        if ($request->isReadOnly() && !$isMediaList) {
            return (new ReadApi($this->collections, $this->index))->handle($path, $request->query, $user?->role);
        }

        if ($user === null) {
            return Response::error(401, 'unauthenticated', 'Sign in first.');
        }

        // Anything that changes content must prove it was sent by one of our own
        // pages: right origin, and the session's CSRF token in a header that only
        // our own JavaScript can set.
        if (!$request->isReadOnly()) {
            $tokenMatches = hash_equals($user->csrfToken, $request->header('x-csrf-token'));
            if (!$request->isSameOrigin() || !$tokenMatches) {
                return Response::error(403, 'csrf', 'This request did not come from the admin. Reload the page and try again.');
            }
        }

        // Remember whether visitors could see this document before the change.
        $before = isset($segments[1]) || count($segments) === 1 ? $this->index->find($segments[0], $segments[1] ?? $segments[0]) : null;
        $wasLive = $before !== null && $before['status'] !== 'draft';

        $response = (new WriteApi($this->collections, $this->index, $this->writer))->handle($request, $segments, $user);

        // New rules for the fediverse archive take effect straight away: the archive
        // is rebuilt under them before the save is reported as done. That is why
        // saving the Social screen takes a few seconds.
        if ($segments[0] === 'social' && $request->method === 'PUT' && $response->status === 200) {
            $this->socialFeed()->sync();
        }

        // Publish, unless this was a draft before and still is one: the editor saves
        // drafts as you type, and none of that is anything a visitor would see.
        // (Uploads do not publish either. An image shows once the document using it is saved.)
        $isDocument = count($segments) <= 2 && !$request->isReadOnly();
        if ($isDocument && $response->status < 300) {
            $saved = json_decode($response->body, true)['data'] ?? null;
            $isLive = $request->method !== 'DELETE' && ($saved['status'] ?? null) !== 'draft';
            if ($wasLive || $isLive) {
                $this->publish($request);
            }
        }

        return $response;
    }

    /** The fediverse archive, set up with the rules from content/social/index.md. */
    private function socialFeed(): Feed
    {
        $row = $this->index->find('social', 'social');
        $rules = $row === null ? [] : json_decode($row['fields'], true);

        return new Feed($this->data . '/var/social.json', $rules);
    }

    /** GET /api/v1/social/feed?page=2: one page of the fediverse archive, for the site's /social page. */
    private function socialFeedPage(int $number): Response
    {
        $feed = $this->socialFeed();

        // Nobody runs a timer for us, so the archive is refreshed by whoever asks
        // first after it has sat for ten minutes. Usually that is one quick request
        // to the instance; `bin/lagom social-sync` from cron makes it nobody's wait.
        if ($feed->isStale()) {
            $feed->sync();
            // The Social page is a file like every other page; new posts mean a new file.
            if ($feed->changedArchive()) {
                $this->publish(null);
            }
        }

        $page = $feed->page($number);
        if ($page === null) {
            return Response::json(503, ['error' => 'warming_up'])->withHeader('Retry-After', '5');
        }

        return Response::json(200, $page)->withHeader('Cache-Control', 'public, max-age=60');
    }

    /** GET /api/v1/social/tag?tag=linux: every archived post with that hashtag, for the panel on /social. */
    private function socialTag(string $tag): Response
    {
        $tag = ltrim(trim($tag), '#');
        if ($tag === '' || mb_strlen($tag) > 100) {
            return Response::error(400, 'tag_required', 'Say which hashtag: ?tag=linux');
        }

        $posts = $this->socialFeed()->tagged($tag);
        if ($posts === null) {
            return Response::json(503, ['error' => 'warming_up'])->withHeader('Retry-After', '5');
        }

        return Response::json(200, ['tag' => $tag, 'data' => $posts])->withHeader('Cache-Control', 'public, max-age=60');
    }

    /**
     * Serve /media/<collection>/<slug>/<file> from the document's folder.
     *
     * The address is taken apart and checked piece by piece rather than glued onto
     * a directory name, so nothing with ".." in it can wander off elsewhere on disk.
     */
    private function media(Request $request): Response
    {
        $parts = explode('/', substr($request->path, strlen('/media/')));
        if (count($parts) !== 3) {
            return Response::error(404, 'not_found', 'No such file.');
        }
        [$collection, $slug, $file] = $parts;

        $extension = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        $valid = $this->collections->get($collection) !== null
            && Writer::isValidSlug($slug)
            && preg_match('/^[a-z0-9][a-z0-9._-]*$/', $file) === 1
            && isset(Media::TYPES[$extension]);

        $path = $this->writer->directory($collection, $slug) . '/' . $file;
        if (!$valid || !is_file($path)) {
            return Response::error(404, 'not_found', 'No such file.');
        }

        return Response::file($path, Media::TYPES[$extension]);
    }
}
