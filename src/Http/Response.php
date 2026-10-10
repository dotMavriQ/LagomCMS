<?php

declare(strict_types=1);

namespace Lagom\Http;

/**
 * What a request handler hands back: a status, some headers and a body.
 *
 * Handlers return one of these instead of calling header() and echo themselves.
 * That keeps them testable (call the method, look at the object) and leaves
 * exactly one place, public/index.php, that actually talks to the web server.
 */
final readonly class Response
{
    /** @param array<string, string> $headers */
    public function __construct(
        public int $status,
        public string $body,
        public array $headers = [],
        /** When set, this file is streamed as the body instead of $body. */
        public ?string $file = null,
    ) {
    }

    /** @param array<string, mixed> $data */
    public static function json(int $status, array $data): self
    {
        return new self(
            $status,
            json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR),
            ['Content-Type' => 'application/json; charset=utf-8'],
        );
    }

    public static function html(int $status, string $html): self
    {
        return new self($status, $html, ['Content-Type' => 'text/html; charset=utf-8']);
    }

    /** A file from disk, streamed rather than loaded into memory first. */
    public static function file(string $path, string $contentType): self
    {
        return new self(200, '', [
            'Content-Type' => $contentType,
            'Content-Length' => (string) filesize($path),
            // Uploads are never rewritten in place (a second upload gets a new
            // name), so browsers may keep them for a good while.
            'Cache-Control' => 'public, max-age=604800',
            // "Believe the Content-Type above, do not guess."
            'X-Content-Type-Options' => 'nosniff',
        ], $path);
    }

    public static function redirect(string $location): self
    {
        // 303 means "now GET this", which is what you want after a form post.
        return new self(303, '', ['Location' => $location]);
    }

    /** The same response with one more header. Used to attach cookies. */
    public function withHeader(string $name, string $value): self
    {
        return new self($this->status, $this->body, [...$this->headers, $name => $value], $this->file);
    }

    /** The error shape every API failure uses: a stable code plus a sentence for humans. */
    public static function error(int $status, string $code, string $message): self
    {
        return self::json($status, ['error' => $code, 'message' => $message]);
    }

    public function send(): void
    {
        http_response_code($this->status);
        foreach ($this->headers as $name => $value) {
            header($name . ': ' . $value);
        }

        if ($this->file !== null) {
            readfile($this->file);

            return;
        }
        echo $this->body;
    }
}
