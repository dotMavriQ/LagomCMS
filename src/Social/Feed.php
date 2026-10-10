<?php

declare(strict_types=1);

namespace Lagom\Social;

/**
 * The fediverse archive behind the site's /social page.
 *
 * The site never talks to the fediverse instance itself. It asks us for a page of
 * posts, and we answer from a file on disk. That is what keeps /social fast and
 * hard to break: the instance can be down for a week and the page still renders.
 *
 * This class does the two halves of that job:
 *
 *   sync()   fetches posts from the instance, applies the rules, and stores what
 *            is left in var/social.json. Runs from `bin/lagom social-sync`, when
 *            the rules are saved in the admin, and lazily when the archive has
 *            gone ten minutes without a look.
 *   page()   hands out one page of that archive. No network involved.
 *
 * The rules themselves are content: content/social/index.md, edited on the Social
 * screen of the admin. This class is the only place they are applied; nothing
 * downstream filters again.
 *
 * (This replaces a separate Lua service that did the same job with the rules
 * written into its source. A copy of that service is in reference/ for comparison.)
 */
final class Feed
{
    /** How many posts to ask the instance for at a time. Its own maximum is 40. */
    private const BATCH = 40;

    /** A ceiling on requests per account, so a misbehaving instance cannot keep us crawling forever. */
    private const MAX_BATCHES = 60;

    /** A pause between requests. The whole archive is about ten of them; there is no hurry. */
    private const PACE_MICROSECONDS = 350_000;

    /** How long the archive may go unchecked before a page request triggers a look for new posts. */
    private const STALE_AFTER = 600;

    /** Whether the last sync() in this process changed which posts the archive holds. */
    private bool $changed = false;

    /**
     * @param string               $storePath where the archive lives, e.g. var/social.json
     * @param array<string, mixed> $rules     the fields of content/social/index.md
     */
    public function __construct(
        private readonly string $storePath,
        private readonly array $rules,
    ) {
    }

    /**
     * One page of the archive, newest posts first, in the shape the site expects.
     * Null means there is no archive at all yet.
     *
     * @return array<string, mixed>|null
     */
    public function page(int $number): ?array
    {
        $store = $this->load();
        if ($store === null) {
            return null;
        }

        $perPage = max(1, (int) ($this->rules['posts_per_page'] ?? 20));
        $total = count($store['posts']);
        $pages = max(1, (int) ceil($total / $perPage));
        $number = max(1, $number);

        return [
            'data' => array_slice($store['posts'], ($number - 1) * $perPage, $perPage),
            'page' => $number,
            'pages' => $pages,
            'total' => $total,
            'next' => $number < $pages ? $number + 1 : null,
        ];
    }

    /**
     * Every post in the archive carrying a hashtag, newest first. Null means there
     * is no archive yet.
     *
     * Answered from the archive rather than the instance's own hashtag timeline:
     * that one scans every federated post with the tag before narrowing to local
     * ones, and a popular tag runs past Pleroma's query time limit. The archive also
     * holds exactly what the Social page may show, so the two can never disagree.
     *
     * @return list<array<string, mixed>>|null
     */
    public function tagged(string $tag): ?array
    {
        $store = $this->load();
        if ($store === null) {
            return null;
        }

        $wanted = self::normaliseTag($tag);

        return array_values(array_filter(
            $store['posts'],
            fn (array $post): bool => in_array($wanted, self::tagsOf((string) ($post['content'] ?? '')), true),
        ));
    }

    /** Has sync() just added or removed posts? The site is republished when it has. */
    public function changedArchive(): bool
    {
        return $this->changed;
    }

    /** True when the archive is missing or has not been checked for a while. */
    public function isStale(): bool
    {
        $store = $this->load();

        return $store === null || time() - (int) ($store['checked_at'] ?? 0) > self::STALE_AFTER;
    }

    /**
     * Bring the archive up to date.
     *
     * If there is no archive, or the rules have changed since it was built, every
     * account is walked back to its first post and the archive is rebuilt. Otherwise
     * each account is only asked for what is newer than what we hold, which in the
     * usual case is one request that comes back empty.
     *
     * Nothing is thrown away on failure. If the instance cannot be reached, what is
     * being served stays served, and the returned sentence says what went wrong.
     */
    public function sync(): string
    {
        // One sync at a time. A second caller does not wait; it just leaves.
        $lock = fopen($this->storePath . '.lock', 'c');
        if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) {
            return 'Another sync is already running.';
        }

