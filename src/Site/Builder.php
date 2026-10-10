<?php

declare(strict_types=1);

namespace Lagom\Site;

/**
 * Publishes the website: turns the content into plain HTML files.
 *
 * The public site is static. Nothing renders a page when a visitor asks for it; the
 * pages already exist as files, and serving a file is as fast and as hard to break
 * as a website gets. The price is that a change has to be "published": the Astro
 * project (see `site` in config.php) is built again, which takes a few seconds.
 *
 * How a publish goes:
 *
 *   1. Something changes (a save in the admin, new fediverse posts) and calls
 *      request(). That only leaves a note saying "a build is wanted" and, if no
 *      build is running, starts one in the background. The save itself returns at
 *      once; nobody waits for a build.
 *   2. The background process (`bin/lagom build`, which calls run()) builds the site
 *      into a fresh folder next to the live one.
 *   3. Only if the build succeeds are the two folders swapped. A build that fails
 *      leaves the live site exactly as it was.
 *   4. If more changes arrived while it was building, it goes round again, so the
 *      site always ends up matching the content, however fast you were typing.
 *
 * Everything it keeps is under var/: var/site/current is the live site, and
 * var/build/ holds the note, the lock, the last log and a small status file the
 * admin reads.
 */
final class Builder
{
    private string $liveDirectory;
    private string $workDirectory;

    /**
     * @param string $sitePath the Astro project to build
     * @param string $command  what to run inside it; "--outDir <folder>" is added to the end
     * @param string $data     this installation's data folder (the one holding var/)
     * @param string $root     where the CMS's own code is, to find bin/lagom
     */
    public function __construct(
        private readonly string $sitePath,
        private readonly string $command,
        private readonly string $data,
        private readonly string $root,
    ) {
        $this->liveDirectory = $data . '/var/site';
        $this->workDirectory = $data . '/var/build';
    }

    /** The folder the live site is served from. It does not exist until the first build has succeeded. */
    public function currentSite(): string
    {
        return $this->liveDirectory . '/current';
    }

    /** Is there an Astro project to build at all? Without one there is nothing to publish. */
    public function isConfigured(): bool
    {
        return is_file($this->sitePath . '/package.json');
    }

    /** Note where this CMS answers, for builds nobody passes an address to. */
    public function remember(string $cmsUrl): void
    {
        $this->prepare();
        file_put_contents($this->workDirectory . '/url', $cmsUrl);
    }

    public function knowsWhereTheCmsIs(): bool
    {
        return is_file($this->workDirectory . '/url');
    }

    /**
     * Ask for the site to be published. Returns immediately.
     *
     * The build fetches the content over HTTP, so it has to be told where this CMS
     * is. Callers that know (a signed-in save knows which address the admin was
     * opened at) pass it, and it is remembered. Callers that cannot be trusted to
     * know pass null and the remembered address is used: a request from the public
     * could claim any Host it liked, and we are not building the site from there.
     *
     * @param string|null $cmsUrl where the build can reach this CMS's API, e.g. http://127.0.0.1:4702
     */
    public function request(?string $cmsUrl = null): void
    {
        if (!$this->isConfigured()) {
            return;
        }

        $this->prepare();

        if ($cmsUrl !== null) {
            $this->remember($cmsUrl);
        } elseif ($this->knowsWhereTheCmsIs()) {
            $cmsUrl = trim((string) file_get_contents($this->workDirectory . '/url'));
        } else {
            return; // Nobody has published from the admin yet, so there is nowhere to build from.
        }

        file_put_contents($this->workDirectory . '/requested', $cmsUrl);

        // Start a builder unless one is already at work. If one is, it will find the
        // note we just left when it finishes its current round.
        $lock = fopen($this->workDirectory . '/lock', 'c');
        if ($lock === false) {
            return;
        }
        $free = flock($lock, LOCK_EX | LOCK_NB);
        if ($free) {
            flock($lock, LOCK_UN);
        }
        fclose($lock);
        if (!$free) {
            return;
        }

        // Detached from this request: output thrown away, "&" so we do not wait for it,
        // and nohup so it outlives the web request that started it.
        $php = getenv('LAGOM_PHP') ?: (in_array(PHP_SAPI, ['cli', 'cli-server'], true) ? PHP_BINARY : 'php');
        $environment = 'LAGOM_DATA=' . escapeshellarg($this->data);
        exec(sprintf('%s nohup %s %s build --queued > /dev/null 2>&1 &', $environment, escapeshellarg($php), escapeshellarg($this->root . '/bin/lagom')));
    }

    /**
     * Build until the site matches the content. Meant to run in the background.
     *
     * @param bool $evenIfNotAsked build once even when no change is waiting (`bin/lagom build`)
     *
     * @return bool whether the last build succeeded
     */
    public function run(bool $evenIfNotAsked = false): bool
    {
        $this->prepare();

        // One builder at a time. A second one leaves straight away.
        $lock = fopen($this->workDirectory . '/lock', 'c');
        if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) {
            return true;
        }

        if ($evenIfNotAsked && !is_file($this->workDirectory . '/requested') && is_file($this->workDirectory . '/url')) {
            copy($this->workDirectory . '/url', $this->workDirectory . '/requested');
        }

        $succeeded = true;
        while (is_file($this->workDirectory . '/requested')) {
            $url = trim((string) file_get_contents($this->workDirectory . '/requested'));
            unlink($this->workDirectory . '/requested');
            $succeeded = $this->buildOnce($url);
        }

        flock($lock, LOCK_UN);
        fclose($lock);

