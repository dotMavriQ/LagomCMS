<?php

declare(strict_types=1);

namespace Lagom\Auth;

use Lagom\Http\Request;
use Lagom\Role;
use PDO;

/**
 * Who may sign in, and who is signed in right now.
 *
 * Accounts and sessions live in var/accounts.sqlite. Unlike the index next to it,
 * this file is NOT disposable: delete it and every account is gone. Back it up
 * along with content/.
 *
 * How a session works: signing in creates a long random token. The browser gets
 * it in a cookie; we keep only its SHA-256. Somebody who steals the database
 * therefore cannot turn what they find into a working cookie.
 */
final class Accounts
{
    public const COOKIE = 'lagom_sid';

    private const SESSION_LIFETIME = 30 * 24 * 3600;

    /**
     * Sign-in pauses for a while after too many wrong passwords. Two separate counts:
     *
     *  - per account: five misses on one email lock that email, wherever they came
     *    from. This is what stops somebody guessing your password.
     *  - per address: twenty misses from one address lock that address, whichever
     *    emails it tried. This is what stops somebody trying one password on many
     *    accounts.
     *
     * The address limit is deliberately the looser one. If the site sits behind a
     * proxy that nobody told us about, every visitor shares the proxy's address, and
     * a tight limit there would let one person's typos lock everybody out.
     */
    private const MAX_FAILURES_PER_EMAIL = 5;
    private const MAX_FAILURES_PER_ADDRESS = 20;
    private const FAILURE_WINDOW = 15 * 60;

    private PDO $db;

