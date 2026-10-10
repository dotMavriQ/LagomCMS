<?php
/**
 * The sign-in page. Stands alone, without the sidebar layout.
 *
 * @var string|null $error
 * @var string      $email
 */
$title = 'Sign in';
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

        <?php if ($error !== null): ?>
            <p class="notice notice--error" role="alert"><?= e($error) ?></p>
        <?php endif; ?>

        <form method="post" action="/admin/login" class="stack">
            <label class="field">
                <span>Email</span>
                <input type="email" name="email" value="<?= e($email) ?>" autocomplete="username" required autofocus>
            </label>
            <label class="field">
                <span>Password</span>
                <input type="password" name="password" autocomplete="current-password" required>
            </label>
            <button class="button button--primary" type="submit">Sign in</button>
        </form>
    </main>
</body>
</html>
