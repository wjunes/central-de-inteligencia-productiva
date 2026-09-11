// static-server.js: estructura del AppShell servida realmente por HTTP,
// deep-linking (fallback de SPA), y que nunca sirva archivos fuera de
// public/ o src/ (prompt seccion 31 - Estructura/Navegación).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createStaticServer } from '../static-server.js';

describe('static-server - AppShell servido por HTTP', () => {
  let server;
  let baseUrl;

  before(async () => {
    server = createStaticServer({ apiBaseUrl: 'http://backend.test:9999', nodeEnv: 'test' });
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test('GET / responde 200 con el AppShell (header, nav de 5 items, main, footer)', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/html/);
    const html = await res.text();
    assert.match(html, /<header class="app-header"/);
    assert.match(html, /<nav class="app-nav" aria-label="Navegación principal">/);
    assert.match(html, /<main id="main-content"[^>]*tabindex="-1"/);
    assert.match(html, /<footer class="app-footer/);
    assert.match(html, /<a class="skip-link" href="#main-content">/);
    for (const name of ['inicio', 'radar', 'informes', 'perfil', 'configuracion']) {
      assert.match(html, new RegExp(`data-nav-link="${name}"`), `falta el link de navegación a '${name}'`);
    }
  });

  test('deep-link a una ruta del cliente (sin extensión) devuelve el mismo AppShell (200)', async () => {
    const res = await fetch(`${baseUrl}/radar`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /id="main-content"/);
  });

  test('sirve modulos JS reales bajo /src con el tipo de contenido correcto', async () => {
    const res = await fetch(`${baseUrl}/src/router.js`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/javascript/);
    const body = await res.text();
    assert.match(body, /export function matchRoute/);
  });

  test('sirve CSS real bajo /src/styles', async () => {
    const res = await fetch(`${baseUrl}/src/styles/tokens.css`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/css/);
  });

  test('GET /env.js inyecta la configuración de ambiente (sin hardcodear localhost)', async () => {
    const res = await fetch(`${baseUrl}/env.js`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /window\.__CIP_ENV__/);
    assert.match(body, /http:\/\/backend\.test:9999/);
    assert.match(body, /"nodeEnv":"test"/);
  });

  test('archivo con extensión inexistente -> 404 real (no fallback de SPA)', async () => {
    const res = await fetch(`${baseUrl}/src/no-existe.js`);
    assert.equal(res.status, 404);
  });

  test('no sirve archivos fuera de public/ o src/ (intento de path traversal)', async () => {
    const res = await fetch(`${baseUrl}/src/../server.js`);
    assert.equal(res.status, 404);
    const res2 = await fetch(`${baseUrl}/src/..%2f..%2fpackage.json`);
    assert.ok([400, 404].includes(res2.status));
  });

  test('metodo no permitido (POST) es rechazado', async () => {
    const res = await fetch(`${baseUrl}/`, { method: 'POST' });
    assert.equal(res.status, 405);
  });
});
