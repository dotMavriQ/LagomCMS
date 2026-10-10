<?php

declare(strict_types=1);

namespace Lagom;

/**
 * What a signed-in person is allowed to do.
 *
 * Roles are ranked, not compared: an admin can do everything an editor can.
 * Somebody who is not signed in has no role at all (null), not a "guest" role.
 */
enum Role: string
{
    case Editor = 'editor';
    case Admin = 'admin';

    public function isAtLeast(Role $required): bool
    {
        return $this->rank() >= $required->rank();
    }

    private function rank(): int
    {
        return match ($this) {
            Role::Editor => 1,
            Role::Admin => 2,
        };
    }
}
