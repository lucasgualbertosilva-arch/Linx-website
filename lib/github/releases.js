// GitHub Releases service. This is the single place that knows how releases
// are fetched and shaped. The page only sees the normalized `Release` objects.

import { getGitHubConfig } from './config.js';
import { githubGet, GitHubError } from './client.js';

/**
 * @typedef {Object} ReleaseAsset
 * @property {string} name
 * @property {number} size            bytes
 * @property {string} contentType
 * @property {number} downloadCount
 * @property {string} downloadUrl
 */

/**
 * @typedef {Object} Release
 * @property {number} id
 * @property {string} tag             version tag, e.g. "v1.2.0"
 * @property {string} title           release name (falls back to the tag)
 * @property {string} body            release notes, Markdown as written on GitHub
 * @property {string|null} publishedAt ISO 8601, null for drafts
 * @property {string} url             link to the release page on GitHub
 * @property {boolean} prerelease
 * @property {boolean} draft
 * @property {ReleaseAsset[]} assets
 */

/** Convert a raw GitHub release payload into a stable `Release` shape. */
export function normalizeRelease(raw) {
  return {
    id: raw.id,
    tag: raw.tag_name,
    title: raw.name && raw.name.trim() ? raw.name : raw.tag_name,
    body: raw.body ?? '',
    publishedAt: raw.published_at ?? null,
    url: raw.html_url,
    prerelease: Boolean(raw.prerelease),
    draft: Boolean(raw.draft),
    assets: (raw.assets ?? []).map((a) => ({
      name: a.name,
      size: a.size,
      contentType: a.content_type,
      downloadCount: a.download_count,
      downloadUrl: a.browser_download_url,
    })),
  };
}

function repoPath(config) {
  if (!config.configured) {
    throw new GitHubError('GITHUB_OWNER and GITHUB_REPO are not set', 0);
  }
  return `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
}

/**
 * List releases, newest first.
 * Drafts are only returned by GitHub to tokens with push access; they are
 * excluded by default so a draft never leaks onto the public page.
 * @param {{ limit?: number, includePrereleases?: boolean, includeDrafts?: boolean,
 *           config?: ReturnType<typeof getGitHubConfig>, fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<Release[]>}
 */
export async function getReleases({
  limit = 20,
  includePrereleases = true,
  includeDrafts = false,
  config = getGitHubConfig(),
  fetchImpl,
} = {}) {
  const perPage = Math.min(Math.max(1, limit), 100);
  const raw = await githubGet(`${repoPath(config)}/releases?per_page=${perPage}`, {
    token: config.token,
    fetchImpl,
  });
  return raw
    .map(normalizeRelease)
    .filter((r) => (includeDrafts || !r.draft) && (includePrereleases || !r.prerelease));
}

/**
 * Latest published, non-prerelease release. Returns null when none exists.
 * @returns {Promise<Release|null>}
 */
export async function getLatestRelease({ config = getGitHubConfig(), fetchImpl } = {}) {
  try {
    const raw = await githubGet(`${repoPath(config)}/releases/latest`, { token: config.token, fetchImpl });
    return normalizeRelease(raw);
  } catch (err) {
    if (err instanceof GitHubError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Release for one tag, e.g. "v1.2.0". Returns null when the tag has no release.
 * @param {string} tag
 * @returns {Promise<Release|null>}
 */
export async function getReleaseByTag(tag, { config = getGitHubConfig(), fetchImpl } = {}) {
  if (!tag) throw new TypeError('tag is required');
  try {
    const raw = await githubGet(`${repoPath(config)}/releases/tags/${encodeURIComponent(tag)}`, {
      token: config.token,
      fetchImpl,
    });
    const release = normalizeRelease(raw);
    return release.draft ? null : release;
  } catch (err) {
    if (err instanceof GitHubError && err.status === 404) return null;
    throw err;
  }
}
