<?php

declare(strict_types=1);

namespace Lagom\Auth;

use Lagom\Role;

/**
 * Somebody who is signed in, for the length of one request.
 *
 * The CSRF token belongs to their session rather than to them: it is a second
 * secret that pages we serve know and other sites do not, and every request that
 * changes something has to send it back.
 */
final readonly class User
{
    public function __construct(
        public int $id,
        public string $email,
        public Role $role,
        public string $csrfToken,
    ) {
    }
}
