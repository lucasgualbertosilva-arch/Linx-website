// Public entry point of the GitHub integration (server-side only).
export { getGitHubConfig, isGitHubConfigured } from './config.js';
export { GitHubError } from './client.js';
export { getReleases, getLatestRelease, getReleaseByTag, normalizeRelease } from './releases.js';
