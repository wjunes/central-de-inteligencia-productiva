// Bloque E - integración CSV + file_download + pipeline real. Sin red: usa
// servidor HTTP local y el mismo patrón de monkeypatch temporal de
// knowledge.sourceById ya usado en file-download.test.js (Bloque C).
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
  const url = `http://127.0.0.1:${server.address().port}/datos.csv`;
  try {
    return await fn(url);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function fakeMonitor(overrides = {}) {
  return { id: 'test::csv', source_id: 'test-source', method: 'file_download', enabled: true, ...overrides };
}
function fakeSource(endpoint) {
  return { id: 'test-source', access: { endpoint, url: 'https://institucion.example/pagina' } };
}

describe('Bloque E - Caso 8: adaptador file_download detecta y parsea CSV', () => {
  test('respuesta con content-type csv se normaliza como csv_table', async () => {
    await withServer(
      (req, res) => { res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8' }); res.end('a,b\n1,2\n3,4\n'); },
      async (url) => {
        const result = await adapters.file_download(fakeMonitor(), fakeSource(url));
        assert.equal(result.status, 'ok');
        assert.equal(result.normalized.kind, 'csv_table');
        assert.deepEqual(result.normalized.headers, ['a', 'b']);
        assert.deepEqual(result.normalized.rows, [['1', '2'], ['3', '4']]);
        assert.equal(result.normalized.row_count, 2);
      }
    );
  });

  test('respuesta sin content-type csv pero con URL terminada en .csv también se detecta', async () => {
    await withServer(
      (req, res) => { res.writeHead(200, { 'content-type': 'application/octet-stream' }); res.end('x,y\n1,2\n'); },
      async (url) => {
        const result = await adapters.file_download(fakeMonitor(), fakeSource(url));
        assert.equal(result.normalized.kind, 'csv_table');
      }
    );
  });

  test('respuesta que no es CSV (ni content-type ni extensión) sigue devolviendo raw_file, sin cambios de Bloque C', async () => {
    const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/pdf' }); res.end('%PDF-1.4 fake'); });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/archivo.pdf`;
    try {
      const result = await adapters.file_download(fakeMonitor(), fakeSource(url));
      assert.equal(result.normalized.kind, 'raw_file');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('CSV inválido (fila con distinta cantidad de campos) -> acquisition_error visible, no acquisition "ok" falsa', async () => {
    await withServer(
      (req, res) => { res.writeHead(200, { 'content-type': 'text/csv' }); res.end('a,b,c\n1,2\n'); },
      async (url) => {
        const result = await adapters.file_download(fakeMonitor(), fakeSource(url));
        assert.equal(result.status, 'acquisition_error');
        assert.match(result.error, /CSV invalido/);
      }
    );
  });
});

describe('Bloque E - Caso 10: propagación de contexto (mecanismo de Bloque B, sin cambios)', () => {
  test('un monitor file_download+CSV con context curado propaga origin_activity_id/topic_id igual que cualquier otro método', () => {
    const monitor = fakeMonitor({ context: { origin_activity_id: 'agricultura-secano', topic_id: 'precios' } });
    const [job] = buildLiveJobs([monitor]);
    assert.equal(job.context.kind, 'raw_file'); // VALIDATION_KIND_BY_METHOD no distingue csv_table (decisión del adaptador, no del scheduler)
    assert.equal(job.context.originActivityId, 'agricultura-secano');
    assert.equal(job.context.topicId, 'precios');
  });
});

describe('Bloque E - Caso 9: detección de cambios con el método YA declarado, sobre datos CSV reales', () => {
  test('value_comparison (declarado por dgi::principal) sobre csv_table real: desde Bloque N, selection.latest_period resuelve la ambigüedad de fila y la extracción llega a buen puerto', async () => {
    // Bloque J: dgi::principal declara monitoring_definition (delimiter ';',
    // encoding windows-1252, header_row=13 - 13 filas de preambulo). Bloque L
    // agregó la extracción genérica csv_table->valor escalar
    // (data/normalization/scalar.js), que con 2+ filas fallaba de forma
    // controlada (value_field='Importe' por sí solo era ambiguo). Bloque M
    // curó monitoring_definition.selection (field='Fecha',
    // strategy='latest_period') y Bloque N la implementó genéricamente
    // (data/normalization/selection.js) - el mismo cuerpo sintético de dos
    // meses que antes quedaba bloqueado ahora se reduce a 1 fila (el período
    // más reciente, Feb-2026) ANTES de extractValue(), y la extracción tiene
    // éxito.
    const preamble = ';;;;;;\n'.repeat(13);
    const body = `${preamble};;;Fecha;Importe;;\n;;2026;Ene-2026;100;;\n;;2026;Feb-2026;110;;\n`;
    await withServer(
      (req, res) => {
        res.writeHead(200, { 'content-type': 'text/csv' });
        res.end(body);
      },
      async (url) => {
        const db = resetDbForTests(':memory:');
        const monitor = knowledge.monitorById('dgi::principal');
        assert.equal(monitor.change_detection.method, 'value_comparison');
        assert.equal(monitor.monitoring_definition.value_field, 'Importe');
        assert.equal(monitor.monitoring_definition.selection.strategy, 'latest_period');
        const original = knowledge.sourceById;
        try {
          knowledge.sourceById = (id) => (id === monitor.source_id ? { ...original(id), access: { ...original(id).access, endpoint: url } } : original(id));
          const result = await runPipeline(db, [{ monitorId: monitor.id, context: { kind: 'csv_table' } }], { mode: 'live' });

          assert.equal(result.hadErrors, false, 'la selección resuelve la ambigüedad - ya no es un error de normalización');
          assert.equal(result.outputs.captures[0].status, 'ok');
          assert.equal(result.outputs.captures[0].normalized.kind, 'indicator');
          assert.equal(result.outputs.captures[0].normalized.value, 110, 'debe seleccionar Feb-2026 (el período más reciente), no Ene-2026 ni una suma/promedio');
          assert.equal(result.outputs.changes[0].change_class, 'valor_modificado', 'primera captura, comportamiento preexistente de valueComparison(prev=null,...)');
        } finally {
          knowledge.sourceById = original;
        }
      }
    );
  });

  test('record_diff (declarado por mgap-snig::principal) sobre csv_table real: desde Bloque K el record_key real (prefijo ns1:) SÍ produce records y detecta altas', async () => {
    // Bloque K re-curó change_detection.record_key con el prefijo real
    // 'ns1:' (ver informe) - el cuerpo sintético debe usar ';' (delimiter
    // curado desde Bloque J) y las 11 columnas reales para seguir probando
    // el camino real de este monitor, ya no la ausencia de record_key.
    const header = 'ns1:Ejercicio;ns1:DepartamentoCodigo;ns1:SeccionalPolicialCodigo;ns1:AreaSupervision;ns1:AreaEnumeracion;ns1:ActividadCodigo;ns1:GiroCodigo;ns1:NaturalezaJuridicaCodigo;ns1:EstratoCodigo;ns1:EspecializacionMGAPCodigo;ns1:TipoProduccionMGAPCodigo';
    const body = `${header}\n2025;1;0;0;0;44;10;3;1;1;1\n2025;2;0;0;0;44;10;3;1;1;1\n`;
    await withServer(
      (req, res) => { res.writeHead(200, { 'content-type': 'text/csv' }); res.end(body); },
      async (url) => {
        const db = resetDbForTests(':memory:');
        const monitor = knowledge.monitorById('mgap-snig::principal');
        assert.equal(monitor.change_detection.method, 'record_diff');
        assert.equal(monitor.change_detection.record_key.length, 11);
        const original = knowledge.sourceById;
        try {
          knowledge.sourceById = (id) => (id === monitor.source_id ? { ...original(id), access: { ...original(id).access, endpoint: url } } : original(id));
          const result = await runPipeline(db, [{ monitorId: monitor.id, context: { kind: 'csv_table' } }], { mode: 'live' });

          assert.equal(result.hadErrors, false);
          assert.equal(result.outputs.captures[0].normalized.records.length, 2, 'toRecords() ahora produce records reales (record_key con prefijo ns1: coincide con el header real)');
          assert.equal(result.outputs.changes[0].change_class, 'nuevo_registro', 'primera captura, sin snapshot previo -> ambos registros son altas');
          assert.equal(result.stats.signals_generated, 1);
        } finally {
          knowledge.sourceById = original;
        }
      }
    );
  });
});

describe('Bloque E - Caso 11: error individual (CSV roto) no aborta el resto del batch', () => {
  test('un job CSV inválido junto a un job CSV válido: ambos se procesan, solo el roto queda como acquisition_error', async () => {
    await withServer(
      (req, res) => { res.writeHead(200, { 'content-type': 'text/csv' }); res.end('a,b\n1,2\n'); },
      async (goodUrl) => {
        const brokenServer = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/csv' }); res.end('a,b,c\n1,2\n'); });
        await new Promise((resolve) => brokenServer.listen(0, '127.0.0.1', resolve));
        const brokenUrl = `http://127.0.0.1:${brokenServer.address().port}/roto.csv`;
        try {
          const db = resetDbForTests(':memory:');
          // mgap-dgf::principal (no monitoring_definition, ver Bloque F: solo 5
          // monitores fueron curados) - a diferencia de opp::principal (usado
          // hasta Bloque I aquí), desde Bloque J cualquier monitor CON
          // monitoring_definition ve su delimiter/encoding/header_row
          // realmente aplicados; usar aquí un monitor SIN curar mantiene esta
          // prueba enfocada en aislamiento genérico de errores, no en la
          // configuración curada de un monitor específico.
          const [goodMonitor, brokenMonitor] = [knowledge.monitorById('ursec::principal'), knowledge.monitorById('mgap-dgf::principal')];
          const original = knowledge.sourceById;
          try {
            knowledge.sourceById = (id) => {
              if (id === goodMonitor.source_id) return { ...original(id), access: { ...original(id).access, endpoint: goodUrl } };
              if (id === brokenMonitor.source_id) return { ...original(id), access: { ...original(id).access, endpoint: brokenUrl } };
              return original(id);
            };
            const result = await runPipeline(
              db,
              [
                { monitorId: goodMonitor.id, context: { kind: 'csv_table' } },
                { monitorId: brokenMonitor.id, context: { kind: 'csv_table' } },
              ],
              { mode: 'live' }
            );
            assert.equal(result.outputs.captures.length, 2);
            const good = result.outputs.captures.find((c) => c.monitor_id === goodMonitor.id);
            const broken = result.outputs.captures.find((c) => c.monitor_id === brokenMonitor.id);
            assert.equal(good.status, 'ok');
            assert.equal(broken.status, 'acquisition_error');
          } finally {
            knowledge.sourceById = original;
          }
        } finally {
          await new Promise((resolve) => brokenServer.close(resolve));
        }
      }
    );
  });
});

describe('Bloque E - Caso 12: regresión A+B+C (scheduler y ejecución manual sin cambios)', () => {
  // En Bloque E ningún monitor CSV era operable (19). Desde Bloque I,
  // ursea/ursec tienen access.endpoint real persistido en sources.json y sí
  // son operables (21) - ver test dedicado en scheduler.test.js. El resto de
  // los monitores file_download (mgap-snig/dgi/opp) sigue sin endpoint y por
  // lo tanto sigue excluido, que es lo que esta prueba verifica ahora.
  test('operableMonitors() en 21 (19 previos + ursea + ursec desde Bloque I): los demás monitores file_download siguen sin endpoint', () => {
    assert.equal(operableMonitors().length, 21);
    const fileDownloadOperable = operableMonitors().filter((m) => m.method === 'file_download').map((m) => m.id);
    assert.deepEqual(fileDownloadOperable.sort(), ['ursea::precios-paridad-combustibles', 'ursec::principal']);
  });

  test('el scheduler sigue despachando con normalidad (regresión de Bloque A/B/C)', async () => {
    const db = resetDbForTests(':memory:');
    const calls = [];
    const scheduler = createScheduler(db, { runPipelineFn: async (_db, jobs) => { calls.push(jobs); return { runId: 'r1', hadErrors: false }; } });
    await scheduler.triggerNow();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].length, 21);
  });
});
