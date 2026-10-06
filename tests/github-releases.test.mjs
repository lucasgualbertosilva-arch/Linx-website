// Unit tests for lib/github with a mocked fetch (no network, no token).
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getReleases,
  getLatestRelease,
  getReleaseByTag,
  getGitHubConfig,
  normalizeRelease,
} from '../lib/github/index.js';

const config = getGitHubConfig({ GITHUB_OWNER: 'acme', GITHUB_REPO: 'blackbriar' });

const raw = (over = {}) => ({
  id: 1,
  tag_name: 'v1.0.0',
  name: 'First release',
  body: '## Notes',
  published_at: '2026-10-01T12:00:00Z',
  html_url: 'https://github.com/acme/blackbriar/releases/tag/v1.0.0',
  prerelease: false,
  draft: false,
  assets: [
    { name: 'app.zip', size: 10, content_type: 'application/zip', download_count: 3, browser_download_url: 'https://example.test/app.zip' },
  ],
  ...over,
});

function mockFetch(routes) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const path = new URL(url).pathname + new URL(url).search;
    const hit = routes[path];
    if (!hit) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify(hit), { status: 200 });
  };
  impl.calls = calls;
  return impl;
}

test('normalizeRelease maps every field the page needs', () => {
  const r = normalizeRelease(raw());
  assert.deepEqual(r, {
    id: 1,
    tag: 'v1.0.0',
    title: 'First release',
    body: '## Notes',
    publishedAt: '2026-10-01T12:00:00Z',
    url: 'https://github.com/acme/blackbriar/releases/tag/v1.0.0',
    prerelease: false,
    draft: false,
    assets: [{ name: 'app.zip', size: 10, contentType: 'application/zip', downloadCount: 3, downloadUrl: 'https://example.test/app.zip' }],
  });
  assert.equal(normalizeRelease(raw({ name: '' })).title, 'v1.0.0');
});

test('getReleases excludes drafts by default and can drop prereleases', async () => {
  const fetchImpl = mockFetch({
    '/repos/acme/blackbriar/releases?per_page=20': [
      raw({ id: 1, tag_name: 'v1.1.0-beta', prerelease: true }),
      raw({ id: 2, tag_name: 'v1.1.0', draft: true }),
      raw({ id: 3, tag_name: 'v1.0.0' }),
    ],
  });
  const all = await getReleases({ config, fetchImpl });
  assert.deepEqual(all.map((r) => r.tag), ['v1.1.0-beta', 'v1.0.0']);
  const stable = await getReleases({ config, fetchImpl, includePrereleases: false });
  assert.deepEqual(stable.map((r) => r.tag), ['v1.0.0']);
});

test('getLatestRelease and getReleaseByTag return null on 404', async () => {
  const fetchImpl = mockFetch({});
  assert.equal(await getLatestRelease({ config, fetchImpl }), null);
  assert.equal(await getReleaseByTag('v9.9.9', { config, fetchImpl }), null);
});

test('getReleaseByTag encodes the tag and hides drafts', async () => {
  const fetchImpl = mockFetch({
    '/repos/acme/blackbriar/releases/tags/v2.0.0': raw({ tag_name: 'v2.0.0', draft: true }),
  });
  assert.equal(await getReleaseByTag('v2.0.0', { config, fetchImpl }), null);
});

test('token is sent only as an Authorization header', async () => {
  const withToken = getGitHubConfig({ GITHUB_OWNER: 'acme', GITHUB_REPO: 'blackbriar', GITHUB_TOKEN: 'test-token' });
  const fetchImpl = mockFetch({ '/repos/acme/blackbriar/releases/latest': raw() });
  await getLatestRelease({ config: withToken, fetchImpl });
  const { url, init } = fetchImpl.calls[0];
  assert.equal(init.headers.Authorization, 'Bearer test-token');
  assert.ok(!url.includes('test-token'));
});

test('unconfigured repo fails clearly', async () => {
  const empty = getGitHubConfig({});
  assert.equal(empty.configured, false);
  await assert.rejects(() => getReleases({ config: empty, fetchImpl: mockFetch({}) }), /GITHUB_OWNER and GITHUB_REPO/);
});
