// Bloque C - adaptador real file_download. Sin dependencia de Internet: usa
// un servidor HTTP local (node:http) para simular las respuestas, salvo la
// validación en vivo (script aparte, ver informe de esta etapa).
//
// El contrato exige access.endpoint (misma convención que api_rest_json - ver
// adapters.js#fileDownload) declarado en knowledge/sources/sources.json. Hoy
// NINGÚN source real detrás de un monitor file_download lo declara (solo
// access.url de página institucional) - varias pruebas necesitan simular
// "un source que sí lo declarara" para probar el adaptador de punta a punta
// sin inventar URLs reales. Se hace vía monkeypatch temporal de
// knowledge.sourceById (mismo patrón ya usado en scheduler.test.js Caso 1b
// para global.setInterval: mutar, probar, restaurar en finally), NUNCA
// tocando knowledge/sources/sources.json.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { adapters } from '../data/acquisition/adapters.js';
import { resetDbForTests } from '../db/connection.js';
import { runPipeline } from '../pipeline/orchestrator.js';
import { createScheduler, operableMonitors, buildLiveJobs } from '../pipeline/scheduler.js';
import { knowledge } from '../knowledge/loader.js';

async function withServer(handler, fn) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  try {
    return await fn(url);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function fakeMonitor(overrides = {}) {
  return { id: 'test::file-download', source_id: 'test-source', method: 'file_download', enabled: true, ...overrides };
}
function fakeSource(endpoint, overrides = {}) {
  return { id: 'test-source', access: { endpoint, url: 'https://institucion.example/pagina' }, ...overrides };
}

describe('Bloque C - adaptador file_download (adapters.js), directo', () => {
  test('Caso 1 - descarga HTTP válida: devuelve status ok, kind raw_file, hash y tamaño reales', async () => {
    // content-type deliberadamente NO-csv: desde Bloque E, una respuesta CSV
    // real se normaliza como 'csv_table' (ver file-download-csv.test.js) -
    // este caso sigue cubriendo el contrato genérico de Bloque C para
    // cualquier otro binario (pdf/xlsx/shp/etc.).
    await withServer(
      (req, res) => { res.writeHead(200, { 'content-type': 'application/octet-stream' }); res.end('a,b\n1,2\n'); },
      async (url) => {
        const result = await adapters.file_download(fakeMonitor(), fakeSource(url));
        assert.equal(result.status, 'ok');
        assert.equal(result.normalized.kind, 'raw_file');
        assert.equal(result.normalized.content_type, 'application/octet-stream');
        assert.equal(result.normalized.byte_length, 8);
        assert.equal(result.size_bytes, 8);
        assert.ok(/^[0-9a-f]{64}$/.test(result.hash), 'hash debe ser sha256 hex de 64 caracteres');
      }
    );
  });

  test('Caso 2 - HTTP error (404/500): status source_unavailable, no acquisition_error genérico', async () => {
    await withServer(
      (req, res) => { res.writeHead(500); res.end('boom'); },
      async (url) => {
        const result = await adapters.file_download(fakeMonitor(), fakeSource(url));
        assert.equal(result.status, 'source_unavailable');
        assert.match(result.error, /HTTP 500/);
      }
    );
  });

  test('Caso 4 - contenido vacío: status acquisition_error, no se fabrica una captura "ok" vacía', async () => {
    await withServer(
      (req, res) => { res.writeHead(200); res.end(); },
      async (url) => {
        const result = await adapters.file_download(fakeMonitor(), fakeSource(url));
        assert.equal(result.status, 'acquisition_error');
        assert.match(result.error, /vacio/);
      }
    );
  });

  test('Caso 5a - archivo demasiado grande (Content-Length declarado supera el límite): se rechaza sin leer el cuerpo', async () => {
    await withServer(
      (req, res) => { res.writeHead(200, { 'content-length': '999999999' }); res.end('x'.repeat(1000)); },
      async (url) => {
        // el adaptador lee config.acquisitionMaxBytes real (no inyectable) -
        // probamos contra el límite real (20MB por defecto) con un
        // Content-Length declarado muy por encima, que debe rechazarse sin
        // leer el cuerpo.
        const result = await adapters.file_download(fakeMonitor(), fakeSource(url));
        assert.equal(result.status, 'acquisition_error');
        assert.match(result.error, /Content-Length/);
      }
    );
  });

  test('Caso 5b - archivo demasiado grande sin Content-Length (streaming, chunked): se aborta en curso por bytes leídos', async () => {
    await withServer(
      (req, res) => {
        res.writeHead(200); // sin content-length -> fuerza chunked
        const chunk = Buffer.alloc(1024 * 1024, 'a'); // 1MB por chunk
        let sent = 0;
        const interval = setInterval(() => {
          if (sent >= 25) { clearInterval(interval); res.end(); return; }
          res.write(chunk);
          sent += 1;
        }, 1);
      },
      async (url) => {
        // 25MB enviados > 20MB (config.acquisitionMaxBytes por defecto) -> debe abortar en streaming.
        const result = await adapters.file_download(fakeMonitor(), fakeSource(url));
        assert.equal(result.status, 'acquisition_error');
        assert.match(result.error, /supera el limite configurado/);
      }
    );
  });

  test('Caso 6 - respuesta inválida / conexión interrumpida: no lanza excepción, devuelve acquisition_error', async () => {
    const server = createServer((req, socket) => { socket.destroy(); });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/`;
    try {
      const result = await adapters.file_download(fakeMonitor(), fakeSource(url));
      assert.equal(result.status, 'acquisition_error');
      assert.ok(result.error, 'debe incluir un mensaje de error, sin propagar la excepción');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('Caso 9 - monitor sin configuración suficiente: sin access.endpoint declarado, no se intenta ninguna descarga', async () => {
    const monitor = fakeMonitor();
    const source = { id: 'test-source', access: { url: 'https://institucion.example/pagina', endpoint: null } };
    const result = await adapters.file_download(monitor, source);
    assert.equal(result.status, 'acquisition_error');
    assert.match(result.error, /no declara access\.endpoint/);
  });

  test('Caso 9b - estado real del repositorio: desde Bloque I, exactamente 2 monitores file_download declaran access.endpoint (ursea/ursec) - el resto sigue sin declarar', () => {
    const monitors = knowledge.monitors().filter((m) => m.method === 'file_download');
    assert.ok(monitors.length > 0);
    const withEndpoint = monitors.filter((m) => knowledge.sourceById(m.source_id)?.access?.endpoint);
    assert.deepEqual(withEndpoint.map((m) => m.id).sort(), ['ursea::precios-paridad-combustibles', 'ursec::principal'], 'si esto falla, la curación cambió: revisar operableMonitors() y este informe');
  });
});

describe('Bloque C - elegibilidad en operableMonitors() y propagación de contexto', () => {
  test('Caso 8 - monitor habilitado correctamente: si su source SÍ declarara access.endpoint, sería elegible (y deja de serlo al restaurar)', () => {
    const realMonitor = knowledge.monitors().find((m) => m.method === 'file_download');
    assert.ok(realMonitor, 'debe existir al menos un monitor file_download real');
    const original = knowledge.sourceById;
    try {
      assert.ok(!operableMonitors().some((m) => m.id === realMonitor.id), 'hoy, sin endpoint, no debe ser operable');

      knowledge.sourceById = (id) => (id === realMonitor.source_id ? { ...original(id), access: { ...original(id).access, endpoint: 'https://example.invalid/archivo.csv' } } : original(id));
      assert.ok(operableMonitors().some((m) => m.id === realMonitor.id), 'con endpoint declarado, debe pasar a ser operable');
    } finally {
      knowledge.sourceById = original;
    }
    assert.ok(!operableMonitors().some((m) => m.id === realMonitor.id), 'restaurado el estado real, vuelve a quedar fuera de operación');
  });

  test('Caso 10 - propagación de context: buildLiveJobs mezcla kind=raw_file con originActivityId/originRamificationId/topicId si el monitor los declara', () => {
    const monitor = fakeMonitor({
      method: 'file_download',
      context: { origin_activity_id: 'agricultura-secano', origin_ramification_id: 'clima', topic_id: 'clima-agua' },
    });
    const [job] = buildLiveJobs([monitor]);
    assert.deepEqual(job.context, {
      kind: 'raw_file',
      originActivityId: 'agricultura-secano',
      originRamificationId: 'clima',
      topicId: 'clima-agua',
    });
  });

  test('Caso 10b - sin context curado, buildLiveJobs no inventa nada (solo kind)', () => {
    const monitor = fakeMonitor({ method: 'file_download' });
    const [job] = buildLiveJobs([monitor]);
    assert.deepEqual(job.context, { kind: 'raw_file' });
  });
});

describe('Bloque C - a través del pipeline real (runPipeline) y del scheduler', () => {
  test('Caso 7 - error individual (job file_download roto) no aborta el resto del batch', async () => {
    await withServer(
      (req, res) => { res.writeHead(200, { 'content-type': 'text/csv' }); res.end('ok,1\n'); },
      async (goodUrl) => {
        const db = resetDbForTests(':memory:');
        const realMonitors = knowledge.monitors().filter((m) => m.method === 'file_download');
        const goodMonitor = realMonitors[0];
        const brokenMonitor = realMonitors.find((m) => m.source_id !== goodMonitor.source_id);
        assert.ok(brokenMonitor, 'debe existir un segundo monitor file_download con un source_id distinto');
        const original = knowledge.sourceById;
        try {
          knowledge.sourceById = (id) => {
            const s = original(id);
            if (id === goodMonitor.source_id) return { ...s, access: { ...s.access, endpoint: goodUrl } };
            if (id === brokenMonitor.source_id) return { ...s, access: { ...s.access, endpoint: 'http://127.0.0.1:1/no-existe' } };
            return s;
          };

          const result = await runPipeline(
            db,
            [
              { monitorId: goodMonitor.id, context: { kind: 'raw_file' } },
              { monitorId: brokenMonitor.id, context: { kind: 'raw_file' } },
            ],
            { mode: 'live' }
          );

          assert.equal(result.outputs.captures.length, 2, 'ambos jobs deben procesarse aunque uno falle');
          const goodCapture = result.outputs.captures.find((c) => c.monitor_id === goodMonitor.id);
          const brokenCapture = result.outputs.captures.find((c) => c.monitor_id === brokenMonitor.id);
          assert.equal(goodCapture.status, 'ok');
          assert.equal(brokenCapture.status, 'acquisition_error');

          const changes = db.prepare('SELECT monitor_id, change_class FROM changes').all();
          assert.ok(changes.some((c) => c.monitor_id === brokenMonitor.id && c.change_class === 'error_de_adquisicion'), 'el fallo se registra como evento técnico, no se pierde silenciosamente');
        } finally {
          knowledge.sourceById = original;
        }
      }
    );
  });

  test('Caso 11 - compatibilidad con scheduler: triggerNow() despacha jobs file_download con el mismo contrato que ckan_api/api_rest_json', async () => {
    const db = resetDbForTests(':memory:');
    const calls = [];
    const scheduler = createScheduler(db, {
      runPipelineFn: async (_db, jobs) => { calls.push(jobs); return { runId: 'r1', hadErrors: false }; },
      listOperableMonitors: () => [
        { id: 'fake::ckan', method: 'ckan_api' },
        { id: 'fake::file', method: 'file_download', context: { origin_activity_id: 'agricultura-secano' } },
      ],
    });
    await scheduler.triggerNow();
    assert.equal(calls.length, 1);
    const fileJob = calls[0].find((j) => j.monitorId === 'fake::file');
    assert.equal(fileJob.context.kind, 'raw_file');
    assert.equal(fileJob.context.originActivityId, 'agricultura-secano');
  });

  test('Caso 12 - regresión: operableMonitors() devuelve los 19 de Bloque A/B + ursea/ursec (Bloque I) = 21', () => {
    const monitors = operableMonitors();
    assert.equal(monitors.length, 21);
    const fileDownloadOperable = monitors.filter((m) => m.method === 'file_download').map((m) => m.id);
    assert.deepEqual(fileDownloadOperable.sort(), ['ursea::precios-paridad-combustibles', 'ursec::principal'], 'ver informe de Bloque I - único cambio funcional: endpoint real persistido para estos dos monitores');
  });
});