        try {
            $store = $this->load();
            $fingerprint = $this->fingerprint();
            $rebuild = $store === null || ($store['rules'] ?? '') !== $fingerprint;

            $posts = $rebuild ? [] : $store['posts'];
            $ids = $rebuild ? [] : ($store['account_ids'] ?? []);
            $added = 0;

            foreach ($this->accounts() as $account) {
                $ids[$account['acct']] ??= $this->lookUpAccountId($account['acct']);

                $fresh = $rebuild
                    ? $this->crawl($ids[$account['acct']], $account)
                    : $this->newerThan($ids[$account['acct']], $account, $this->newestIdOf($posts, $account['acct']));

                $held = array_column($posts, null, 'id');
                foreach ($fresh as $post) {
                    if (!isset($held[$post['id']])) {
                        $posts[] = $post;
                        $added++;
                    }
                }
            }

            // Newest first. ISO dates sort correctly as plain text.
            usort($posts, fn (array $a, array $b): int => strcmp($b['created_at'] ?? '', $a['created_at'] ?? ''));

            $this->save(['posts' => $posts, 'rules' => $fingerprint, 'account_ids' => $ids, 'checked_at' => time()]);
            $this->changed = $rebuild || $added > 0;

            return $rebuild
                ? 'Rebuilt the archive: ' . count($posts) . ' posts.'
                : ($added > 0 ? "Added $added new posts." : 'Nothing new.');
        } catch (\RuntimeException $e) {
            // Remember that we looked, so a struggling instance is not asked again on every page view.
            $store = $this->load();
            if ($store !== null) {
                $this->save(['checked_at' => time()] + $store);
            }

            return 'Sync failed, the archive is unchanged: ' . $e->getMessage();
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    /**
     * The hashtags in a post's HTML, read from the instance's own hashtag links:
     * <a class="hashtag" data-tag="linux"> or <a rel="tag" href=".../tag/linux">.
     *
     * @return list<string>
     */
    private static function tagsOf(string $html): array
    {
        $tags = [];
        preg_match_all('/<a\b[^>]*>/i', $html, $links);

        foreach ($links[0] as $link) {
            if (preg_match('/class="[^"]*\bhashtag\b|rel="[^"]*\btag\b/i', $link) !== 1) {
                continue;
            }
            if (preg_match('/data-tag="([^"]+)"/i', $link, $found) !== 1
                && preg_match('~href="[^"]*/tags?/([^"/?#]+)~i', $link, $found) !== 1) {
                continue;
            }
            $tags[] = self::normaliseTag(rawurldecode($found[1]));
        }

        return array_values(array_unique($tags));
    }

    /**
     * Lower case, and one spelling per letter: "é" can be stored as one character
     * or as "e" plus an accent, and the two must compare equal. (The second part
     * needs PHP's intl extension and is skipped without it.)
     */
    private static function normaliseTag(string $tag): string
    {
        if (class_exists(\Normalizer::class)) {
            $tag = \Normalizer::normalize($tag, \Normalizer::FORM_C) ?: $tag;
        }

        return mb_strtolower($tag);
    }

    /**
     * The accounts to follow, each with its own rules.
     *
     * @return list<array{acct: string, hide_replies: bool, hide_boosts: bool, media_only: bool}>
     */
    private function accounts(): array
    {
        $accounts = [];
        foreach ($this->rules['accounts'] ?? [] as $row) {
            if (is_array($row) && trim((string) ($row['acct'] ?? '')) !== '') {
                $accounts[] = [
                    'acct' => ltrim(trim((string) $row['acct']), '@'),
                    'hide_replies' => ($row['hide_replies'] ?? false) === true,
                    'hide_boosts' => ($row['hide_boosts'] ?? false) === true,
                    'media_only' => ($row['media_only'] ?? false) === true,
                ];
            }
        }

        return $accounts;
    }

    /**
     * Walk one account back to its first post.
     *
     * @param array{acct: string, hide_replies: bool, hide_boosts: bool, media_only: bool} $account
     *
     * @return list<array<string, mixed>>
     */
    private function crawl(string $id, array $account): array
    {
        $posts = [];
        $olderThan = null;

        for ($i = 0; $i < self::MAX_BATCHES; $i++) {
            $batch = $this->fetch($this->statusesUrl($id, $account, $olderThan === null ? [] : ['max_id' => $olderThan]));
            if ($batch === []) {
                break;
            }
            foreach ($batch as $status) {
                if ($this->isVisible($status)) {
                    $posts[] = $this->shape($status);
                }
                $olderThan = $status['id'];
            }
            usleep(self::PACE_MICROSECONDS);
        }

        return $posts;
    }

    /**
     * Only what an account has posted since the newest post we hold.
     *
     * @param array{acct: string, hide_replies: bool, hide_boosts: bool, media_only: bool} $account
     *
     * @return list<array<string, mixed>>
     */
    private function newerThan(string $id, array $account, ?string $newestId): array
    {
        $batch = $this->fetch($this->statusesUrl($id, $account, $newestId === null ? [] : ['since_id' => $newestId]));

        $posts = [];
        foreach ($batch as $status) {
            if ($this->isVisible($status)) {
                $posts[] = $this->shape($status);
            }
        }

        return $posts;
    }

    /**
     * The address that lists an account's posts.
     *
     * Replies, boosts and "media only" are things the instance can filter itself,
     * so those rules are sent along as parameters instead of fetching everything
     * and throwing most of it away.
     *
     * @param array{acct: string, hide_replies: bool, hide_boosts: bool, media_only: bool} $account
     * @param array<string, string>                                                     $extra
     */
    private function statusesUrl(string $id, array $account, array $extra): string
    {
        $query = ['limit' => self::BATCH] + $extra;
        if ($account['hide_replies']) {
            $query['exclude_replies'] = 'true';
        }
        if ($account['hide_boosts']) {
            $query['exclude_reblogs'] = 'true';
        }
        if ($account['media_only']) {
            $query['only_media'] = 'true';
        }

        return $this->instance() . '/api/v1/accounts/' . rawurlencode($id) . '/statuses?' . http_build_query($query);
    }

    /**
     * The rules the instance cannot apply for us.
     *
     * @param array<string, mixed> $status a post as the instance sent it
     */
    private function isVisible(array $status): bool
    {
        if (($this->rules['public_only'] ?? false) === true
            && isset($status['visibility']) && $status['visibility'] !== 'public'
        ) {
            return false;
        }

        // A post that opens by naming somebody is one half of a conversation, not
        // something written for the page. The instance marks a mention with an
        // "h-card" span, so that is what the start of the post is checked for.
        if (($this->rules['hide_mention_openers'] ?? false) === true) {
            $body = ltrim((string) preg_replace('/^<p>/', '', (string) ($status['content'] ?? '')));
            if (str_starts_with($body, '<span class="h-card">')) {
                return false;
            }
        }

        return true;
    }

    /**
     * Keep only what the site draws. A post from the instance carries dozens of
     * fields; the archive would be several times the size with all of them.
     * Empty values are left out altogether, as the site expects.
     *
     * @param array<string, mixed> $status
     *
     * @return array<string, mixed>
     */
    private function shape(array $status): array
    {
        $account = is_array($status['account'] ?? null) ? $status['account'] : [];

        $media = [];
        foreach (is_array($status['media_attachments'] ?? null) ? $status['media_attachments'] : [] as $item) {
            $small = $item['meta']['small'] ?? [];
            $original = $item['meta']['original'] ?? [];
            $media[] = self::withoutEmpty([
                'type' => $item['type'] ?? null,
                'url' => $item['url'] ?? null,
                'preview_url' => self::filled($item['preview_url'] ?? null) ?? ($item['url'] ?? null),
                'description' => $item['description'] ?? null,
                'width' => $small['width'] ?? $original['width'] ?? null,
                'height' => $small['height'] ?? $original['height'] ?? null,
            ]);
        }

        $post = self::withoutEmpty([
            'id' => $status['id'] ?? null,
            'url' => self::filled($status['url'] ?? null) ?? ($status['uri'] ?? null),
            'created_at' => $status['created_at'] ?? null,
            'content' => $status['content'] ?? null,
            'spoiler_text' => $status['spoiler_text'] ?? null,
        ]);
        $post['sensitive'] = self::filled($status['sensitive'] ?? null) !== null && $status['sensitive'] !== false;
        $post['account'] = self::withoutEmpty([
            'acct' => $account['acct'] ?? null,
            'display_name' => $account['display_name'] ?? null,
            'avatar' => $account['avatar'] ?? null,
        ]);
        if ($media !== []) {
            $post['media'] = $media;
        }

        return $post;
    }

    private function lookUpAccountId(string $acct): string
    {
        $account = $this->fetch($this->instance() . '/api/v1/accounts/lookup?acct=' . rawurlencode($acct));
        if (!isset($account['id'])) {
            throw new \RuntimeException("the instance does not know an account called $acct");
        }

        return (string) $account['id'];
    }

    /**
     * GET a JSON document from the instance.
     *
     * @return array<mixed>
     *
     * @throws \RuntimeException when the instance cannot be reached or answers with anything but JSON
     */
    private function fetch(string $url): array
    {
        $request = curl_init($url);
        curl_setopt_array($request, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
            CURLOPT_USERAGENT => 'lagomcms-social/1.0 (+https://github.com/dotMavriQ/LagomCMS)',
        ]);
        $body = curl_exec($request);
        $status = curl_getinfo($request, CURLINFO_RESPONSE_CODE);

        if ($body === false) {
            throw new \RuntimeException('could not reach ' . parse_url($url, PHP_URL_HOST) . ' (' . curl_error($request) . ')');
        }
        if ($status !== 200) {
            throw new \RuntimeException(parse_url($url, PHP_URL_HOST) . " answered $status");
        }

        $decoded = json_decode((string) $body, true);
        if (!is_array($decoded)) {
            throw new \RuntimeException(parse_url($url, PHP_URL_HOST) . ' did not answer with JSON');
        }

        return $decoded;
    }

