// Minimal client for the official GitHub REST API (https://docs.github.com/rest).
// Uses the global fetch available in Node 18+; no dependencies.

const API_BASE = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const TIMEOUT_MS = 8000;

export class GitHubError extends Error {
  /**
   * @param {string} message
   * @param {number} status  HTTP status returned by GitHub (0 for network errors)
   */
  constructor(message, status) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
  }
}

/**
 * GET a GitHub REST endpoint and return parsed JSON.
 * @param {string} path   e.g. "/repos/owner/repo/releases"
 * @param {{ token?: string, fetchImpl?: typeof fetch }} [options]
 */
export async function githubGet(path, { token, fetchImpl = fetch } = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': API_VERSION,
    'User-Agent': 'blackbriar-site',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetchImpl(`${API_BASE}${path}`, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new GitHubError(`GitHub request failed: ${err.message}`, 0);
  }

  if (!res.ok) {
    // Never echo the token or request headers into errors.
    throw new GitHubError(`GitHub responded ${res.status} for ${path}`, res.status);
  }
  return res.json();
}
