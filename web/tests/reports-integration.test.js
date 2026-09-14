// Integración real de Informes (Paso 2E-2): backend real como proceso hijo,
// SQLite en memoria, puerto dedicado (3996 - distinto de 3997/3998/3999 ya
// usados por radar/situation/profile-integration.test.js). Reusa la MISMA
// receta ya probada en backend/test/reports.test.js (perfil ganadería/soja/
// aceites + fixtures reales de precio de soja).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as api from '../src/services/api.js';
import { ApiError } from '../src/services/api.js';
import { classifyGenerateError } from '../src/utils/reports.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = join(__dirname, '..', '..', 'backend');
const PORT = 3996;
const baseUrl = `http://127.0.0.1:${PORT}`;

let backendProcess;
let callCount = 0;
function countingFetch(...args) {
  callCount += 1;
  return fetch(...args);
}

async function waitForBackend(timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return;
    } catch {
      /* aún no está listo */
    }
    await delay(150);
  }
  throw new Error('el backend real no respondió a tiempo para la prueba de integración');
}

async function runPipelineFixture(file, extra = {}) {
  const res = await fetch(`${baseUrl}/pipeline/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'fixture',
      jobs: [{ monitorId: 'fao-giews-amis::principal', fixtureFile: file, context: { originActivityId: 'cultivo-soja', originRamificationId: 'soja', indicator: 'precio-soja-fao-amis', topicId: 'precios', kind: 'indicator', ...extra } }],
    }),
  });
  if (!res.ok) throw new Error(`pipeline/run falló: ${res.status} ${await res.text()}`);
  return res.json();
}

describe('Integración real: Informes (endpoints reales vía services/api.js)', () => {
  before(async () => {
    backendProcess = spawn(process.execPath, ['server.js'], {
      cwd: BACKEND_DIR,
      env: { ...process.env, PORT: String(PORT), DB_PATH: ':memory:', NODE_ENV: 'test' },
      stdio: 'ignore',
    });
    await waitForBackend();
  });

  after(() => {
    backendProcess?.kill();
  });

  test('perfil multiactividad real: generar sectorial/personalized, leer, trazabilidad, versiones, narrativa determinística', async () => {
    const opts = { baseUrl };
    await runPipelineFixture('soja-precio.t1.json');
    await runPipelineFixture('soja-precio.t2.json');

    const profile = await api.createProfile({ name: 'Informes - perfil ABC (test real)', main_activity_id: 'ganaderia-bovina-carne' }, opts);
    await api.updateProfileActivities(profile.id, { main_activity_id: 'ganaderia-bovina-carne', secondary_activity_ids: ['cultivo-soja', 'elaboracion-aceites'] }, opts);

    // sectorial (sin perfil, contrato §6/§9)
    const sectorial = await api.generateReport({ type: 'sectorial', activityId: 'elaboracion-aceites' }, opts);
    assert.equal(sectorial.type, 'sectorial');
    assert.ok(sectorial.body.risks.claims.length > 0, 'elaboracion-aceites debe tener riesgo real, igual que en Radar');

    // personalized (multiactividad real, contrato §9)
    const personalized = await api.generateReport({ type: 'personalized', profileId: profile.id }, opts);
    assert.equal(personalized.scope.activities.length, 3);
    const byActivity = Object.fromEntries(personalized.claims.filter((c) => c.type === 'risk' || c.type === 'opportunity').map((c) => [c.activity_id, c.type]));
    assert.equal(byActivity['cultivo-soja'], 'opportunity');
    assert.equal(byActivity['elaboracion-aceites'], 'risk');
    assert.equal(byActivity['ganaderia-bovina-carne'], undefined, 'sin privilegio/forzado para la actividad principal');

    // leer (reproducibilidad, contrato §5/§29)
    const reread = await api.getReport(personalized.id, opts);
    assert.deepEqual(reread.body, personalized.body);

    // trazabilidad completa (contrato §15) - más profunda que Radar, llega a la fuente
    const trace = await api.getReportTraceability(sectorial.id, opts);
    const withSource = trace.traceability.find((t) => t.source_id);
    assert.ok(withSource);
    assert.equal(withSource.source_id, 'fao-giews-amis');
    assert.ok(withSource.institution);

    // versiones (una sola por ahora)
    const versions = await api.getReportVersions(sectorial.id, opts);
    assert.equal(versions.versions.length, 1);
    assert.equal(versions.versions[0].id, sectorial.id);

    // narrativa: no existe todavía -> 404 real (isNotFoundError reusable)
    await assert.rejects(() => api.getReportNarrative(sectorial.id, opts), (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 404);
      return true;
    });

    // narrativa determinística: 0 costo externo, siempre disponible
    const narrative = await api.generateReportNarrative(sectorial.id, { mode: 'deterministic' }, opts);
    assert.equal(narrative.mode, 'deterministic');
    assert.equal(narrative.status, 'validated');
    assert.ok(narrative.body.paragraphs.length > 0);

    // ahora sí existe
    const fetched = await api.getReportNarrative(sectorial.id, opts);
    assert.equal(fetched.id, narrative.id);

    // historial
    const history = await api.listReports({ profileId: profile.id }, opts);
    assert.ok(history.reports.some((r) => r.id === personalized.id));
  });

  test('GAP 21.1 real: type desconocido y param obligatorio ausente responden 500, classifyGenerateError los reclasifica como "validation"', async () => {
    const opts = { baseUrl };

    await assert.rejects(() => api.generateReport({ type: 'no-existe' }, opts), (err) => {
      assert.equal(err.status, 500);
      assert.equal(classifyGenerateError(err), 'validation');
      return true;
    });

    await assert.rejects(() => api.generateReport({ type: 'sectorial' }, opts), (err) => {
      assert.equal(err.status, 500);
      assert.equal(classifyGenerateError(err), 'validation');
      return true;
    });
  });

  test('body.type ausente -> 400 real (no reclasificado, ya es el status correcto)', async () => {
    await assert.rejects(() => api.generateReport({}, { baseUrl }), (err) => {
      assert.equal(err.status, 400);
      assert.equal(classifyGenerateError(err), 'validation');
      return true;
    });
  });

  test('informe inexistente -> 404 real en los 4 endpoints de lectura', async () => {
    const opts = { baseUrl };
    const fakeId = '00000000-0000-0000-0000-000000000000';
    for (const call of [
      () => api.getReport(fakeId, opts),
      () => api.getReportTraceability(fakeId, opts),
      () => api.getReportVersions(fakeId, opts),
      () => api.getReportNarrative(fakeId, opts),
    ]) {
      await assert.rejects(call, (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 404);
        return true;
      });
    }
  });

  test('narrativa IA sin API key configurada -> 503 real, con hint, sin llamar a ningún proveedor externo', async () => {
    const opts = { baseUrl };
    const report = await api.generateReport({ type: 'risk', activityIds: ['elaboracion-aceites'] }, opts);
    await assert.rejects(() => api.generateReportNarrative(report.id, { mode: 'ai' }, opts), (err) => {
      assert.equal(err.status, 503);
      assert.ok(err.message.toLowerCase().includes('proveedor'));
      return true;
    });
  });

  test('generateReport() realiza exactamente 1 fetch por invocación (arquitectura-informes-ux.md §27)', async () => {
    const opts = { baseUrl, fetchImpl: countingFetch };
    callCount = 0;
    await api.generateReport({ type: 'risk', activityIds: ['elaboracion-aceites'] }, opts);
    assert.equal(callCount, 1);
  });
});
