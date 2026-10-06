// Browser-side helper for the future Releases / Changelog section.
// It only talks to this site's own API (/api/releases); it never calls GitHub
// directly and never sees GITHUB_TOKEN.
//
// Not loaded by index.html yet. When the section exists, include it with:
//   <script type="module">
//     import { fetchReleases } from '/assets/js/releases-client.js';
//     const releases = await fetchReleases({ limit: 5 });
//   </script>

/**
 * @typedef {Object} Release  (same shape as lib/github/releases.js)
 * @property {string} tag
 * @property {string} title
 * @property {string} body
 * @property {string|null} publishedAt
 * @property {string} url
 * @property {boolean} prerelease
 * @property {boolean} draft
 * @property {{name:string,size:number,contentType:string,downloadCount:number,downloadUrl:string}[]} assets
 */

async function getJSON(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = body.error;
    throw err;
  }
  return body.data;
}

/** @returns {Promise<Release[]>} */
export function fetchReleases({ limit = 20 } = {}) {
  return getJSON(`/api/releases?limit=${encodeURIComponent(limit)}`);
}

/** @returns {Promise<Release>} */
export function fetchLatestRelease() {
  return getJSON('/api/releases?latest=1');
}

/** @returns {Promise<Release>} */
export function fetchReleaseByTag(tag) {
  return getJSON(`/api/releases?tag=${encodeURIComponent(tag)}`);
}
