<?php

declare(strict_types=1);

namespace Lagom\Admin;

use Lagom\Auth\Accounts;
use Lagom\Auth\User;
use Lagom\Collections;
use Lagom\Content\Conflict;
use Lagom\Content\FrontMatter;
use Lagom\Content\Writer;
use Lagom\Http\Request;
use Lagom\Http\Response;
use Lagom\Index\Index;
use Lagom\Role;
use Lagom\Site\Builder;

/**
 * The admin: the pages you see after signing in.
 *
 *     /admin/setup                 first run only: create the owner's account
 *     /admin/login                 sign in
 *     /admin                       the start page: numbers, drafts, shortcuts
 *     /admin/account               change your own password
 *     /admin/<collection>          a list of its documents (or the editor, for a singleton)
 *     /admin/<collection>/new      name a new document
 *     /admin/<collection>/<slug>   the editor
 *
 * These are ordinary server-rendered pages from templates/admin/. JavaScript only
 * takes over inside the editor, and it saves through the same JSON API anything
 * else would use; the admin has no private back door into the content.
 */
final class Admin
{
    /** @param array<string, mixed> $config */
    public function __construct(
        private readonly Collections $collections,
        private readonly Index $index,
        private readonly Accounts $accounts,
        private readonly Writer $writer,
        private readonly Builder $builder,
        private readonly array $config,
        private readonly string $root,
        private readonly string $data,
    ) {
    }

    public function handle(Request $request): Response
    {
        // A form post from another site is dropped before anything looks at it.
        if (!$request->isReadOnly() && !$request->isSameOrigin()) {
            return Response::html(403, 'This form was not sent from the admin.');
        }

        $segments = array_values(array_filter(explode('/', substr($request->path, strlen('/admin')))));

        // A fresh installation has no accounts. Until the first one exists, every
        // admin address leads to the setup screen, and afterwards that screen is gone.
        if (!$this->accounts->hasAnyUser()) {
            return $segments === ['setup'] ? $this->setup($request) : Response::redirect('/admin/setup');
        }
        if ($segments === ['setup']) {
            return Response::redirect('/admin/login');
        }

        if ($segments === ['login']) {
            return $this->login($request);
        }

        $user = $this->accounts->currentUser($request);
        if ($user === null) {
            return Response::redirect('/admin/login');
        }

        // From here on every POST must carry the session's CSRF token.
        if (!$request->isReadOnly() && !hash_equals($user->csrfToken, (string) ($request->form['csrf'] ?? ''))) {
            return Response::html(403, 'This form has expired. Go back, reload the page and try again.');
        }

        if ($segments === ['logout'] && $request->method === 'POST') {
            $this->accounts->signOut($request);

            return Response::redirect('/admin/login')
                ->withHeader('Set-Cookie', Accounts::cookie('', $this->isHttps($request)));
        }

        if ($segments === []) {
            return $this->dashboard($user);
        }

        if ($segments === ['publish']) {
            return $this->publish($request);
        }

        if ($segments === ['account']) {
            return $this->account($request, $user);
        }

        $definition = $this->collections->get($segments[0]);
        if ($definition === null || count($segments) > 2) {
            return $this->page(404, 'missing', $user, ['title' => 'Not found']);
        }

        if (count($segments) === 1) {
            return $definition['singleton']
                ? $this->edit($definition, $definition['name'], $user)
                : $this->documents($definition, $user);
        }

        if ($segments[1] === 'new') {
            return $this->create($request, $definition, $user);
        }

        return $this->edit($definition, $segments[1], $user);
    }

    /**
     * First run: create the owner's account and give the site something to show.
     *
     * This is the whole installation, in the spirit of WordPress's five-minute
     * install: unpack, open /admin, fill in one form. It only exists while there
     * are no accounts at all, so it cannot be used to add a second owner later.
     *
     * Whoever reaches a brand-new installation first can claim it. That is the
     * price of needing no terminal; do not leave a fresh install sitting unclaimed
     * on a public address.
     */
    private function setup(Request $request): Response
    {
        $email = trim((string) ($request->form['email'] ?? ''));
        $error = null;

        if ($request->method === 'POST') {
            $password = (string) ($request->form['password'] ?? '');

            if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
                $error = 'That does not look like an email address.';
            } elseif (strlen($password) < 10) {
                $error = 'Pick a password of at least 10 characters.';
            } else {
                $this->accounts->saveUser($email, $password, Role::Admin);
                $this->seedStarterContent();
                // The starter content is a whole small site. Publish it, so the new owner's
                // first click on "View site" shows a website.
                $this->builder->request($this->config['internal_url'] ?: $request->origin());

                $token = $this->accounts->signIn($email, $password, $request->ip);

                return Response::redirect('/admin')
                    ->withHeader('Set-Cookie', Accounts::cookie((string) $token, $this->isHttps($request)));
            }
        }

