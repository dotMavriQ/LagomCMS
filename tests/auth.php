<?php

declare(strict_types=1);

/**
 * Does signing in defend itself properly?
 *
 * Two things are checked, both of which fail quietly if they break:
 *   - whose address a request is counted against, with and without a proxy in front;
 *   - when an account, or an address, is locked out after wrong passwords.
 *
 *     php tests/auth.php
 *
 * It uses a throwaway accounts database, so no real account is touched.
 */

use Lagom\Auth\Accounts;
use Lagom\Http\Request;
use Lagom\Role;

require __DIR__ . '/../vendor/autoload.php';

$failed = 0;
$check = function (string $what, mixed $got, mixed $want) use (&$failed): void {
    if ($got === $want) {
        echo "ok    $what\n";
        return;
    }
    $failed++;
    echo "FAIL  $what (got " . var_export($got, true) . ")\n";
};

// ---- Whose request is it? ----

putenv('LAGOM_TRUSTED_PROXIES');
$check('no proxies named: the forwarded header is ignored', Request::clientAddress('172.19.0.2', '203.0.113.9'), '172.19.0.2');

putenv('LAGOM_TRUSTED_PROXIES=172.19.0.0/16, 10.0.0.5');
$check('trusted proxy: the visitor comes from the header', Request::clientAddress('172.19.0.2', '203.0.113.9'), '203.0.113.9');
$check('several hops: the rightmost address that is not ours', Request::clientAddress('172.19.0.2', '198.51.100.7, 203.0.113.9, 10.0.0.5'), '203.0.113.9');
$check('a forged header from a direct connection is ignored', Request::clientAddress('203.0.113.50', '1.2.3.4'), '203.0.113.50');
$check('nonsense in the header falls back to the connection', Request::clientAddress('172.19.0.2', 'not-an-ip'), '172.19.0.2');
$check('an address just outside the range is not trusted', Request::clientAddress('172.20.0.2', '203.0.113.9'), '172.20.0.2');

putenv('LAGOM_TRUSTED_PROXIES=fd00::/8');
$check('IPv6 ranges work too', Request::clientAddress('fd12::1', '2001:db8::7'), '2001:db8::7');
putenv('LAGOM_TRUSTED_PROXIES');

// ---- Lockout ----

$database = sys_get_temp_dir() . '/lagom-auth-test-' . getmypid() . '.sqlite';
$accounts = new Accounts($database);
$accounts->saveUser('ann@example.com', 'right-password-1', Role::Admin);
$accounts->saveUser('bob@example.com', 'right-password-2', Role::Editor);

$check('a right password signs in', $accounts->signIn('ann@example.com', 'right-password-1', '9.9.9.9') !== null, true);
$check('a wrong one does not', $accounts->signIn('ann@example.com', 'wrong', '9.9.9.9'), null);
$check('nor does an unknown email', $accounts->signIn('nobody@example.com', 'right-password-1', '9.9.9.9'), null);

for ($i = 0; $i < 5; $i++) {
    $accounts->signIn('ann@example.com', 'wrong', '9.9.9.9');
}
$check('five misses lock that account', $accounts->isLockedOut('9.9.9.9', 'ann@example.com'), true);
$check('from any address', $accounts->isLockedOut('8.8.8.8', 'ann@example.com'), true);
$check('but not somebody else at the same address', $accounts->isLockedOut('9.9.9.9', 'bob@example.com'), false);
$check('who can still sign in from it', $accounts->signIn('bob@example.com', 'right-password-2', '9.9.9.9') !== null, true);

for ($i = 0; $i < 16; $i++) {
    $accounts->signIn("guess$i@example.com", 'x', '7.7.7.7');
}
$check('16 misses across accounts from one address: not locked yet', $accounts->isLockedOut('7.7.7.7', 'bob@example.com'), false);
for ($i = 16; $i < 20; $i++) {
    $accounts->signIn("guess$i@example.com", 'x', '7.7.7.7');
}
$check('20 lock the address', $accounts->isLockedOut('7.7.7.7', 'bob@example.com'), true);

// ---- Changing a password ----

$cara = new Accounts($database);
$cara->saveUser('cara@example.com', 'first-password', Role::Editor);
$here = $cara->signIn('cara@example.com', 'first-password', '6.6.6.6');
$elsewhere = $cara->signIn('cara@example.com', 'first-password', '5.5.5.5');
$from = fn (?string $token): Request => new Request('POST', '/admin/account', cookies: [Accounts::COOKIE => (string) $token], ip: '6.6.6.6');
$user = $cara->currentUser($from($here));

$check('the wrong current password changes nothing', $cara->changePassword($from($here), $user, 'not-it', 'second-password'), false);
$check('the right one does', $cara->changePassword($from($here), $user, 'first-password', 'second-password'), true);
$check('the browser that changed it stays signed in', $cara->currentUser($from($here)) !== null, true);
$check('every other session is ended', $cara->currentUser($from($elsewhere)), null);
$check('the old password is dead', $cara->signIn('cara@example.com', 'first-password', '6.6.6.6'), null);
$check('the new one works', $cara->signIn('cara@example.com', 'second-password', '6.6.6.6') !== null, true);

unlink($database);

echo $failed === 0 ? "\nall passed\n" : "\n$failed failed\n";
exit($failed === 0 ? 0 : 1);
