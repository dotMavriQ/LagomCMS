<?php

declare(strict_types=1);

namespace Lagom\Content;

use Symfony\Component\Yaml\Exception\ParseException;

/**
 * One content file, read and parsed.
 *
 * A document is identified by its collection and slug, and both come from where
 * the file sits: content/posts/hello-world/index.md is the post "hello-world".
 * Nothing in the file itself says what it is.
 *
 * The hash is the SHA-256 of the raw file. It is how the editor notices that a
 * file changed on disk while a tab had it open: a save has to say which hash it
 * started from, and is refused if the file has moved on since.
 */
final readonly class Document
{
    /**
     * @param array<string, mixed>       $fields     the front matter
     * @param list<string>               $fieldOrder front matter keys in the order they were written
     * @param list<array<string, mixed>> $blocks     the parsed body
     */
    public function __construct(
        public string $collection,
        public string $slug,
        public string $path,
        public string $hash,
        public int $modifiedAt,
        public int $size,
        public array $fields,
        public array $fieldOrder,
        public array $blocks,
        public string $excerpt,
        public ?string $parseError,
    ) {
    }

    /** Read and parse a file. The caller already knows which document it is. */
    public static function fromFile(string $path, string $collection, string $slug, Blocks $parser): self
    {
        $contents = (string) file_get_contents($path);
        [$yaml, $body] = FrontMatter::split($contents);

        // Broken front matter must not make a document disappear. It is kept, with
        // no fields and the error attached, so the admin can show what is wrong.
        $fields = [];
        $parseError = null;
        try {
            $fields = FrontMatter::parse($yaml);
        } catch (ParseException $e) {
            $parseError = 'front matter: ' . $e->getMessage();
        }

        $blocks = $parser->parse($body);

        return new self(
            collection: $collection,
            slug: $slug,
            path: $path,
            hash: hash('sha256', $contents),
            modifiedAt: (int) filemtime($path),
            size: strlen($contents),
            fields: $fields,
            fieldOrder: FrontMatter::keyOrder($yaml),
            blocks: $blocks,
            excerpt: Blocks::toText($blocks, 200),
            parseError: $parseError,
        );
    }
}
