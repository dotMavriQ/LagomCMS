<?php

declare(strict_types=1);

namespace Lagom\Http;

/**
 * One incoming HTTP request, read once from PHP's superglobals.
 *
 * Everything past public/index.php takes one of these instead of reaching for
 * $_GET, $_POST and $_SERVER itself. It makes the handlers honest about what they
 * read, and it means a test can build a request by hand.
 */
final readonly class Request
{
    /**
     * @param array<string, mixed>  $query   the parsed query string
     * @param array<string, mixed>  $form    a submitted HTML form
     * @param array<string, string> $cookies
     * @param array<string, string> $headers names in lower case
     * @param array<string, mixed>  $files   uploads, in PHP's $_FILES layout
     */
    public function __construct(
        public string $method,
        public string $path,
        public array $query = [],
        public array $form = [],
        public array $cookies = [],
        public array $headers = [],
        public string $body = '',
        public array $files = [],
        public string $ip = '',
        public bool $secure = false,
    ) {
    }

    public static function fromGlobals(): self
    {
        $headers = [];
        foreach ($_SERVER as $key => $value) {
            if (str_starts_with($key, 'HTTP_')) {
                $headers[strtolower(str_replace('_', '-', substr($key, 5)))] = (string) $value;
            }
        }
        // PHP files these two away without the HTTP_ prefix.
        $headers['content-type'] = (string) ($_SERVER['CONTENT_TYPE'] ?? '');

        return new self(
            method: strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'),
            path: rawurldecode((string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH)),
            query: $_GET,
            form: $_POST,
            cookies: $_COOKIE,
            headers: $headers,
            body: (string) file_get_contents('php://input'),
            files: $_FILES,
            ip: self::clientAddress((string) ($_SERVER['REMOTE_ADDR'] ?? ''), $headers['x-forwarded-for'] ?? ''),
            // Behind a proxy (Traefik, Caddy) the original scheme arrives in a header.
            secure: ($headers['x-forwarded-proto'] ?? '') === 'https' || ($_SERVER['HTTPS'] ?? '') === 'on',
        );
    }

    /**
     * Whose request this really is.
     *
     * Behind a reverse proxy (Traefik, Caddy, nginx) every connection arrives from
     * the proxy, so the address PHP sees is the proxy's and all visitors look like
     * one person. The proxy writes the real address into X-Forwarded-For. But any
     * visitor can send that header too, so it is only believed when the connection
     * comes from a proxy we were told to trust: the LAGOM_TRUSTED_PROXIES variable,
     * a comma-separated list of addresses or ranges such as "172.19.0.0/16".
     *
     * The header can list several hops, "client, proxy1, proxy2". Reading from the
     * right, the first address that is not one of our own proxies is the visitor.
     */
    public static function clientAddress(string $connectedFrom, string $forwardedFor): string
    {
        $trusted = array_filter(array_map('trim', explode(',', (string) getenv('LAGOM_TRUSTED_PROXIES'))));
        if ($trusted === [] || $forwardedFor === '' || !self::isInAny($connectedFrom, $trusted)) {
            return $connectedFrom;
        }

        $hops = array_reverse(array_map('trim', explode(',', $forwardedFor)));
        foreach ($hops as $hop) {
            if (filter_var($hop, FILTER_VALIDATE_IP) !== false && !self::isInAny($hop, $trusted)) {
                return $hop;
            }
        }

        return $connectedFrom;
    }

    /**
     * Is an address one of these, or inside one of these ranges ("10.0.0.0/8")?
     *
     * @param list<string> $ranges
     */
    private static function isInAny(string $address, array $ranges): bool
    {
        $packed = @inet_pton($address);
        if ($packed === false) {
            return false;
        }

        foreach ($ranges as $range) {
            [$network, $bits] = array_pad(explode('/', $range, 2), 2, null);
            $networkPacked = @inet_pton($network);
            // An IPv4 address is never inside an IPv6 range, and the other way round.
            if ($networkPacked === false || strlen($networkPacked) !== strlen($packed)) {
                continue;
            }

            // Compare the first $bits bits: whole bytes first, then what is left of the last one.
            $bits = $bits === null ? strlen($packed) * 8 : max(0, min((int) $bits, strlen($packed) * 8));
            $bytes = intdiv($bits, 8);
            $rest = $bits % 8;
            if (substr($packed, 0, $bytes) !== substr($networkPacked, 0, $bytes)) {
                continue;
            }
            if ($rest === 0 || (ord($packed[$bytes]) >> (8 - $rest)) === (ord($networkPacked[$bytes]) >> (8 - $rest))) {
                return true;
            }
        }

        return false;
    }

    /** The address this request was sent to, without a path: "https://example.org". */
    public function origin(): string
    {
        return ($this->secure ? 'https' : 'http') . '://' . $this->header('host');
    }

    public function header(string $name): string
    {
        return $this->headers[strtolower($name)] ?? '';
    }

    /**
     * The body as decoded JSON, or null when it is not a JSON object.
     *
     * @return array<string, mixed>|null
     */
    public function json(): ?array
    {
        if (!str_contains($this->header('content-type'), 'application/json')) {
            return null;
        }
        $decoded = json_decode($this->body, true);

        return is_array($decoded) ? $decoded : null;
    }

    /** GET and HEAD only look. Everything else changes something and gets extra checks. */
    public function isReadOnly(): bool
    {
        return $this->method === 'GET' || $this->method === 'HEAD';
    }

    /**
     * Did this request come from a page on our own site?
     *
     * Browsers attach an Origin header to anything that could change state. If it
     * names a different site, some other page is trying to act with our visitor's
     * cookie (cross-site request forgery) and the request is dropped. No Origin at
     * all means it is not a browser form or fetch (curl, a script), which carries
     * no ambient cookie to abuse.
     */
    public function isSameOrigin(): bool
    {
        $origin = $this->header('origin');
        if ($origin === '') {
            return true;
        }

        $host = parse_url($origin, PHP_URL_HOST);
        $port = parse_url($origin, PHP_URL_PORT);

        return ($port === null ? $host : $host . ':' . $port) === $this->header('host');
    }
}