        return Response::html($error === null ? 200 : 422, $this->render('setup', ['error' => $error, 'email' => $email]));
    }

    /**
     * Copy the starter content into an installation that has none.
     *
     * The starter is a small complete site (a home page, an example post, a
     * sample CV entry, ...) so the first thing a new owner sees is a working
     * website to edit, not seven empty forms. An installation that already has
     * content, because it was unpacked on top of an existing site, is left alone.
     */
    private function seedStarterContent(): void
    {
        $content = $this->data . '/content';
        if (glob($content . '/*/index.md') !== [] || glob($content . '/*/*/index.md') !== []) {
            return;
        }

        $starter = $this->root . '/starter/content';
        $files = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($starter, \FilesystemIterator::SKIP_DOTS));
        foreach ($files as $file) {
            $target = $content . substr($file->getPathname(), strlen($starter));
            if (!is_dir(dirname($target))) {
                mkdir(dirname($target), 0775, true);
            }
            copy($file->getPathname(), $target);
        }

        $this->index->refresh();
    }

    private function login(Request $request): Response
    {
        $error = null;

        if ($request->method === 'POST') {
            if ($this->accounts->isLockedOut($request->ip, (string) ($request->form['email'] ?? ''))) {
                $error = 'Too many wrong passwords. Wait a quarter of an hour and try again.';
            } else {
                $token = $this->accounts->signIn(
                    (string) ($request->form['email'] ?? ''),
                    (string) ($request->form['password'] ?? ''),
                    $request->ip,
                );
                if ($token !== null) {
                    return Response::redirect('/admin')
                        ->withHeader('Set-Cookie', Accounts::cookie($token, $this->isHttps($request)));
                }
                // Deliberately vague: it does not say which of the two was wrong.
                $error = 'That email and password do not match.';
            }
        }

        return Response::html($error === null ? 200 : 401, $this->render('login', [
            'error' => $error,
            'email' => (string) ($request->form['email'] ?? ''),
        ]));
    }

    /**
     * /admin/account: change your own password, behind the email address in the
     * corner of the sidebar.
     *
     * Before this existed the only way was `bin/lagom user` on the server, which is
     * fine for a forgotten password and a poor answer to "I would like a new one".
     */
    private function account(Request $request, User $user): Response
    {
        $error = null;

        if ($request->method === 'POST') {
            $current = (string) ($request->form['current'] ?? '');
            $new = (string) ($request->form['password'] ?? '');

            if ($this->accounts->isLockedOut($request->ip, $user->email)) {
                $error = 'Too many wrong passwords. Wait a quarter of an hour and try again.';
            } elseif (strlen($new) < 10) {
                $error = 'Pick a password of at least 10 characters.';
            } elseif ($new !== (string) ($request->form['repeat'] ?? '')) {
                $error = 'The new password and its repeat are not the same.';
            } elseif (!$this->accounts->changePassword($request, $user, $current, $new)) {
                $error = 'That is not your current password.';
            } else {
                // Redirect, so reloading the page does not send the passwords again.
                return Response::redirect('/admin/account?saved=1');
            }
        }

        return $this->page($error === null ? 200 : 422, 'account', $user, [
            'title' => 'Account',
            'error' => $error,
            'saved' => $error === null && isset($request->query['saved']),
        ]);
    }

    /**
     * The start page. What you see after signing in, and behind the name in the
     * top left corner.
     *
     * Everything on it is worked out from the posts themselves, on the spot.
     * There is no statistics table to keep up to date, and no visitor tracking:
     * these are numbers about your writing, not about your readers.
     */
    private function dashboard(User $user): Response
    {
        $posts = $this->index->summaries('posts');

        $counts = ['published' => 0, 'draft' => 0, 'archived' => 0];
        $words = 0;
        $latest = null;
        $drafts = [];
        $attention = [];

        // One bar per month for the last twelve, oldest first, months with nothing included.
        $months = [];
        for ($i = 11; $i >= 0; $i--) {
            $months[date('Y-m', strtotime("first day of -$i months"))] = 0;
        }

        foreach ($posts as $post) {
            $status = $post['status'] ?? 'draft';
            $counts[$status] = ($counts[$status] ?? 0) + 1;

            if ($post['parse_error'] !== null) {
                $attention[] = [$post, 'the file is broken and cannot be read'];
            }
            if ($status === 'draft') {
                $drafts[] = $post;
            }
            if ($status !== 'published') {
                continue;
            }

            $words += (int) $post['words'];
            $month = substr((string) $post['published_at'], 0, 7);
            if (isset($months[$month])) {
                $months[$month]++;
            }
            if ($latest === null || (string) $post['published_at'] > (string) $latest['published_at']) {
                $latest = $post;
            }

            // Things a published post should not be missing. The summary is what
            // listings, feeds and search results show.
            $fields = json_decode($post['fields'], true);
            if (trim((string) ($fields['summary'] ?? '')) === '') {
                $attention[] = [$post, 'no summary'];
            }
        }

        return $this->page(200, 'dashboard', $user, [
            'title' => 'Start',
            'isStart' => true,
            'counts' => $counts,
            'words' => $words,
            'latest' => $latest,
            'months' => $months,
            'drafts' => array_slice($drafts, 0, 6),
            'recent' => array_slice($posts, 0, 6),
            'attention' => array_slice($attention, 0, 6),
            'attentionTotal' => count($attention),
            'siteUrl' => $this->config['site_url'],
        ]);
    }

    /**
     * The list of a collection's documents.
     *
     * @param array<string, mixed> $definition
     */
    private function documents(array $definition, User $user): Response
    {
        // A collection may say how it wants to be listed. Otherwise: by its sort
        // key if it has one, and newest first if it does not.
        $sort = $definition['sort'] ?? ($this->hasField($definition, 'sort_key') ? 'sort_key' : '-published_at');
        $rows = $this->index->list($definition['name'], $sort, 500, 0, false)['rows'];

        $documents = [];
        foreach ($rows as $row) {
            $documents[] = $row + ['data' => json_decode($row['fields'], true)];
        }

        return $this->page(200, 'documents', $user, [
            'title' => $definition['label'],
            'definition' => $definition,
            'documents' => $documents,
            'canCreate' => $this->collections->allows($definition['name'], 'create', $user->role),
        ]);
    }

    /**
     * "New post": ask for a title, make a draft out of it, open the editor.
     *
     * @param array<string, mixed> $definition
     */
    private function create(Request $request, array $definition, User $user): Response
    {
        $collection = $definition['name'];
        if ($definition['singleton'] || !$this->collections->allows($collection, 'create', $user->role)) {
            return $this->page(403, 'missing', $user, ['title' => 'Not allowed']);
        }

        $title = trim((string) ($request->form['title'] ?? ''));
        $slug = trim((string) ($request->form['slug'] ?? ''));
        $error = null;

        if ($request->method === 'POST') {
            $slug = $slug !== '' ? $slug : Writer::slugify($title);

            if ($title === '') {
                $error = 'It needs a title. You can change it later.';
            } elseif (!Writer::isValidSlug($slug)) {
                $error = 'The address may only hold lowercase letters, digits and hyphens.';
            } else {
                // Start from the collection's defaults: status "draft" and friends.
                $fields = ['title' => $title];
                foreach ($definition['fields'] as $field) {
                    if (isset($field['default']) && $field['name'] !== 'title') {
                        $fields[$field['name']] = $field['default'];
                    }
                }

                try {
                    $this->writer->create($collection, $slug, $fields, '');
                    $this->index->refresh();

                    return Response::redirect('/admin/' . $collection . '/' . $slug);
                } catch (Conflict) {
                    $error = 'There is already a document at that address. Pick another.';
                }
            }
        }

        return $this->page($error === null ? 200 : 422, 'new', $user, [
            'title' => 'New in ' . $definition['label'],
            'definition' => $definition,
            'documentTitle' => $title,
            'slug' => $slug,
            'error' => $error,
        ]);
    }

    /**
     * The editor for one document.
     *
     * @param array<string, mixed> $definition
     */
    private function edit(array $definition, string $slug, User $user): Response
    {
        $collection = $definition['name'];
        $row = $this->index->find($collection, $slug);

        // A singleton is one document that is simply expected to be there. An installation
        // older than the collection (AI Chat arrived after the first sites were set up) has
        // no file for it yet, so the first visit to its screen makes one, holding the
        // collection's defaults. Nothing is published by this; that takes a save.
        if ($row === null && $definition['singleton'] && $this->collections->allows($collection, 'update', $user->role)) {
            $fields = ['title' => $definition['label']];
            foreach ($definition['fields'] as $field) {
                if (isset($field['default'])) {
                    $fields[$field['name']] = $field['default'];
                }
            }

            try {
                $this->writer->create($collection, $collection, $fields, '');
            } catch (Conflict) {
                // Somebody opened the same screen a moment earlier. Theirs will do.
            }
            $this->index->refresh();
            $row = $this->index->find($collection, $slug);
        }

        if ($row === null) {
            return $this->page(404, 'missing', $user, ['title' => 'Not found']);
        }

        // The index holds the parsed body. The editor wants the Markdown as it was
        // typed, so that comes straight from the file.
        [, $body] = FrontMatter::split((string) file_get_contents($row['path']));

        // Relation fields (a post's author) are drawn as a dropdown of the
        // documents they can point at.
        $choices = [];
        foreach ($definition['fields'] as $field) {
            if ($field['type'] === 'relation') {
                $choices[$field['name']] = $this->index->list($field['collection'], 'title', 500, 0, false)['rows'];
            }
        }

        $route = $this->config['routes'][$collection] ?? null;
        $shareImage = $this->config['share_images'][$collection] ?? null;

        return $this->page(200, 'edit', $user, [
            'title' => $row['title'] ?? $definition['label'],
            'definition' => $definition,
            'row' => $row,
            'fields' => json_decode($row['fields'], true),
            'body' => ltrim($body, "\n"),
            'choices' => $choices,
            'siteUrl' => $this->config['site_url'],
            'viewUrl' => $route === null ? null : $this->config['site_url'] . str_replace('{slug}', $slug, $route),
            'shareImageUrl' => $shareImage === null ? null : $this->config['site_url'] . str_replace('{slug}', $slug, $shareImage),
            'canDelete' => !$definition['singleton'] && $this->collections->allows($collection, 'delete', $user->role),
        ]);
    }

    /**
     * /admin/publish: how the website's last build went (GET, as JSON, which the
     * sidebar asks for while a build is running), or "build it again" (POST).
     */
    private function publish(Request $request): Response
    {
        if ($request->method === 'POST') {
            $this->builder->request($this->config['internal_url'] ?: $request->origin());

            return Response::redirect('/admin');
        }

        return Response::json(200, $this->builder->status());
    }

    /**
     * A full admin page: the template, wrapped in the layout with the sidebar.
     *
     * @param array<string, mixed> $data
     */
    private function page(int $status, string $template, User $user, array $data): Response
    {
        $data['user'] = $user;
        // A child collection lights up its parent's line in the menu.
        $definition = $data['definition'] ?? null;
        $data['current'] = $definition === null ? null : ($definition['parent'] ?? $definition['name']);
        $data['tabs'] = $definition === null ? [] : $this->collections->family($definition['name']);
        $data['isStart'] = $data['isStart'] ?? false;
        $data['isAccount'] = $template === 'account';
        $data['menu'] = $this->menu();
        // Null when there is no Astro project to build: then there is nothing to report.
        $data['publishing'] = $this->builder->isConfigured() ? $this->builder->status() : null;
        $data['content'] = $this->render($template, $data);

        return Response::html($status, $this->render('layout', $data));
    }

    /**
     * The sidebar's menu: groups of collections, each with its documents.
     *
     * Only what you would go looking for is in here. Hidden collections are left
     * out, and so are children (the CV's entries, skills, references): those are
     * tabs on their parent's screen, see Collections::family().
     *
     * The sidebar prints one line per collection and never lists documents; a list
     * that grows with every post is not a menu. The documents ride along for the
     * quick switcher (Ctrl+O), which searches them in the browser.
     *
     * @return array<string, list<array{definition: array<string, mixed>, documents: list<array<string, mixed>>}>>
     */
    private function menu(): array
    {
        $documents = [];
        foreach ($this->index->outline() as $row) {
            $documents[$row['collection']][] = $row;
        }

        $menu = [];
        foreach ($this->collections->all() as $name => $definition) {
            if ($definition['hidden']) {
                continue;
            }
            // A child's documents are filed under its parent's menu entry, so the
            // quick switcher still finds a CV entry even though it has no menu line.
            $home = $definition['parent'] ?? $name;
            $group = $this->collections->get($home)['group'];

            if (!isset($menu[$group][$home])) {
                $menu[$group][$home] = ['definition' => $this->collections->get($home), 'documents' => []];
            }
            foreach ($documents[$name] ?? [] as $row) {
                $menu[$group][$home]['documents'][] = $row + ['label' => $definition['label']];
            }
        }

        return array_map('array_values', $menu);
    }

    /**
     * Run a template from templates/admin/ and return what it printed.
     *
     * Templates are plain PHP files. The array's keys become their variables,
     * so ['title' => 'Posts'] is $title inside the template.
     *
     * @param array<string, mixed> $data
     */
    private function render(string $template, array $data): string
    {
        extract($data, EXTR_SKIP);
        ob_start();
        require $this->root . '/templates/admin/' . $template . '.php';

        return (string) ob_get_clean();
    }

    /** @param array<string, mixed> $definition */
    private function hasField(array $definition, string $name): bool
    {
        return in_array($name, array_column($definition['fields'], 'name'), true);
    }

    private function isHttps(Request $request): bool
    {
        return $request->secure;
    }
}
