// Caso 3 (timeout) aislado en su propio archivo/proceso: node --test ejecuta
// cada archivo en un proceso separado. Se usa import() dinámico (nunca
// estático: los imports estáticos se izan por encima de cualquier
// asignación a process.env en el mismo archivo) para poder fijar
// ACQUISITION_TIMEOUT_MS ANTES de que config.js (leído por adapters.js) se
// cargue, sin afectar el timeout real (10s) usado por el resto de la suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

process.env.ACQUISITION_TIMEOUT_MS = '150';
const { adapters } = await import('../data/acquisition/adapters.js');

test('Caso 3 - timeout: una fuente que nunca responde produce acquisition_error, no un cuelgue', async () => {
  const server = createServer(() => { /* nunca responde */ });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  try {
    const start = Date.now();
    const result = await adapters.file_download(
      { id: 'test::timeout', source_id: 'test-source', method: 'file_download' },
      { id: 'test-source', access: { endpoint: url } }
    );
    const elapsed = Date.now() - start;
    assert.equal(result.status, 'acquisition_error');
    assert.match(result.error, /timeout/);
    assert.ok(elapsed < 5000, `debe abortar cerca del timeout configurado (150ms), no esperar indefinidamente (tardó ${elapsed}ms)`);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
