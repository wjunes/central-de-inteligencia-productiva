// Capa api.js: debe manejar 2xx/4xx/5xx/error de red (prompt seccion 31). Se
// usa un servidor HTTP local controlado (no la red real, no el backend real)
// para los casos 2xx/4xx/5xx, y un fetchImpl inyectado que rechaza para el
// caso de error de red (deterministico, sin depender de timeouts).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { apiGet, apiPost, apiPut, ApiError } from '../src/services/api.js';

describe('api.js - manejo de respuestas HTTP', () => {
  let server;
  let baseUrl;

  before(async () => {
    server = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/ok') return res.end(JSON.stringify({ status: 'ok' }));
      if (req.url === '/bad') { res.statusCode = 400; return res.end(JSON.stringify({ error: 'validation_error', message: 'dato inválido' })); }
      if (req.url === '/boom') { res.statusCode = 500; return res.end(JSON.stringify({ error: 'internal_error', message: 'fallo interno' })); }
      if (req.url === '/sin-cuerpo') { res.statusCode = 204; return res.end(); }
      if (req.url === '/echo' && req.method === 'POST') {
        let raw = '';
        req.on('data', (chunk) => { raw += chunk; });
        req.on('end', () => {
          res.statusCode = 201;
          res.end(JSON.stringify({ received: JSON.parse(raw), contentType: req.headers['content-type'] }));
        });
        return;
      }
      if (req.url === '/replace' && req.method === 'PUT') {
        let raw = '';
        req.on('data', (chunk) => { raw += chunk; });
        req.on('end', () => {
          res.statusCode = 200;
          res.end(JSON.stringify({ replaced: JSON.parse(raw) }));
        });
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not_found' }));
    });
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test('2xx: devuelve el cuerpo JSON parseado', async () => {
    const body = await apiGet('/ok', { baseUrl });
    assert.deepEqual(body, { status: 'ok' });
  });

  test('4xx: lanza ApiError con status y el message del backend', async () => {
    await assert.rejects(
      () => apiGet('/bad', { baseUrl }),
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 400);
        assert.equal(err.message, 'dato inválido');
        return true;
      }
    );
  });

  test('5xx: lanza ApiError con status 500', async () => {
    await assert.rejects(
      () => apiGet('/boom', { baseUrl }),
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 500);
        assert.equal(err.message, 'fallo interno');
        return true;
      }
    );
  });

  test('respuesta sin cuerpo JSON no rompe el parseo', async () => {
    const body = await apiGet('/sin-cuerpo', { baseUrl });
    assert.equal(body, null);
  });

  test('apiPost: envía el cuerpo como JSON con Content-Type correcto (usado por createProfile)', async () => {
    const body = await apiPost('/echo', { name: 'Perfil de prueba' }, { baseUrl });
    assert.deepEqual(body.received, { name: 'Perfil de prueba' });
    assert.match(body.contentType, /application\/json/);
  });

  test('apiPut: envía el cuerpo como JSON (usado por updateProfileActivities/markets/products/...)', async () => {
    const body = await apiPut('/replace', { market_ids: ['brasil', 'china'] }, { baseUrl });
    assert.deepEqual(body.replaced, { market_ids: ['brasil', 'china'] });
  });

  test('apiPost propaga 4xx igual que apiGet (mismo manejo de errores centralizado)', async () => {
    await assert.rejects(() => apiPost('/bad', {}, { baseUrl }), (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 400);
      return true;
    });
  });

  test('error de red: lanza ApiError sin status, con la causa original', async () => {
    const failingFetch = async () => { throw new TypeError('fetch failed'); };
    await assert.rejects(
      () => apiGet('/ok', { baseUrl, fetchImpl: failingFetch }),
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, null);
        assert.ok(err.cause instanceof TypeError);
        return true;
      }
    );
  });
});
