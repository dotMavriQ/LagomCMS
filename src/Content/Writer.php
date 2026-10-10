<?php

declare(strict_types=1);

namespace Lagom\Content;

/**
 * Writes documents to disk. The only code that changes anything under content/.
 *
 * A document is a folder: content/posts/hello-world/ holds index.md and whatever
 * images were uploaded for that post. Singletons (site, home, cv) have no slug
 * and sit one level up, at content/site/index.md.
 *
 * Three rules it never bends:
 *   1. No lost updates. A save names the hash it started from and is refused if
 *      the file has changed since.
 *   2. No half-written files. Contents go to a temporary file first and are then
 *      renamed into place, which the filesystem does in one step.
 *   3. No real deletes. A "deleted" document is moved to var/trash/, folder and
 *      all, so a slip of the hand costs you a `mv` and not a post.
 */
final class Writer
{
    public function __construct(
        private readonly string $contentDirectory,
        private readonly string $trashDirectory,
    ) {
    }

    /** A slug becomes a folder name, so it is validated and never trusted. */
    public static function isValidSlug(string $slug): bool
    {
        return strlen($slug) <= 128 && preg_match('/^[a-z0-9][a-z0-9_-]*$/', $slug) === 1;
    }

    /** Turn a title into a slug: "Sooo... am I infected?" becomes "sooo-am-i-infected". */
    public static function slugify(string $title): string
    {
        $ascii = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $title) ?: $title;
        $slug = trim(preg_replace('/[^a-z0-9]+/', '-', strtolower($ascii)) ?? '', '-');

        return substr($slug, 0, 80);
    }

    /** Where a document's folder is. For a singleton, pass the collection name as the slug. */
    public function directory(string $collection, string $slug): string
    {
        return $collection === $slug
            ? $this->contentDirectory . '/' . $collection
            : $this->contentDirectory . '/' . $collection . '/' . $slug;
    }

    public function path(string $collection, string $slug): string
    {
        return $this->directory($collection, $slug) . '/index.md';
    }

    /**
     * Create a document that does not exist yet.
     *
     * @param array<string, mixed> $fields
     *
     * @throws Conflict when the slug is taken
     */
    public function create(string $collection, string $slug, array $fields, string $body): void
    {
        $path = $this->path($collection, $slug);
        if (is_file($path)) {
            throw new Conflict('A document with that slug already exists.');
        }

        if (!is_dir(dirname($path))) {
            mkdir(dirname($path), 0775, true);
        }
        $this->write($path, $fields, [], $body);
    }

    /**
     * Save changes to an existing document.
     *
     * $fields replaces the fields the collection knows about. Anything else that
     * was already in the front matter (a key added by hand, a field since removed
     * from the collection) is carried over untouched, because the editor has no
     * form for it and silently dropping it would be data loss.
     *
     * @param array<string, mixed> $fields     cleaned fields, see Fields::clean()
     * @param list<string>         $known      every field name the collection defines
     * @param string               $baseHash   the hash of the file as the editor loaded it
     *
     * @throws Conflict when the file changed since $baseHash
     */
    public function update(string $collection, string $slug, array $fields, array $known, string $body, string $baseHash): void
    {
        $path = $this->path($collection, $slug);
        $current = (string) file_get_contents($path);

        if (!hash_equals(hash('sha256', $current), $baseHash)) {
            throw new Conflict('The document changed after it was loaded.');
        }

        [$yaml] = FrontMatter::split($current);
        $existing = FrontMatter::parse($yaml);

        foreach ($existing as $key => $value) {
            if (!in_array($key, $known, true)) {
                $fields[$key] = $value;
            }
        }

        $this->write($path, $fields, FrontMatter::keyOrder($yaml), $body);
    }

    /** Move a document's whole folder (or a singleton's file) into the trash. */
    public function trash(string $collection, string $slug): void
    {
        if (!is_dir($this->trashDirectory)) {
            mkdir($this->trashDirectory, 0775, true);
        }

        $source = $collection === $slug ? $this->path($collection, $slug) : $this->directory($collection, $slug);
        rename($source, $this->trashDirectory . '/' . date('Ymd-His') . '-' . $collection . '-' . basename($source));
    }

    /**
     * @param array<string, mixed> $fields
     * @param list<string>         $order
     */
    private function write(string $path, array $fields, array $order, string $body): void
    {
        $contents = "---\n" . FrontMatter::dump($fields, $order) . "---\n";

        // One blank line between front matter and body, one newline at the very
        // end, and no trailing spaces sneaking in from a textarea.
        $body = trim(str_replace("\r\n", "\n", $body), "\n");
        if ($body !== '') {
            $contents .= "\n" . $body . "\n";
        }

        $temporary = $path . '.' . bin2hex(random_bytes(4)) . '.tmp';
        file_put_contents($temporary, $contents);
        rename($temporary, $path);

        // PHP remembers file sizes and times within a request. Forget them, or the
        // index refresh that follows would look at the file and see the old one.
        clearstatcache(true, $path);
    }
}
