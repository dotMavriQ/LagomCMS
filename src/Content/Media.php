<?php

declare(strict_types=1);

namespace Lagom\Content;

/**
 * Files uploaded for a document: images, mostly.
 *
 * An upload is stored in the document's own folder, right next to its index.md,
 * so a post and its pictures move, back up and get trashed together:
 *
 *     content/posts/hello-world/index.md
 *     content/posts/hello-world/harbour.jpg     served at /media/posts/hello-world/harbour.jpg
 *
 * Note that /media is public. A picture uploaded to a draft can be fetched by
 * anybody who guesses its address, even though the draft itself cannot be read.
 */
final class Media
{
    /**
     * What may be uploaded, and the Content-Type each is served with.
     *
     * SVG is left out on purpose. An SVG can carry JavaScript, and one served from
     * our own address would run with the editor's login.
     */
    public const TYPES = [
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'webp' => 'image/webp',
        'avif' => 'image/avif',
        'gif' => 'image/gif',
        'pdf' => 'application/pdf',
    ];

    private const MAX_BYTES = 25 * 1024 * 1024;

    /**
     * Move an upload into a document's folder.
     *
     * @param array<string, mixed> $upload one entry of $_FILES
     *
     * @return array{name: string, width: int|null, height: int|null}|string
     *         what was stored, or a sentence saying why nothing was
     */
    public static function store(array $upload, string $directory): array|string
    {
        if (($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            return 'The upload did not arrive in one piece. It may be larger than the server allows.';
        }
        if ($upload['size'] > self::MAX_BYTES) {
            return 'That file is over the 25 MB limit.';
        }

        $name = self::safeName((string) $upload['name']);
        $extension = pathinfo($name, PATHINFO_EXTENSION);
        if (!isset(self::TYPES[$extension])) {
            return 'Only images (jpg, png, webp, avif, gif) and PDFs can be uploaded.';
        }

        // A file called photo.jpg has to actually be an image. The browser's word
        // for it is not evidence.
        $size = null;
        if ($extension !== 'pdf') {
            $size = @getimagesize($upload['tmp_name']);
            if ($size === false) {
                return 'That does not look like an image.';
            }
        }

        // Uploading harbour.jpg twice keeps both, as harbour.jpg and harbour-2.jpg.
        $base = pathinfo($name, PATHINFO_FILENAME);
        for ($n = 2; is_file($directory . '/' . $name); $n++) {
            $name = $base . '-' . $n . '.' . $extension;
        }

        if (!move_uploaded_file($upload['tmp_name'], $directory . '/' . $name)) {
            return 'The file could not be saved. Check that content/ is writable.';
        }

        return ['name' => $name, 'width' => $size[0] ?? null, 'height' => $size[1] ?? null];
    }

    /**
     * Every uploaded file in a document's folder, newest first.
     *
     * @return list<array{name: string, width: int|null, height: int|null}>
     */
    public static function list(string $directory): array
    {
        $files = [];
        foreach (glob($directory . '/*') ?: [] as $path) {
            $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));
            if (!is_file($path) || !isset(self::TYPES[$extension])) {
                continue;
            }
            $size = $extension === 'pdf' ? false : @getimagesize($path);
            $files[] = [
                'name' => basename($path),
                'width' => $size[0] ?? null,
                'height' => $size[1] ?? null,
                'modified' => filemtime($path),
            ];
        }
        usort($files, fn (array $a, array $b): int => $b['modified'] <=> $a['modified']);

        return array_map(fn (array $f): array => array_diff_key($f, ['modified' => 0]), $files);
    }

    /** "Praia do Zavial (2).JPG" becomes "praia-do-zavial-2.jpg". */
    private static function safeName(string $name): string
    {
        $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        $base = Writer::slugify(pathinfo($name, PATHINFO_FILENAME));

        return ($base === '' ? 'file' : $base) . '.' . $extension;
    }
}
