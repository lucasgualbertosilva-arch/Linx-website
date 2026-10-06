# BlackBriar — product page

Public presentation page for BlackBriar. A static HTML page plus one Vercel
Serverless Function prepared for a future Releases / Changelog section fed by
GitHub Releases.

```
GitHub repository ──push──▶ Vercel ──▶ public page (https://<project>.vercel.app)

Future:
GitHub Releases ─▶ GitHub REST API ─▶ lib/github (server) ─▶ /api/releases ─▶ page
```

No framework, no runtime dependencies, no database, no separate backend.

## Project structure

```
public/                     Everything served to the browser (Vercel output directory)
  index.html                The page (HTML, CSS and JS inline; logo embedded as data URIs)
  assets/js/
    releases-client.js      Browser helper for the future changelog (not loaded yet)
api/
  releases.js               Serverless function: GET /api/releases
lib/
  github/                   GitHub integration, server-side only
    config.js               Reads GITHUB_OWNER / GITHUB_REPO / GITHUB_TOKEN
    client.js               Minimal GitHub REST client (fetch, timeout, errors)
    releases.js             getReleases(), getLatestRelease(), getReleaseByTag()
    index.js                Public entry point of the integration
scripts/
  dev.mjs                   Local server (static files + /api routes)
  check.mjs                 Production build check (run by `npm run build`)
tests/
  github-releases.test.mjs  Unit tests for lib/github (mocked, no network)
vercel.json                 Pins build command and output directory
.env.example                Environment variable template
```

Only `public/` is served as static files. `lib/`, `scripts/`, `tests/` and the
config files are never exposed to visitors.

## Local development

Requirements: Node.js 22 or newer. There are no dependencies to install.

```bash
npm install        # optional: nothing to download, just validates package.json
npm run dev        # http://localhost:3000
```

Use another port with `PORT=4000 npm run dev` (on Windows PowerShell:
`$env:PORT=4000; npm run dev`).

To try the releases endpoint locally, copy `.env.example` to `.env`, fill in
`GITHUB_OWNER` and `GITHUB_REPO`, restart `npm run dev` and open
`http://localhost:3000/api/releases`.

Alternative: if you use the Vercel CLI, `npx vercel dev` reproduces the
production environment exactly.

## Build

```bash
npm run build      # production check; output directory is public/
npm test           # unit tests for the GitHub integration
```

The page is static, so there is nothing to compile. `npm run build` is a
validation step that fails the deploy if:

- `public/index.html` is missing or not a complete HTML document;
- a local asset referenced by the page does not exist;
- anything that looks like a token, key or private key is in the project;
- code under `public/` references `process.env`, `GITHUB_TOKEN` or `lib/github`;
- a function in `api/` fails to load.

## Deploy (Vercel)

### Connect the GitHub repository (recommended: automatic deploys)

1. Push this folder to a GitHub repository (see "First push" below).
2. Go to <https://vercel.com/new> and sign in with GitHub.
3. Click **Import** next to the repository.
4. Project settings (already defined by `vercel.json`, nothing to change):
   - Framework Preset: **Other**
   - Build Command: `npm run build`
   - Output Directory: `public`
   - Install Command: default
5. The **Project Name** defines the free URL: project `linxai` becomes
   `https://linxai.vercel.app` if that name is available. Otherwise Vercel
   adds a suffix; you can rename it later in Settings > General.
6. Click **Deploy**.

After that, every push to the main branch deploys to production
automatically, and every pull request or other branch gets its own preview
URL. No custom domain is needed.

### First push

```bash
git remote add origin https://github.com/<user>/<repo>.git
git branch -M main
git push -u origin main
```

### Without GitHub (manual)

```bash
npx vercel          # preview deploy
npx vercel --prod   # production deploy
```

## Environment variables

None are required for the page to work today. These are for the future
releases section:

| Variable       | Required | Purpose |
|----------------|----------|---------|
| `GITHUB_OWNER` | yes*     | User or organization that owns the repository |
| `GITHUB_REPO`  | yes*     | Repository whose Releases feed the changelog |
| `GITHUB_TOKEN` | no       | Only for a private repository or a higher API rate limit |

\* Only once the releases section is in use. Without them `/api/releases`
answers `503 not_configured` and the rest of the page is unaffected.

Set them in Vercel under **Project > Settings > Environment Variables**
(Production, and Preview if wanted), then redeploy. Locally, use `.env`
(git-ignored; copy from `.env.example`).

Rules:

- Never commit a real value. `.env` and `.env.*` are git-ignored, and
  `npm run build` fails if a token-like value is found in the project.
- `GITHUB_TOKEN` is read only by `lib/github/config.js`, which runs inside the
  serverless function. It is never sent to the browser.
- If a token is needed, prefer a fine-grained token limited to this one
  repository with read-only access to Contents.
- Without a token GitHub allows 60 requests per hour. The CDN cache below
  keeps real usage far under that.

## GitHub Releases

The integration is already split into layers so the page never talks to
GitHub directly:

| Layer | File | Responsibility |
|---|---|---|
| Service | `lib/github/releases.js` | Calls the GitHub REST API and normalizes releases |
| HTTP endpoint | `api/releases.js` | Exposes the service to the browser, with caching |
| Browser helper | `public/assets/js/releases-client.js` | `fetchReleases()`, `fetchLatestRelease()`, `fetchReleaseByTag()` |
| UI | `public/index.html` | Marked mount point: `RELEASES / CHANGELOG (future)` comment before `</main>` |

Service functions (server-side):

- `getReleases({ limit, includePrereleases, includeDrafts })`: newest first;
  drafts excluded by default.
- `getLatestRelease()`: latest stable release, or `null`.
- `getReleaseByTag(tag)`: one release, or `null` (drafts are never returned).

Each release is normalized to:

```js
{
  id, tag, title, body,        // body is the Markdown written on GitHub
  publishedAt,                 // ISO 8601
  url,                         // release page on GitHub
  prerelease, draft,
  assets: [{ name, size, contentType, downloadCount, downloadUrl }]
}
```

Endpoint:

| Request | Returns |
|---|---|
| `GET /api/releases` | `{ data: Release[] }` |
| `GET /api/releases?limit=5` | at most 5 releases |
| `GET /api/releases?latest=1` | `{ data: Release }` |
| `GET /api/releases?tag=v1.2.0` | `{ data: Release }` or 404 |

Errors return `{ error }` with `503 not_configured`, `404`, or `502`
(`repository_not_found`, `rate_limited`, `upstream_error`).

### Caching

Successful responses are sent with
`Cache-Control: public, max-age=0, s-maxage=600, stale-while-revalidate=86400`.
Vercel's CDN keeps the response for 10 minutes and then refreshes it in the
background while still serving the cached copy, so GitHub is called at most
a few times per hour regardless of traffic. Adjust `CACHE_OK` in
`api/releases.js`. Errors are never cached.

### To build the section later

1. Set `GITHUB_OWNER` / `GITHUB_REPO` in Vercel and redeploy.
2. Design the section and place it at the marked mount point in
   `public/index.html`.
3. Load data with `import { fetchReleases } from '/assets/js/releases-client.js'`.
4. Render `body` as Markdown with a sanitizer, because release notes are
   user-written content.
