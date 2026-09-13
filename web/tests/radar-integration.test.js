// Integración real de Radar Productivo (Paso 2D-2): backend real como
// proceso hijo, SQLite en memoria, puerto dedicado (3997 - distinto de 3998
// usado por situation-integration.test.js y 3999 por profile-integration.test.js).
// Reusa la MISMA receta ya probada en backend/test/radar.test.js y en
// situation-integration.test.js (perfil ganadería/soja/aceites + fixtures
// reales de precio de soja).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as api from '../src/services/api.js';
import { ApiError } from '../src/services/api.js';
import { uniqueActivityIds, changesForType, findDecisionForRecommendation } from '../src/utils/radar.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = join(__dirname, '..', '..', 'backend');
const PORT = 3997;
const baseUrl = `http://127.0.0.1:${PORT}`;

let backendProcess;

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

describe('Integración real: Radar Productivo (GET /profiles/:id/radar vía services/api.js)', () => {
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

  test('perfil multiactividad real: utils/radar.js opera correctamente sobre la respuesta real (no una forma inventada)', async () => {
    const opts = { baseUrl };

    await runPipelineFixture('soja-precio.t1.json');
    await runPipelineFixture('soja-precio.t2.json');

    const profile = await api.createProfile({ name: 'Radar - perfil ABC (test real)', main_activity_id: 'ganaderia-bovina-carne' }, opts);
    await api.updateProfileActivities(profile.id, { main_activity_id: 'ganaderia-bovina-carne', secondary_activity_ids: ['cultivo-soja', 'elaboracion-aceites'] }, opts);

    const radar = await api.getProfileRadar(profile.id, opts);

    // multiactividad real (contrato-radar.md §10)
    assert.deepEqual(uniqueActivityIds(radar.changes.items).sort(), ['cultivo-soja', 'elaboracion-aceites', 'ganaderia-bovina-carne']);
    assert.equal(changesForType(radar, 'risk'), radar.risks);
    assert.ok(radar.risks.some((r) => r.activity_id === 'elaboracion-aceites'));
    assert.ok(radar.opportunities.some((r) => r.activity_id === 'cultivo-soja'));
    assert.ok(radar.monitor.some((r) => r.activity_id === 'ganaderia-bovina-carne'));

    // radar.recommendations trae tipos más allá de monitor/seek_information (contrato §5.4, prompt seccion 10)
    const types = new Set(radar.recommendations.map((r) => r.type));
    assert.ok(types.has('mitigate') || types.has('pursue_opportunity'), 'debe existir al menos un tipo de recomendación fuera de monitor/seek_information');

    // findDecisionForRecommendation resuelve una relación REAL contra el payload real
    const withDecision = radar.recommendations.find((r) => findDecisionForRecommendation(r, radar.changes.items));
    assert.ok(withDecision, 'al menos una recomendación real debe poder vincularse a su decisión dentro del mismo payload');

    // situación real: 1 situación agrupando las 3 actividades
    assert.equal(radar.situations.items.length, 1);
    assert.deepEqual([...radar.situations.items[0].activity_ids].sort(), ['cultivo-soja', 'elaboracion-aceites', 'ganaderia-bovina-carne']);
  });

  test('perfil recién creado sin actividades: estructura vacía real, sin inventar riesgos/oportunidades/recomendaciones', async () => {
    const opts = { baseUrl };
    const profile = await api.createProfile({ name: 'Perfil vacío (test real, Radar)' }, opts);
    const radar = await api.getProfileRadar(profile.id, opts);
    assert.equal(radar.changes.no_relevant_changes, true);
    assert.deepEqual(uniqueActivityIds(radar.changes.items), []);
    assert.deepEqual(radar.risks, []);
    assert.deepEqual(radar.opportunities, []);
    assert.deepEqual(radar.monitor, []);
    assert.deepEqual(radar.recommendations, []);
  });

  test('perfil inexistente -> ApiError 404 (reusa el mismo helper que Situación, no una excepción genérica)', async () => {
    await assert.rejects(() => api.getProfileRadar('00000000-0000-0000-0000-000000000000', { baseUrl }), (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 404);
      return true;
    });
  });

  test('una sola llamada HTTP por invocación de getProfileRadar() (prompt seccion 21: 1 GET por carga)', async () => {
    const opts = { baseUrl };
    const profile = await api.createProfile({ name: 'Conteo de requests (test real)', main_activity_id: 'ganaderia-bovina-carne' }, opts);

    let calls = 0;
    const countingFetch = (...args) => {
      calls += 1;
      return fetch(...args);
    };

    await api.getProfileRadar(profile.id, { baseUrl, fetchImpl: countingFetch });
    assert.equal(calls, 1, 'getProfileRadar() debe realizar exactamente 1 fetch, sin llamadas adicionales por sección/componente');
  });
});
