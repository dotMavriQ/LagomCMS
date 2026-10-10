<?php

declare(strict_types=1);

namespace Lagom\Index;

use Lagom\Collections;
use Lagom\Content\Blocks;
use Lagom\Content\Document;
use PDO;

/**
 * The index: a SQLite copy of the content folder that can be queried.
 *
 * The Markdown files in content/ are the truth. This database is a cache of them,
 * with the front matter and the parsed body stored per document, so that a request
 * never has to parse Markdown. Delete var/index.sqlite and it is rebuilt on the
 * next request, in well under a second for a few hundred documents.
 *
 * Keeping the two in step is deliberately dumb: on each request we stat every
 * content file (cheap, the kernel has them cached) and re-read the ones whose
 * modification time or size changed. That means you can edit a file in Obsidian,
 * vim or over git and the site picks it up on the next page load, with no watcher
 * process to keep alive.
 */
final class Index
{
    /**
     * Bump this when the table layout changes, or when the parser starts producing
     * different blocks for the same Markdown. The index is then rebuilt from scratch
     * on the next request; without the bump, unchanged files would keep serving
     * whatever the old parser made of them.
     */
    private const SCHEMA_VERSION = 4;

    /** Sort keys that are real columns. Anything else is looked up in the front matter. */
    private const SORT_COLUMNS = ['published_at', 'updated_at', 'title', 'slug'];

    private PDO $db;

