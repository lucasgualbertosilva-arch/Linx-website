// Server-side only. Reads GitHub settings from environment variables.
// Never import this module from anything under public/: GITHUB_TOKEN must
// stay on the server (Vercel serverless functions).

/**
 * @typedef {Object} GitHubConfig
 * @property {string|undefined} owner  GITHUB_OWNER, e.g. "my-org"
 * @property {string|undefined} repo   GITHUB_REPO, e.g. "blackbriar"
 * @property {string|undefined} token  GITHUB_TOKEN (optional for public repos)
 * @property {boolean} configured      true when owner and repo are set
 */

/**
 * @param {Record<string, string|undefined>} [env]
 * @returns {GitHubConfig}
 */
export function getGitHubConfig(env = process.env) {
  const owner = clean(env.GITHUB_OWNER);
  const repo = clean(env.GITHUB_REPO);
  const token = clean(env.GITHUB_TOKEN);
  return { owner, repo, token, configured: Boolean(owner && repo) };
}

export function isGitHubConfigured(env = process.env) {
  return getGitHubConfig(env).configured;
}

function clean(value) {
  const v = typeof value === 'string' ? value.trim() : '';
  return v === '' ? undefined : v;
}
