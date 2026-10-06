// Production build check (run by `npm run build` locally and on Vercel).
// The site is static, so there is nothing to compile. This step makes the
// deploy fail early if something would break in production:
//   1. public/index.html exists and is a complete HTML document
//   2. every local asset referenced from public/ exists
//   3. no secret-looking value is committed anywhere in the project
//   4. no server-only code or env var leaks into public/
//   5. every API function loads and exports a handler

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const errors = [];
const ok = (msg) => console.log(`  ok  ${msg}`);

async function walk(dir, skip = new Set(['node_modules', '.git', '.vercel'])) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, skip)));
    else out.push(full);
  }
  return out;
}
const rel = (f) => path.relative(root, f);

// 1. Entry page
const indexPath = path.join(publicDir, 'index.html');
if (!existsSync(indexPath)) {
  errors.push('public/index.html is missing');
} else {
  const html = await readFile(indexPath, 'utf8');
  if (!/^<!doctype html>/i.test(html.trimStart())) errors.push('public/index.html must start with <!doctype html>');
  if (!/<title>[^<]+<\/title>/i.test(html)) errors.push('public/index.html has no <title>');
  if (!/<meta[^>]+name="viewport"/i.test(html)) errors.push('public/index.html has no viewport meta');
  ok('public/index.html is a complete document');
}

// 2. Local asset references
const publicFiles = await walk(publicDir);
for (const file of publicFiles.filter((f) => /\.(html|css)$/.test(f))) {
  const text = await readFile(file, 'utf8');
  const refs = [...text.matchAll(/(?:src|href)\s*=\s*"([^"]+)"|url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1] || m[2]);
  for (const ref of refs) {
    if (/^(https?:|data:|mailto:|tel:|#|\/\/|\$\{)/i.test(ref) || ref.startsWith('/api/')) continue;
    const clean = ref.split(/[?#]/)[0];
    if (!clean) continue;
    const target = clean.startsWith('/') ? path.join(publicDir, clean) : path.join(path.dirname(file), clean);
    if (!existsSync(target)) errors.push(`${rel(file)} references missing asset "${ref}"`);
  }
}
ok(`asset references checked in ${publicFiles.length} public file(s)`);

// 3. Secret scan
const SECRET_PATTERNS = [
  [/ghp_[A-Za-z0-9]{30,}/, 'GitHub personal access token'],
  [/github_pat_[A-Za-z0-9_]{30,}/, 'GitHub fine-grained token'],
  [/gh[ousr]_[A-Za-z0-9]{30,}/, 'GitHub OAuth/app token'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/^[ \t]*GITHUB_TOKEN[ \t]*=[ \t]*\S+/m, 'GITHUB_TOKEN with a value'],
];
const allFiles = await walk(root);
for (const file of allFiles) {
  const base = path.basename(file);
  if (base === '.env' || (base.startsWith('.env.') && base !== '.env.example')) continue; // gitignored, never deployed from git
  if (!/\.(js|mjs|cjs|json|html|css|md|txt|example|ya?ml|toml)$|^\.[a-z]+$/i.test(base)) continue;
  if (file === fileURLToPath(import.meta.url)) continue;
  const text = await readFile(file, 'utf8');
  for (const [re, label] of SECRET_PATTERNS) {
    if (re.test(text)) errors.push(`${rel(file)} appears to contain a ${label}`);
  }
}
ok(`secret scan passed on ${allFiles.length} file(s)`);

// 4. Nothing server-only in the browser bundle
for (const file of publicFiles.filter((f) => /\.(html|js|mjs)$/.test(f))) {
  const text = await readFile(file, 'utf8');
  const code = text
    .replace(/<!--[\s\S]*?-->/g, '') // HTML comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/(^|\s)\/\/.*$/gm, '$1'); // line comments (not the // inside URLs)
  if (/process\.env|GITHUB_TOKEN|lib\/github/.test(code)) {
    errors.push(`${rel(file)} references server-only code or environment variables`);
  }
}
ok('public/ has no server-only references');

// 5. API functions load
const apiDir = path.join(root, 'api');
const apiFiles = existsSync(apiDir) ? (await readdir(apiDir)).filter((f) => f.endsWith('.js')) : [];
for (const f of apiFiles) {
  try {
    const mod = await import(pathToFileURL(path.join(apiDir, f)).href);
    if (typeof mod.default !== 'function') errors.push(`api/${f} has no default export handler`);
  } catch (err) {
    errors.push(`api/${f} failed to load: ${err.message}`);
  }
}
ok(`${apiFiles.length} API function(s) load`);

if (errors.length) {
  console.error(`\nBuild check failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  process.exit(1);
}
console.log('\nBuild check passed. Output directory: public/');
