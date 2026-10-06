// Local development server with no dependencies.
// Serves public/ like Vercel does and routes /api/<name> to api/<name>.js.
// Usage: npm run dev   (PORT=4000 npm run dev to change the port)

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const apiDir = path.join(root, 'api');
const port = Number(process.env.PORT) || 3000;

// Load .env for local runs (Vercel injects env vars itself in production).
if (existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://localhost:${port}`);
  try {
    if (pathname.startsWith('/api/')) return await runFunction(pathname, req, res);
    return await serveStatic(pathname, res);
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end('Internal error');
  }
});

async function runFunction(pathname, req, res) {
  const name = pathname.slice('/api/'.length).replace(/\/$/, '');
  const file = path.join(apiDir, `${name}.js`);
  if (!/^[a-z0-9-]+$/i.test(name) || !existsSync(file)) {
    res.statusCode = 404;
    return res.end('Not found');
  }
  // Re-import on each request so edits apply without restarting.
  const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
  return mod.default(req, res);
}

async function serveStatic(pathname, res) {
  let file = path.normalize(path.join(publicDir, decodeURIComponent(pathname)));
  if (!file.startsWith(publicDir)) {
    res.statusCode = 403;
    return res.end('Forbidden');
  }
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const data = await readFile(file);
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
}

server.listen(port, () => {
  console.log(`BlackBriar running at http://localhost:${port}`);
});
