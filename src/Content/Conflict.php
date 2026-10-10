<?php

declare(strict_types=1);

namespace Lagom\Content;

use RuntimeException;

/**
 * Thrown when a save would overwrite somebody else's change.
 *
 * Either the file was edited (in another tab, in Obsidian, by a git pull) after
 * the editor loaded it, or a new document's slug is already taken.
 */
final class Conflict extends RuntimeException
{
}
