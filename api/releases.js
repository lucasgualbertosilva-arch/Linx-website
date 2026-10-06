// Vercel Serverless Function: GET /api/releases
//
//   /api/releases              -> list of releases (newest first, drafts excluded)
//   /api/releases?latest=1     -> latest stable release
//   /api/releases?tag=v1.2.0   -> one release by tag
//   /api/releases?limit=5      -> limit the list (1-100, default 20)
//
// Runs on the server, so GITHUB_TOKEN never reaches the browser.
// Successful responses are cached on Vercel's CDN (s-maxage) and refreshed in
// the background (stale-while-revalidate), so GitHub is not called on every visit.

import {
  getReleases,
  getLatestRelease,
  getReleaseByTag,
  isGitHubConfigured,
  GitHubError,
} from '../lib/github/index.js';

const CACHE_OK = 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400';
const CACHE_NONE = 'no-store';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return send(res, 405, { error: 'method_not_allowed' }, CACHE_NONE);
  }

  if (!isGitHubConfigured()) {
    return send(
      res,
      503,
      { error: 'not_configured', hint: 'Set GITHUB_OWNER and GITHUB_REPO in the Vercel environment variables.' },
      CACHE_NONE,
    );
  }

  const params = new URL(req.url, 'http://localhost').searchParams;
  const tag = params.get('tag');
  const latest = params.get('latest');
  const limit = Number.parseInt(params.get('limit') ?? '20', 10) || 20;

  try {
    if (tag) {
      const release = await getReleaseByTag(tag);
      if (!release) return send(res, 404, { error: 'release_not_found', tag }, CACHE_NONE);
      return send(res, 200, { data: release }, CACHE_OK);
    }
    if (latest === '1' || latest === 'true') {
      const release = await getLatestRelease();
      if (!release) return send(res, 404, { error: 'no_published_release' }, CACHE_NONE);
      return send(res, 200, { data: release }, CACHE_OK);
    }
    const releases = await getReleases({ limit });
    return send(res, 200, { data: releases }, CACHE_OK);
  } catch (err) {
    const status = err instanceof GitHubError ? err.status : 0;
    console.error('[api/releases]', err.message);
    // 404 from GitHub here means the repo itself was not found (or is private without a token).
    const code = status === 404 ? 'repository_not_found' : status === 403 || status === 429 ? 'rate_limited' : 'upstream_error';
    return send(res, 502, { error: code }, CACHE_NONE);
  }
}

function send(res, status, body, cacheControl) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cacheControl);
  res.end(JSON.stringify(body));
}
