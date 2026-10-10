<?php
/**
 * The first-run screen: one form, and the site is yours. Shown only while the
 * installation has no accounts at all.
 *
 * @var string|null $error
 * @var string      $email
 */
$title = 'Set up';
?>
<!doctype html>
<html lang="en">
<head>
    <?php require __DIR__ . '/_head.php'; ?>
</head>
<body class="door">
    <main class="door__card">
        <h1 class="door__title">
            <span class="brand__mark" aria-hidden="true"></span>
            <span class="sr-only">LagomCMS</span>
        </h1>

        <p class="notice">
            Welcome. Create your account and you are in. A small starter site is put in
            place for you to edit, so there is something to look at straight away.
        </p>

        <?php if ($error !== null): ?>
            <p class="notice notice--error" role="alert"><?= e($error) ?></p>
        <?php endif; ?>

        <form method="post" action="/admin/setup" class="stack">
            <label class="field">
                <span>Your email</span>
                <input type="email" name="email" value="<?= e($email) ?>" autocomplete="username" required autofocus>
            </label>
            <label class="field">
                <span>A password</span>
                <input type="password" name="password" autocomplete="new-password" minlength="10" required>
                <small>At least 10 characters.</small>
            </label>
            <button class="button button--primary" type="submit">Create my account</button>
        </form>
    </main>
</body>
</html>