    public function __construct(
        private readonly string $databasePath,
        private readonly string $contentDirectory,
        private readonly Collections $collections,
    ) {
        $this->db = new PDO('sqlite:' . $databasePath, options: [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);

        // WAL lets readers carry on while a save is being written.
        $this->db->exec('PRAGMA journal_mode = WAL');
        $this->db->exec('PRAGMA synchronous = NORMAL');

        $this->createTables();
    }

    /**
     * Bring the index in line with the files on disk.
     *
     * @return int how many documents were added, re-read or removed
     */
    public function refresh(): int
    {
        $known = [];
        foreach ($this->db->query('SELECT collection, slug, updated_at, size FROM documents') as $row) {
            $known[$row['collection'] . '/' . $row['slug']] = [(int) $row['updated_at'], (int) $row['size']];
        }

        $stale = [];
        foreach ($this->filesOnDisk() as $id => [$path, $collection, $slug]) {
            $onDisk = [(int) filemtime($path), (int) filesize($path)];
            if (($known[$id] ?? null) !== $onDisk) {
                $stale[] = [$path, $collection, $slug];
            }
            unset($known[$id]);
        }

        // Whatever is still in $known has no file any more.
        if ($stale === [] && $known === []) {
            return 0;
        }

        $parser = new Blocks();
        $this->db->beginTransaction();
        foreach ($stale as [$path, $collection, $slug]) {
            $this->store(Document::fromFile($path, $collection, $slug, $parser));
        }
        $forget = $this->db->prepare('DELETE FROM documents WHERE collection = ? AND slug = ?');
        foreach (array_keys($known) as $id) {
            $forget->execute(explode('/', $id, 2));
        }
        $this->db->commit();

        return count($stale) + count($known);
    }

    /**
     * One document, or null if there is none.
     *
     * @return array<string, mixed>|null
     */
    public function find(string $collection, string $slug): ?array
    {
        $query = $this->db->prepare('SELECT * FROM documents WHERE collection = ? AND slug = ?');
        $query->execute([$collection, $slug]);

        return $query->fetch() ?: null;
    }

    /**
     * A page of a collection.
     *
     * $sort is a field name, with a leading "-" for descending ("-published_at").
     * Documents that lack the field sort last either way, and ties are broken by
     * slug so the order never shuffles between two requests.
     *
     * One row more than $size is fetched and then dropped again; its existence is
     * how the caller learns there is another page, without a second COUNT query.
     *
     * @return array{rows: list<array<string, mixed>>, hasMore: bool}
     */
    public function list(string $collection, string $sort, int $size, int $offset, bool $publishedOnly): array
    {
        $descending = str_starts_with($sort, '-');
        $name = ltrim($sort, '-');

        // The name goes into the SQL text, so it is checked against the collection's
        // own field list by the caller and is never raw user input here.
        $expression = in_array($name, self::SORT_COLUMNS, true)
            ? $name
            : "json_extract(fields, '$." . $name . "')";

        $sql = 'SELECT * FROM documents WHERE collection = :collection'
            . ($publishedOnly ? " AND status = 'published'" : '')
            . " ORDER BY $expression IS NULL, $expression " . ($descending ? 'DESC' : 'ASC') . ', slug ASC'
            . ' LIMIT :limit OFFSET :offset';

        $query = $this->db->prepare($sql);
        $query->bindValue(':collection', $collection);
        $query->bindValue(':limit', $size + 1, PDO::PARAM_INT);
        $query->bindValue(':offset', $offset, PDO::PARAM_INT);
        $query->execute();
        $rows = $query->fetchAll();

        $hasMore = count($rows) > $size;
        if ($hasMore) {
            array_pop($rows);
        }

        return ['rows' => $rows, 'hasMore' => $hasMore];
    }

    /**
     * Every document's name and status, for the admin's quick switcher.
     * Newest first where there is a date, alphabetical otherwise.
     *
     * @return list<array<string, mixed>>
     */
    public function outline(): array
    {
        return $this->db->query(<<<'SQL'
            SELECT collection, slug, title, status, published_at, updated_at
            FROM documents
            ORDER BY collection, published_at IS NULL, published_at DESC, title COLLATE NOCASE
            SQL)->fetchAll();
    }

    /**
     * The facts about every document in a collection, without the bodies.
     *
     * This is what the start page counts and sorts. Leaving `blocks` out matters:
     * that column is most of the database, and nobody needs 40 full posts to draw
     * four numbers.
     *
     * @return list<array<string, mixed>>
     */
    public function summaries(string $collection): array
    {
        $query = $this->db->prepare(<<<'SQL'
            SELECT collection, slug, title, status, published_at, updated_at, words, parse_error, fields
            FROM documents WHERE collection = ?
            ORDER BY updated_at DESC, slug
            SQL);
        $query->execute([$collection]);

        return $query->fetchAll();
    }

    /** How many documents the index holds. Shown on the health endpoint. */
    public function count(): int
    {
        return (int) $this->db->query('SELECT COUNT(*) FROM documents')->fetchColumn();
    }

    private function createTables(): void
    {
        $version = (int) $this->db->query('PRAGMA user_version')->fetchColumn();
        if ($version === self::SCHEMA_VERSION) {
            return;
        }

        // Nothing in here is precious, so an old layout is simply thrown away.
        $this->db->exec('DROP TABLE IF EXISTS documents');
        $this->db->exec(<<<'SQL'
            CREATE TABLE documents (
                collection   TEXT NOT NULL,
                slug         TEXT NOT NULL,
                path         TEXT NOT NULL,
                hash         TEXT NOT NULL,
                size         INTEGER NOT NULL,
                updated_at   INTEGER NOT NULL,   -- the file's modification time
                status       TEXT,
                title        TEXT,
                published_at TEXT,
                fields       TEXT NOT NULL,      -- front matter, as JSON
                assets       TEXT NOT NULL,      -- uploaded images the fields point at, with sizes, as JSON
                field_order  TEXT NOT NULL,      -- front matter keys in file order, as JSON
                blocks       TEXT NOT NULL,      -- parsed body, as JSON
                excerpt      TEXT NOT NULL,
                words        INTEGER NOT NULL,
                parse_error  TEXT,
                PRIMARY KEY (collection, slug)
            ) WITHOUT ROWID
            SQL);
        $this->db->exec('CREATE INDEX documents_listing ON documents (collection, status, published_at)');
        $this->db->exec('PRAGMA user_version = ' . self::SCHEMA_VERSION);
    }

    private function store(Document $document): void
    {
        $fields = $document->fields;

        $this->db->prepare(<<<'SQL'
            INSERT OR REPLACE INTO documents
                (collection, slug, path, hash, size, updated_at, status, title, published_at,
                 fields, assets, field_order, blocks, excerpt, words, parse_error)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            SQL)->execute([
            $document->collection,
            $document->slug,
            $document->path,
            $document->hash,
            $document->size,
            $document->modifiedAt,
            is_string($fields['status'] ?? null) ? $fields['status'] : null,
            is_string($fields['title'] ?? null) ? $fields['title'] : null,
            is_string($fields['published_at'] ?? null) ? $fields['published_at'] : null,
            self::json($fields),
            self::json($this->assets($document)),
            self::json($document->fieldOrder),
            self::json($document->blocks),
            $document->excerpt,
            Blocks::countWords($document->blocks),
            $document->parseError,
        ]);
    }

    /**
     * The uploaded images a document's fields point at, with their pixel sizes.
     *
     * A frontend needs the size to lay an image out before it has loaded, and to
     * resize it sensibly. Measuring is done here, once, when the document is
     * indexed, so that no request ever has to open an image file to answer.
     *
     * @return array<string, array{src: string, width: int, height: int}> by field name
     */
    private function assets(Document $document): array
    {
        $assets = [];
        foreach ($this->collections->get($document->collection)['fields'] ?? [] as $field) {
            $value = $document->fields[$field['name']] ?? null;
            if ($field['type'] !== 'asset' || !is_string($value)) {
                continue;
            }

            // Only files of this very document count: /media/<collection>/<slug>/<file>.
            // That keeps a hand-edited field from pointing the indexer at any path it likes.
            $prefix = '/media/' . $document->collection . '/' . $document->slug . '/';
            $file = substr($value, strlen($prefix));
            if (!str_starts_with($value, $prefix) || $file === '' || str_contains($file, '/')) {
                continue;
            }

            $size = @getimagesize(dirname($document->path) . '/' . $file);
            if ($size !== false) {
                $assets[$field['name']] = ['src' => $value, 'width' => $size[0], 'height' => $size[1]];
            }
        }

        return $assets;
    }

    /**
     * Every document file under content/, keyed by "collection/slug".
     *
     * Only two shapes count: content/<collection>/<slug>/index.md, and
     * content/<collection>/index.md for a singleton. A stray index.md directly
     * inside a normal collection is ignored rather than quietly becoming a document.
     *
     * @return array<string, array{0: string, 1: string, 2: string}> id => [path, collection, slug]
     */
    private function filesOnDisk(): array
    {
        $files = [];
        foreach ($this->collections->all() as $name => $definition) {
            $directory = $this->contentDirectory . '/' . $name;

            if ($definition['singleton']) {
                if (is_file($directory . '/index.md')) {
                    $files[$name . '/' . $name] = [$directory . '/index.md', $name, $name];
                }
                continue;
            }

            foreach (glob($directory . '/*/index.md') ?: [] as $path) {
                $slug = basename(dirname($path));
                $files[$name . '/' . $slug] = [$path, $name, $slug];
            }
        }

        return $files;
    }

    private static function json(mixed $value): string
    {
        return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }
}
