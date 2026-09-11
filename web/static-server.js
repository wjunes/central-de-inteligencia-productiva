// Servidor estatico minimo, sin dependencias (mismo principio que
// backend/api/router.js: node:http puro). Sirve web/public (index.html) y
// web/src (modulos ES nativos, css) y expone GET /env.js para inyectar la
// configuracion de ambiente en el navegador sin hardcodear nada en src/.
//
// Fallback de SPA: cualquier ruta sin extension que no coincide con un
// archivo real se resuelve como index.html (200) - permite deep-linking real
// a /radar, /informes, etc. (prompt seccion 9) sin que el servidor tenga que
// conocer ni duplicar la tabla de rutas del cliente (router.js). Una ruta con
// extension que no existe (p. ej. /src/no-existe.js) es un 404 real - esa
// distincion es la unica logica de "ruteo" que vive aqui.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as defaultConfig } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, 'public');
const SRC_DIR = join(__dirname, 'src');
const STATIC_ROOTS = { public: PUBLIC_DIR, src: SRC_DIR };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function envScript(cfg) {
  const safe = { apiBaseUrl: cfg.apiBaseUrl, nodeEnv: cfg.nodeEnv };
  return `window.__CIP_ENV__ = ${JSON.stringify(safe)};\n`;
}

// Solo permite servir dentro de public/ o src/ (nunca server.js/.env/package.json
// del directorio web/) - '..' en el segmento restante se rechaza explicitamente
// (no basta con normalize(): en POSIX 'a/../../x' normaliza a '../x', que
// igual escaparia de root si solo se comprobara el resultado final).
async function findStaticFile(pathname) {
  const decoded = decodeURIComponent(pathname);
  const parts = decoded.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  const [first, ...rest] = parts;
  const root = STATIC_ROOTS[first];
  if (!root || rest.some((segment) => segment === '..')) return null;
  const full = join(root, ...rest);
  try {
    const info = await stat(full);
    return info.isFile() ? full : null;
  } catch {
    return null;
  }
}

export function createStaticServer(overrides = {}) {
  const cfg = { ...defaultConfig, ...overrides };

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const { pathname } = url;

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('method not allowed');
      }

      if (pathname === '/env.js') {
        res.writeHead(200, { 'Content-Type': MIME['.js'] });
        return res.end(envScript(cfg));
      }

      const staticFile = await findStaticFile(pathname);
      if (staticFile) {
        const body = await readFile(staticFile);
        res.writeHead(200, { 'Content-Type': MIME[extname(staticFile)] ?? 'application/octet-stream' });
        return res.end(body);
      }

      if (extname(pathname) !== '') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('not found');
      }

      // sin extension y sin archivo real -> fallback de SPA (ver nota arriba)
      const indexHtml = await readFile(join(PUBLIC_DIR, 'index.html'));
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      return res.end(indexHtml);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`internal error: ${err.message}`);
    }
  });
}