        // A request can slip in between our last look and letting go of the lock; its
        // sender saw us still at work and started nobody. So look once more.
        if (is_file($this->workDirectory . '/requested')) {
            return $this->run();
        }

        return $succeeded;
    }

    /**
     * Where things stand, for the admin.
     *
     * @return array{state: string, started?: int, finished?: int, seconds?: float, message?: string}
     *         state is one of: never, building, published, failed
     */
    public function status(): array
    {
        $file = $this->workDirectory . '/status.json';
        $status = is_file($file) ? json_decode((string) file_get_contents($file), true) : null;
        if (!is_array($status)) {
            return ['state' => 'never'];
        }

        // A change is waiting for a builder that has not picked it up yet.
        if ($status['state'] !== 'building' && is_file($this->workDirectory . '/requested')) {
            $status['state'] = 'building';
        }

        return $status;
    }

    /** The output of the last build, for when it failed and somebody needs to know why. */
    public function lastLog(): string
    {
        $file = $this->workDirectory . '/last.log';

        return is_file($file) ? (string) file_get_contents($file) : '';
    }

    private function buildOnce(string $cmsUrl): bool
    {
        $started = microtime(true);
        $this->writeStatus(['state' => 'building', 'started' => time()]);

        // Astro builds into a folder inside its own project, and the result is then
        // copied to where the site is served from. Building straight into var/ would be
        // one step fewer, but Astro moves files around by renaming them, and a rename
        // cannot cross from one disk to another: it fails outright when the data folder
        // is its own volume, which under Docker it usually is.
        $built = $this->sitePath . '/.lagom-build';
        $this->remove($built);

        // LAGOM_URL tells the Astro package where to fetch the content from.
        $command = sprintf(
            'cd %s && LAGOM_URL=%s %s --outDir %s 2>&1',
            escapeshellarg($this->sitePath),
            escapeshellarg($cmsUrl),
            $this->command,
            escapeshellarg($built),
        );
        exec($command, $output, $exitCode);
        file_put_contents($this->workDirectory . '/last.log', implode("\n", $output) . "\n");

        $next = $this->liveDirectory . '/next';
        $this->remove($next);
        if ($exitCode === 0 && is_file($built . '/index.html')) {
            $this->copy($built, $next);
        }
        $this->remove($built);

        $seconds = round(microtime(true) - $started, 1);

        if ($exitCode !== 0 || !is_file($next . '/index.html')) {
            $this->remove($next);
            $this->writeStatus([
                'state' => 'failed',
                'started' => (int) $started,
                'finished' => time(),
                'seconds' => $seconds,
                'message' => $this->lastMeaningfulLine($output),
            ]);

            return false;
        }

        // The swap: the old site steps aside, the new one takes its place, and only
        // then is the old one deleted. Each step is a rename, which is instant, so
        // there is no moment when a visitor could be served half a site.
        $current = $this->currentSite();
        $previous = $this->liveDirectory . '/previous';
        $this->remove($previous);
        if (is_dir($current)) {
            rename($current, $previous);
        }
        rename($next, $current);
        $this->remove($previous);

        $this->writeStatus(['state' => 'published', 'started' => (int) $started, 'finished' => time(), 'seconds' => $seconds]);

        return true;
    }

    private function prepare(): void
    {
        foreach ([$this->liveDirectory, $this->workDirectory] as $directory) {
            if (!is_dir($directory)) {
                mkdir($directory, 0775, true);
            }
        }
    }

    /** @param array<string, mixed> $status */
    private function writeStatus(array $status): void
    {
        file_put_contents($this->workDirectory . '/status.json', json_encode($status));
    }

    /**
     * The line of a failed build's output most likely to say what went wrong.
     *
     * Build tools print the reason first and a stack trace after it, so the last line
     * is usually "at async something (file.js:202:7)", which helps nobody. Lines that
     * look like an error are preferred; failing that, the last line that is not part
     * of a stack trace.
     *
     * @param list<string> $output
     */
    private function lastMeaningfulLine(array $output): string
    {
        $fallback = 'The build stopped without saying why.';
        $found = null;

        foreach ($output as $line) {
            // Strip the colour codes build tools print, then see if anything is left.
            $plain = trim((string) preg_replace('/\e\[[0-9;]*m/', '', $line));
            $isTrace = preg_match('/^(at |Location:|Stack trace:|file:|\/)/', $plain) === 1;
            if ($plain === '' || $isTrace || preg_match('/[a-zA-Z]{3}/', $plain) !== 1) {
                continue;
            }

            // "[ERROR] ...", "Error: ...", "EXDEV: ...", "TypeError: ...".
            if (preg_match('/\[ERROR\]|^[A-Za-z]*Error\b|^E[A-Z]{3,}:|^Cannot /', $plain) === 1) {
                $found = $plain;
            }
            $fallback = $plain;
        }

        return mb_strimwidth($found ?? $fallback, 0, 300, '…');
    }

    /** Copy a folder and everything in it. */
    private function copy(string $from, string $to): void
    {
        mkdir($to, 0775, true);
        $items = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($from, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::SELF_FIRST,
        );
        foreach ($items as $item) {
            $target = $to . '/' . $items->getSubPathname();
            $item->isDir() ? mkdir($target, 0775) : copy($item->getPathname(), $target);
        }
    }

    /** Delete a folder and everything in it. */
    private function remove(string $directory): void
    {
        if (!is_dir($directory)) {
            return;
        }
        $items = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($directory, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST,
        );
        foreach ($items as $item) {
            $item->isDir() && !$item->isLink() ? rmdir($item->getPathname()) : unlink($item->getPathname());
        }
        rmdir($directory);
    }
}