    private function instance(): string
    {
        return rtrim((string) ($this->rules['instance'] ?? ''), '/');
    }

    /**
     * A short stamp of everything that decides which posts are in the archive.
     * If it differs from the one stored with the archive, the archive was built
     * under other rules and has to be rebuilt. The page size is not part of it:
     * that changes how the same posts are cut up, not which posts there are.
     */
    private function fingerprint(): string
    {
        return hash('sha256', json_encode([
            $this->instance(),
            $this->accounts(),
            ($this->rules['public_only'] ?? false) === true,
            ($this->rules['hide_mention_openers'] ?? false) === true,
        ], JSON_THROW_ON_ERROR));
    }

    /** @param list<array<string, mixed>> $posts newest first */
    private function newestIdOf(array $posts, string $acct): ?string
    {
        foreach ($posts as $post) {
            if (($post['account']['acct'] ?? null) === $acct) {
                return (string) $post['id'];
            }
        }

        return null;
    }

    /** @return array<string, mixed>|null */
    private function load(): ?array
    {
        if (!is_file($this->storePath)) {
            return null;
        }
        $store = json_decode((string) file_get_contents($this->storePath), true);

        return is_array($store) && is_array($store['posts'] ?? null) ? $store : null;
    }

    /** @param array<string, mixed> $store */
    private function save(array $store): void
    {
        // Written beside the real file and renamed over it, so a reader never sees half an archive.
        $temporary = $this->storePath . '.tmp';
        file_put_contents($temporary, json_encode($store, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
        rename($temporary, $this->storePath);
    }

    /** Null for "nothing there": null itself, or an empty string. */
    private static function filled(mixed $value): mixed
    {
        return $value === null || $value === '' ? null : $value;
    }

    /**
     * @param array<string, mixed> $values
     *
     * @return array<string, mixed>
     */
    private static function withoutEmpty(array $values): array
    {
        return array_filter($values, fn (mixed $value): bool => self::filled($value) !== null);
    }
}
