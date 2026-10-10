<?php
/**
 * The start page: where things stand, and the shortest way to the next thing.
 *
 * Four numbers, a year of publishing at a glance, then two lists you can click
 * straight into. A section with nothing to say (no drafts, nothing to fix) is
 * left out instead of being shown empty.
 *
 * @var array<string, int>          $counts         posts by status
 * @var int                         $words          words across all published posts
 * @var array<string, mixed>|null   $latest         the most recently published post
 * @var array<string, int>          $months         'YYYY-MM' => posts published, last twelve months
 * @var list<array<string, mixed>>  $drafts
 * @var list<array<string, mixed>>  $recent         posts by last edit
 * @var list<array{0: array<string, mixed>, 1: string}> $attention post and what is wrong with it
 * @var int                         $attentionTotal
 * @var string                      $siteUrl
 */

/** "3 days ago" reads faster than a date when the question is "how long has it been?". */
$ago = static function (int $timestamp): string {
    $days = (int) floor((time() - $timestamp) / 86400);

    return match (true) {
        $days < 1 => 'today',
        $days === 1 => 'yesterday',
        $days < 60 => $days . ' days ago',
        $days < 730 => (int) round($days / 30) . ' months ago',
        default => (int) round($days / 365) . ' years ago',
    };
};

$peak = max(1, max($months));
$publishedThisYear = array_sum($months);
?>
<header class="bar">
    <button class="ghost" type="button" data-toggle-sidebar title="Show or hide the sidebar"><?= icon('sidebar') ?></button>
    <nav class="crumbs"><span>Start</span></nav>
    <span class="bar__spacer"></span>
    <a class="button" href="<?= e($siteUrl !== '' ? $siteUrl : '/') ?>" target="_blank" rel="noopener"><?= icon('external') ?> View site</a>
    <a class="button" href="/admin/projects/new">New project</a>
    <a class="button button--primary" href="/admin/posts/new"><?= icon('plus') ?> New post</a>
</header>

<div class="start">
    <section class="tiles" aria-label="At a glance">
        <a class="tile" href="/admin/posts">
            <span class="tile__label">Published</span>
            <span class="tile__value"><?= $counts['published'] ?></span>
            <span class="tile__note"><?= $counts['archived'] ?> archived</span>
        </a>
        <a class="tile" href="/admin/posts">
            <span class="tile__label">Drafts</span>
            <span class="tile__value"><?= $counts['draft'] ?></span>
            <span class="tile__note"><?= $counts['draft'] === 0 ? 'nothing in progress' : 'in progress' ?></span>
        </a>
        <div class="tile">
            <span class="tile__label">Words published</span>
            <span class="tile__value"><?= number_format($words) ?></span>
            <span class="tile__note">about <?= number_format($counts['published'] > 0 ? $words / $counts['published'] : 0) ?> a post</span>
        </div>
        <?php if ($latest !== null): ?>
            <a class="tile" href="/admin/posts/<?= e($latest['slug']) ?>">
                <span class="tile__label">Last published</span>
                <span class="tile__value"><?= e($ago((int) strtotime((string) $latest['published_at']))) ?></span>
                <span class="tile__note"><?= e($latest['title'] ?? $latest['slug']) ?></span>
            </a>
        <?php endif; ?>
    </section>

    <section class="panel">
        <h2 class="panel__title">Posts published per month <small><?= $publishedThisYear ?> in the last twelve</small></h2>

        <?php // One bar per month. The numbers are in the markup as text too, so a screen reader gets a list, not a picture. ?>
        <ol class="months">
            <?php foreach ($months as $month => $count): ?>
                <?php $label = date('M Y', (int) strtotime($month . '-01')); ?>
                <li class="months__month" tabindex="0" data-tip="<?= e($label) ?>: <?= $count ?> <?= $count === 1 ? 'post' : 'posts' ?>">
                    <span class="months__bar<?= $count === 0 ? ' months__bar--none' : '' ?>" style="height: <?= $count === 0 ? 0 : max(6, round($count / $peak * 100)) ?>%"></span>
                    <span class="months__name" aria-hidden="true"><?= e(substr($label, 0, 3)) ?></span>
                    <span class="sr-only"><?= e($label) ?>: <?= $count ?> <?= $count === 1 ? 'post' : 'posts' ?></span>
                </li>
            <?php endforeach; ?>
        </ol>
    </section>

    <div class="start__columns">
        <?php if ($drafts !== []): ?>
            <section class="panel">
                <h2 class="panel__title">Drafts</h2>
                <ul class="shortlist">
                    <?php foreach ($drafts as $post): ?>
                        <li>
                            <a href="/admin/posts/<?= e($post['slug']) ?>"><?= e($post['title'] ?? $post['slug']) ?></a>
                            <small><?= (int) $post['words'] ?> words · edited <?= e($ago((int) $post['updated_at'])) ?></small>
                        </li>
                    <?php endforeach; ?>
                </ul>
            </section>
        <?php endif; ?>

        <section class="panel">
            <h2 class="panel__title">Recently edited</h2>
            <ul class="shortlist">
                <?php foreach ($recent as $post): ?>
                    <li>
                        <a href="/admin/posts/<?= e($post['slug']) ?>"><?= e($post['title'] ?? $post['slug']) ?></a>
                        <small><?= e($post['status'] ?? '') ?> · edited <?= e($ago((int) $post['updated_at'])) ?></small>
                    </li>
                <?php endforeach; ?>
            </ul>
        </section>

        <?php if ($attention !== []): ?>
            <section class="panel">
                <h2 class="panel__title">Worth a look <small><?= $attentionTotal ?></small></h2>
                <ul class="shortlist">
                    <?php foreach ($attention as [$post, $problem]): ?>
                        <li>
                            <a href="/admin/posts/<?= e($post['slug']) ?>"><?= e($post['title'] ?? $post['slug']) ?></a>
                            <small><?= e($problem) ?></small>
                        </li>
                    <?php endforeach; ?>
                </ul>
            </section>
        <?php endif; ?>
    </div>
</div>