    public function __construct(string $databasePath)
    {
        $this->db = new PDO('sqlite:' . $databasePath, options: [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $this->db->exec('PRAGMA journal_mode = WAL');
        $this->db->exec(<<<'SQL'
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY,
                email         TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role          TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
                csrf_token TEXT NOT NULL,
                expires_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS failed_logins (
                ip    TEXT NOT NULL,
                email TEXT NOT NULL DEFAULT '',
                at    INTEGER NOT NULL
            );
            SQL);

        // Installations from before misses were counted per account have no email column yet.
        $columns = array_column($this->db->query('PRAGMA table_info(failed_logins)')->fetchAll(), 'name');
        if (!in_array('email', $columns, true)) {
            $this->db->exec("ALTER TABLE failed_logins ADD COLUMN email TEXT NOT NULL DEFAULT ''");
        }
    }

    public function hasAnyUser(): bool
    {
        return (int) $this->db->query('SELECT COUNT(*) FROM users')->fetchColumn() > 0;
    }

    /** Create an account, or replace the password and role of an existing one. */
    public function saveUser(string $email, string $password, Role $role): void
    {
        $this->db->prepare(<<<'SQL'
            INSERT INTO users (email, password_hash, role) VALUES (:email, :hash, :role)
            ON CONFLICT (email) DO UPDATE SET password_hash = :hash, role = :role
            SQL)->execute([
            'email' => strtolower(trim($email)),
            'hash' => password_hash($password, PASSWORD_DEFAULT),
            'role' => $role->value,
        ]);
    }

    /**
     * Replace somebody's password with one they picked, once they have proved they
     * know the current one. False means the current password was wrong.
     *
     * A session cookie alone is not enough to change a password: a laptop left open
     * would otherwise be all it takes to lock its owner out for good. A wrong guess
     * here counts as a missed sign-in, so this is no way around the lockout either.
     *
     * Every other session of this account ends. If the reason for the change is that
     * somebody else got in, they are out again; the browser doing the changing stays
     * signed in.
     */
    public function changePassword(Request $request, User $user, string $current, string $new): bool
    {
        $query = $this->db->prepare('SELECT password_hash FROM users WHERE id = ?');
        $query->execute([$user->id]);

        if (!password_verify($current, (string) $query->fetchColumn())) {
            $this->db->prepare('INSERT INTO failed_logins (ip, email, at) VALUES (?, ?, ?)')
                ->execute([$request->ip, $user->email, time()]);

            return false;
        }

        $this->db->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            ->execute([password_hash($new, PASSWORD_DEFAULT), $user->id]);
        $this->db->prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?')
            ->execute([$user->id, hash('sha256', $request->cookies[self::COOKIE] ?? '')]);

        return true;
    }

    /** Has this email, or this address, missed too often lately? See the limits above. */
    public function isLockedOut(string $ip, string $email): bool
    {
        $since = time() - self::FAILURE_WINDOW;

        $byEmail = $this->db->prepare('SELECT COUNT(*) FROM failed_logins WHERE email = ? AND at > ?');
        $byEmail->execute([strtolower(trim($email)), $since]);
        if ((int) $byEmail->fetchColumn() >= self::MAX_FAILURES_PER_EMAIL) {
            return true;
        }

        $byAddress = $this->db->prepare('SELECT COUNT(*) FROM failed_logins WHERE ip = ? AND at > ?');
        $byAddress->execute([$ip, $since]);

        return (int) $byAddress->fetchColumn() >= self::MAX_FAILURES_PER_ADDRESS;
    }

    /**
     * Check an email and password. On success a session is started and its cookie
     * value returned; on failure you get null and the miss is counted.
     */
    public function signIn(string $email, string $password, string $ip): ?string
    {
        $query = $this->db->prepare('SELECT id, password_hash FROM users WHERE email = ?');
        $query->execute([strtolower(trim($email))]);
        $user = $query->fetch();

        // Verify against a dummy hash when the email is unknown, so "no such
        // account" takes as long as "wrong password" and the timing gives nothing away.
        $hash = $user['password_hash'] ?? '$2y$12$yvX9Q1dbtnwxoHdtgvQNH.dCi7ZTsfD7Uw7z.9MOTKfsjU8f.Zaea';
        if (!password_verify($password, $hash) || $user === false) {
            $this->db->prepare('INSERT INTO failed_logins (ip, email, at) VALUES (?, ?, ?)')
                ->execute([$ip, strtolower(trim($email)), time()]);

            return null;
        }

        // Getting in wipes this account's misses, and anything too old to count anyway.
        // The address's other misses stay: a right password for one account says
        // nothing about the guesses made at the others.
        $this->db->prepare('DELETE FROM failed_logins WHERE email = ? OR at < ?')
            ->execute([strtolower(trim($email)), time() - self::FAILURE_WINDOW]);
        $this->db->prepare('DELETE FROM sessions WHERE expires_at < ?')->execute([time()]);

        $token = bin2hex(random_bytes(32));
        $this->db->prepare('INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)')
            ->execute([hash('sha256', $token), $user['id'], bin2hex(random_bytes(32)), time() + self::SESSION_LIFETIME]);

        return $token;
    }

    /** The person this request's cookie belongs to, or null for an anonymous visitor. */
    public function currentUser(Request $request): ?User
    {
        $token = $request->cookies[self::COOKIE] ?? '';
        if ($token === '') {
            return null;
        }

        $query = $this->db->prepare(<<<'SQL'
            SELECT users.id, users.email, users.role, sessions.csrf_token
            FROM sessions JOIN users ON users.id = sessions.user_id
            WHERE sessions.token_hash = ? AND sessions.expires_at > ?
            SQL);
        $query->execute([hash('sha256', $token), time()]);
        $row = $query->fetch();
        if ($row === false) {
            return null;
        }

        return new User((int) $row['id'], $row['email'], Role::from($row['role']), $row['csrf_token']);
    }

    public function signOut(Request $request): void
    {
        $token = $request->cookies[self::COOKIE] ?? '';
        $this->db->prepare('DELETE FROM sessions WHERE token_hash = ?')->execute([hash('sha256', $token)]);
    }

    /**
     * The Set-Cookie header for a session token. An empty token clears the cookie.
     *
     * HttpOnly keeps page scripts from reading it, SameSite=Lax keeps other sites
     * from sending it along with their form posts, and Secure (on https) keeps it
     * off unencrypted connections.
     */
    public static function cookie(string $token, bool $secure): string
    {
        $maxAge = $token === '' ? 0 : self::SESSION_LIFETIME;

        return self::COOKIE . '=' . $token . '; Path=/; Max-Age=' . $maxAge . '; HttpOnly; SameSite=Lax'
            . ($secure ? '; Secure' : '');
    }
}
