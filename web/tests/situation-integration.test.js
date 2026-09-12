// Integración real (Paso 2C-1, prompt seccion 17): backend real como proceso
// hijo, SQLite en memoria, puerto dedicado. Reusa EXACTAMENTE la receta ya
// validada en backend/test/radar.test.js (perfil con actividad principal
// ganaderia-bovina-carne + secundarias cultivo-soja/elaboracion-aceites +
// fixtures reales de precio de soja) para obtener una situación, un riesgo y
// una oportunidad REALES - no datos inventados por este test.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as api from '../src/services/api.js';
import { ApiError } from '../src/services/api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = join(__dirname, '..', '..', 'backend');
const PORT = 3998; // dedicado - distinto del usado por profile-integration.test.js
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

describe('Integración real: Situación (GET /profiles/:id/radar vía services/api.js)', () => {
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

  test('perfil con actividades reales + fixtures reales produce una situación con riesgo/oportunidad reales, leída vía api.getProfileRadar()', async () => {
    const opts = { baseUrl };

    await runPipelineFixture('soja-precio.t1.json');
    await runPipelineFixture('soja-precio.t2.json');

    const profile = await api.createProfile({ name: 'Situación - perfil ABC (test real)', main_activity_id: 'ganaderia-bovina-carne' }, opts);
    await api.updateProfileActivities(profile.id, { main_activity_id: 'ganaderia-bovina-carne', secondary_activity_ids: ['cultivo-soja', 'elaboracion-aceites'] }, opts);

    const radar = await api.getProfileRadar(profile.id, opts);

    assert.equal(radar.changes.no_relevant_changes, false);
    assert.ok(radar.changes.items.length >= 3, 'las 3 actividades relacionadas deben aparecer');
    assert.equal(radar.situations.items.length, 1, 'las 3 actividades comparten topic_id=precios y la misma señal -> UNA situación (mismo resultado que backend/test/radar.test.js Caso 2)');
    assert.deepEqual([...radar.situations.items[0].activity_ids].sort(), ['cultivo-soja', 'elaboracion-aceites', 'ganaderia-bovina-carne']);

    // cultivo-soja (lado ingresos, precio sube) -> oportunidad; elaboracion-aceites (lado costos) -> riesgo
    assert.ok(radar.opportunities.some((i) => i.activity_id === 'cultivo-soja'));
    assert.ok(radar.risks.some((i) => i.activity_id === 'elaboracion-aceites'));

    // el objeto tiene EXACTAMENTE las claves del contrato - nada inventado, nada de más
    assert.deepEqual(Object.keys(radar).sort(), ['changes', 'monitor', 'opportunities', 'profile_id', 'recommendations', 'risks', 'situations'].sort());

    console.log('[integración real] Situación verificada contra el backend real: 1 situación, riesgo y oportunidad reales, vía services/api.js#getProfileRadar.');
  });

  test('perfil recién creado sin actividades: no_relevant_changes=true, sin inventar riesgos/oportunidades', async () => {
    const opts = { baseUrl };
    const profile = await api.createProfile({ name: 'Perfil vacío (test real)' }, opts);
    const radar = await api.getProfileRadar(profile.id, opts);
    assert.equal(radar.changes.no_relevant_changes, true);
    assert.deepEqual(radar.risks, []);
    assert.deepEqual(radar.opportunities, []);
    assert.deepEqual(radar.monitor, []);
    assert.equal(radar.situations.no_active_situations, true);
  });

  test('perfil inexistente -> ApiError con status 404 (no una excepción genérica)', async () => {
    await assert.rejects(() => api.getProfileRadar('00000000-0000-0000-0000-000000000000', { baseUrl }), (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 404);
      return true;
    });
  });
});
