# Contributing to totally!

[Deutsch](CONTRIBUTING.de.md) · [README](README.md)

Bug reports, ideas and pull requests are welcome in English or German. Include
steps to reproduce, expected/actual behavior, browser and installation method.
Use fictional data only. Keep private configuration, exports and credentials out
of issues and commits. Report vulnerabilities using the [security policy](SECURITY.md).

## Local development

Requires **Node.js 24+** and npm. On Windows/PowerShell, use `npm.cmd` if needed.

```sh
npm ci
npm run setup
npm run dev
```

Setup asks for the application URL, writes private configuration and prints the
password once. It refuses to overwrite an existing configuration. Open
http://localhost:3000. Without Docker, data defaults to `data/`; use a separate
development dataset.

For a production run:

```sh
npm run build
npm start
```

The entry point is [server.mjs](server.mjs), which applies the configured `ORIGIN`.

## Checks

For application changes:

```sh
npm run check
npm test
npm run build
npm exec -- playwright install chromium
npm run test:e2e
```

Browser tests use the production build, desktop/mobile viewports and an isolated
server at `127.0.0.1:4173` with disposable data under `.test-data/`. Push transport
and permissions are simulated; the SMTP failure test uses a closed local port.
Tests send no real emails or push notifications. Check push display separately
with a test notification on a physical device. Screenshots and traces go to
`test-results/`.

For container or persistence changes, also run:

```sh
docker build -t totally:mvp .
npm run test:container
```

The container smoke test creates and removes its own container and volume. It
checks authentication, origin protection, write permissions and restart persistence.

`npm run format` formats source, configuration and documentation. Documentation-only
changes need formatting and link/command checks. To regenerate the README screenshot
with fictional English demo data, build first, install Chromium, then run
`npm run docs:screenshot`. It uses the isolated browser-test server, never your `.env`
or production data; port 4173 must be free.

## Code map

| Path                                       | Purpose                                               |
| ------------------------------------------ | ----------------------------------------------------- |
| [src/routes/](src/routes/)                 | Pages, server loads and form actions                  |
| [src/lib/components/](src/lib/components/) | Shared UI components                                  |
| [src/lib/styles.css](src/lib/styles.css)   | Layout, colors and themes                             |
| [src/lib/model.ts](src/lib/model.ts)       | Data model and empty database                         |
| [src/lib/server/](src/lib/server/)         | Storage, validation, authentication and notifications |
| [src/service-worker/](src/service-worker/) | Web Push service worker                               |
| [tests/](tests/)                           | Unit, integration and browser tests                   |
| [scripts/](scripts/)                       | Setup and isolated test environments                  |

The app uses SvelteKit, Svelte, TypeScript and Node.js. Forms save through server
actions; JSON holds CRM data and photos are separate files. See
[backups and compatibility](docs/backups.md) before changing the model.

Storage writes are serialized: write a temporary file, sync and atomically rename.
Only one process may use a data directory. A directory-sync failure after rename
locks the store until restart, protecting committed changes. Never silently replace
corrupt data with an empty database.

CRM and private push data use separate stores. Login secrets and SMTP credentials
belong in the environment. The service worker must not cache private pages or API
responses offline. Preserve old-export compatibility where possible. Restart the
development server after model changes; the runtime instance survives module reloads.

## Translations

Catalogs live in [src/lib/i18n/](src/lib/i18n/). German source strings are shared,
type-checked keys; the English catalog must contain the same keys. Named placeholders
such as `{p0}` are type-checked too. Changing a source string requires updating both
catalogs and call sites.

Svelte components use `useTranslations()` from the layout context. Server text uses
the request's translation function; background services open a context with the saved
language. Do not introduce mutable global language state. Pass language explicitly
to shared formatting helpers. Dates and month/weekday names currently retain German
formatting; language and time zone are independent.

Language is stored atomically in a separate preferences file, outside the CRM model
and export. Existing browser tests explicitly use German; language tests cover
English, multiple browsers and forms without JavaScript.

Keep English documentation and its `.de.md` counterpart in sync, with reciprocal
language links. README files stay short; put operational detail in `docs/`.

## Pull requests and releases

Describe the problem, resulting behavior and checks run. Include fictional-data
screenshots for visible changes. Keep each PR focused.

[CI](.github/workflows/ci.yml) runs type checks, tests, production build and Playwright
on pushes to `main`, PRs, manual runs and published releases. Browser reports are retained for
seven days. CI needs no private configuration.

**Docker images are built and published only for a published GitHub Release after
verification succeeds.** Branch pushes, tag pushes, PRs, drafts and manual runs do
not build or publish images. Release verification and image building both check out
the release tag. Use tags such as `v1.2.3` or `v1.2.3-rc.1` (a Docker-compatible
version with three numeric components, optional `v`, optional suffix, max. 128
characters). Tags with a suffix must be marked as a prerelease.

Each release publishes its exact tag to `ghcr.io/owner/repository:TAG`. A stable
release also updates `latest`; prereleases never do. Publishing an older stable
release also moves `latest`, so use version tags for pinned deployments. Images
currently target Linux amd64. Never move a published release tag. There is no
automatic server deployment. For bot-created releases, GitHub events made with
`GITHUB_TOKEN` do not trigger another workflow; use an appropriately scoped GitHub
App token or PAT if automating release publication.

Before the first public release, enable GitHub private vulnerability reporting and
make the GHCR package public if anonymous image pulls are intended. See
[deployment](docs/deployment.md#prebuilt-release-images).
