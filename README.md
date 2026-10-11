# LagomCMS

A small, opinionated CMS for personal sites, with an Astro site that works out of the box.

Your writing lives in Markdown files on disk. A SQLite index (disposable, rebuilt in under a
second) makes it queryable. The admin is where you write: Markdown that formats as you type,
blocks from a `/` menu, and a screen for every page of the site. There is no database server
and nothing to configure before you can start.

"Lagom" is Swedish for *the right amount*.

## What you get

- **The CMS** (this repository, PHP): the admin, the editor and a JSON API.
- **`@lagomcms/astro`** (`packages/astro`): an Astro integration that adds the whole site to a
  stock Astro project. Home, blog, CV, portfolio, about, contact and a fediverse page, plus
  feeds and a sitemap. Nothing is copied into your project, so updating the package updates
  the site.

## Install

You need PHP 8.4 or newer with the SQLite extension, Composer, and Node 22 or newer.

**1. The CMS**

```
composer install
(cd admin && npm install && npm run build)
php -S 127.0.0.1:4702 -t public public/index.php
```

Open <http://127.0.0.1:4702/admin>. The first visit asks for an email and a password, creates
your account and puts a small starter site in place.

**2. The site**

The website is a stock Astro project in `site/` with one integration added. `examples/stock`
is exactly that, so the quickest start is to copy it:

```
cp -r examples/stock site
npm install -g pnpm    # if you do not have it
pnpm install
```

Its whole configuration is this:

```js
// site/astro.config.mjs
import { defineConfig } from 'astro/config';
import lagom from '@lagomcms/astro';

export default defineConfig({
    site: 'https://example.com',
    integrations: [lagom({ url: process.env.LAGOM_URL ?? 'http://127.0.0.1:4702' })],
});
```

`site/` and `content/` are yours and are ignored by this repository's git. Keep them in a
repository of your own. The project can also live somewhere else entirely: point `LAGOM_SITE`
at it.

**3. Publish**

There is no third thing to run. The website is plain files: the CMS builds the Astro project
whenever you publish something (a couple of seconds, in the background) and serves the result
from its own address, so <http://127.0.0.1:4702/> is the site and `/admin` is the admin. The
line at the bottom of the admin's sidebar says whether the site is up to date. A build that
fails changes nothing: the last version that worked stays up.

Node is only used for those few seconds. Nothing of Astro runs when a visitor arrives.

On a real server, let nginx or Caddy serve `var/site/current/` directly and pass only `/admin`,
`/api` and `/media` to PHP.

To replace one of the built-in pages, create a file at the same address in your own
`src/pages/`. Yours wins.

## The chat assistant

Optional, and off until you turn it on. **AI Chat** in the admin puts an "ask" button in the
corner of every page, opening a small chat window. There you set its name, greeting, picture
and the one thing it cannot work without: an endpoint.

The CMS does not talk to a language model itself. The visitor's browser posts each question
to your endpoint, which is a small service of your own, so the model, the bill and any keys
stay with you and never pass through the site. The whole contract:

```
POST   {"message": "...", "previous": {"question": "...", "answer": "..."}}
200    {"reply": "..."}
4xx    {"error": "...", "detail": "..."}     429 shows your "run out" message
```

`previous` is left out on the first question. The endpoint has to allow your site's origin
(CORS).

`examples/chat-worker/` is a Cloudflare Worker that does this with Workers AI, which has a
free daily allowance:

```sh
cd examples/chat-worker
# edit about.js (what the assistant knows) and ALLOWED_ORIGIN in wrangler.toml
npx wrangler deploy
```

Paste the address it prints into AI Chat > Endpoint, tick "Show on the site" and save.

## Where things live

| Path | What it is |
|---|---|
| `content/` | Your site: one folder per document, Markdown with front matter. Back this up. |
| `var/` | Accounts, the index, the trash, the fediverse archive. Back up `accounts.sqlite`. |
| `var/site/current/` | The published website. Rebuilt on every publish; never edit it. |
| `collections/` | The content model: one PHP array per kind of document. |
| `src/`, `templates/`, `public/` | The CMS itself. |
| `admin/` | The editor's JavaScript, bundled into `public/admin/build/`. |
| `packages/astro/` | The Astro integration. |
| `starter/content/` | What a new installation starts with. |
| `examples/` | A stock Astro project to copy, and a Worker for the chat assistant. |

Settings come from environment variables; `config.php` lists them all. The ones that matter:
`LAGOM_SITE` (where the Astro project is), `LAGOM_INTERNAL_URL` (where the build can reach the
CMS, when that is not the address you open the admin at) and `LAGOM_BUILD` (the build command,
if `npx` is not on the web server's PATH).

Set `LAGOM_DATA` to keep `content/` and `var/` somewhere other than next to the code, for
example in a repository of their own.

## Commands

```
bin/dev                          start the CMS locally and publish the site once
bin/lagom build [url]            publish the site now
bin/lagom user <email> [role]    create an account or reset its password
bin/lagom reindex                rebuild the index from the files
bin/lagom social-sync            fetch new fediverse posts (run from cron)
php tests/fixtures.php           check the Markdown parser against recorded output *
php tests/api.php                check the API against recorded responses *
node tests/footnotes.mjs         check the editor's footnote ordering
```

\* These two compare against responses recorded from a real site, which are not in this
repository. Set `LAGOM_SNAPSHOT` to a folder holding `api/` and `content/` to run them against
your own.

## Status

Young. It runs my own site, [dotmavriq.life](https://dotmavriq.life), and nothing else that I
know of. The address of things may still move between versions.

## Licence

AGPL-3.0-or-later. If you run a modified version as a network service, your modifications are
covered too.
