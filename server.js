#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './src/db.js';
import { matchRoute } from './src/api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

const MAX_BODY = 25 * 1024 * 1024; // generous: JSON restores can be large

function readBody(req) {
  return new Promise((res, rej) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        rej(Object.assign(new Error('Payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => res(Buffer.concat(chunks).toString('utf8')));
    req.on('error', rej);
  });
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  // Client-side routes use the hash, so any other path falls back to the shell.
  const filePath = join(PUBLIC_DIR, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not a file');
    const data = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch {
    const shell = await readFile(join(PUBLIC_DIR, 'index.html')).catch(() => null);
    if (shell) {
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      res.end(shell);
    } else {
      res.writeHead(404).end('Not found');
    }
  }
}

export function createApp() {
  return createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const { pathname } = url;

    if (!pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405).end('Method not allowed');
        return;
      }
      await serveStatic(req, res, pathname);
      return;
    }

    const match = matchRoute(req.method, pathname);
    if (!match) {
      sendJson(res, 404, { error: `No route for ${req.method} ${pathname}` });
      return;
    }

    try {
      let body = {};
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        const raw = await readBody(req);
        if (raw) {
          try {
            body = JSON.parse(raw);
          } catch {
            sendJson(res, 400, { error: 'Invalid JSON body' });
            return;
          }
        }
      }
      const query = Object.fromEntries(url.searchParams.entries());
      const result = await match.handler({ params: match.params, query, body, req });

      // Handlers can opt into a raw (non-JSON) response, e.g. Markdown reports.
      if (result && typeof result === 'object' && typeof result.raw === 'string' && result.contentType) {
        res.writeHead(200, {
          'Content-Type': result.contentType,
          'Content-Length': Buffer.byteLength(result.raw),
        });
        res.end(result.raw);
        return;
      }
      sendJson(res, req.method === 'POST' ? 201 : 200, result);
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error(`[error] ${req.method} ${pathname}:`, err);
      sendJson(res, status, { error: err.message || 'Server error' });
    }
  });
}

/**
 * Open the database and start listening. Returns the http.Server.
 *
 * This is exported rather than run on import because a process manager (pm2)
 * loads this module through a wrapper, so the usual "is this the main module?"
 * check is false there and the server would silently never listen.
 * bin/start.js is the entry point everything actually launches.
 */
export function startServer({ port, host } = {}) {
  openDb();
  const p = Number(port ?? process.env.PORT ?? 4321);
  const h = host ?? process.env.HOST ?? '127.0.0.1';
  const server = createApp();

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  Port ${p} is already in use — something else is on it.`);
      console.error('  Stop that, or start on another port: PORT=6971 npm start\n');
    } else {
      console.error('\n  Server failed to start:', err.message, '\n');
    }
    process.exit(1);
  });

  server.listen(p, h, () => {
    console.log(`\n  TA Project Tracker running at http://${h}:${p}\n`);
    console.log(`  Data file: ${process.env.TRACKER_DB || join(__dirname, 'data', 'tracker.db')}`);
    console.log('  Press Ctrl+C to stop.\n');
  });

  // Let pm2 restarts and Ctrl+C close the listener cleanly.
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      console.log(`\n  ${sig} received — shutting down.`);
      server.close(() => process.exit(0));
      // Don't hang forever on a stuck keep-alive connection.
      setTimeout(() => process.exit(0), 3000).unref();
    });
  }

  return server;
}

// Convenience: `node server.js` still works, even though bin/start.js is the
// entry point npm and pm2 use.
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) startServer();
