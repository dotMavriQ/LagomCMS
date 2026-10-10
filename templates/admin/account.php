<?php
/**
 * Your account. For now that means one thing: a new password.
 *
 * The current password is asked for even though you are signed in. Being signed in
 * proves somebody once knew the password on this computer; it does not prove that
 * the person at the keyboard right now is them.
 *
 * @var Lagom\Auth\User $user
 * @var string|null     $error
 * @var bool            $saved  true right after a change went through
 */
?>
<header class="bar">
    <button class="ghost" type="button" data-toggle-sidebar title="Show or hide the sidebar"><?= icon('sidebar') ?></button>
    <nav class="crumbs">
        <span>Account</span>
    </nav>
</header>

<form class="note stack" method="post" action="/admin/account">
    <input type="hidden" name="csrf" value="<?= e($user->csrfToken) ?>">

    <h1 class="note__title"><?= e($user->email) ?></h1>

    <?php if ($error !== null): ?>
        <p class="notice notice--error" role="alert"><?= e($error) ?></p>
    <?php elseif ($saved): ?>
        <p class="notice" role="status">Password changed. Anywhere else you were signed in has been signed out.</p>
    <?php endif; ?>

    <?php // Hidden from view, there for password managers: it tells them whose password this is. ?>
    <input type="email" name="email" value="<?= e($user->email) ?>" autocomplete="username" hidden readonly>

    <label class="field">
        <span>Current password</span>
        <input type="password" name="current" autocomplete="current-password" required>
    </label>
    <label class="field">
        <span>New password</span>
        <input type="password" name="password" autocomplete="new-password" minlength="10" required>
        <small>At least 10 characters. Long beats clever.</small>
    </label>
    <label class="field">
        <span>New password, once more</span>
        <input type="password" name="repeat" autocomplete="new-password" minlength="10" required>
    </label>

    <p><button class="button button--primary" type="submit">Change password</button></p>
</form>
