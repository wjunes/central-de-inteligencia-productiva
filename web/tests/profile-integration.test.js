// Prueba de integración real (prompt seccion 23): levanta el backend real
// como proceso hijo (SQLite en memoria, puerto dedicado - no interfiere con
// una instancia real en :3001) y ejecuta el flujo completo a través de las
// MISMAS funciones de src/services/api.js que usa pages/perfil.js:
//   catálogo -> actividad -> ramificaciones -> perfil -> guardado
// Sin datos ficticios: todo id usado (cultivo-soja, soja, semillas, brasil...)
// viene de la respuesta real del backend, nunca hardcodeado a ciegas.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as api from '../src/services/api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = join(__dirname, '..', '..', 'backend');
const PORT = 3999; // dedicado a esta prueba - no choca con una instancia real en :3001
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

describe('Integración real: catálogo -> actividad -> ramificaciones -> perfil -> guardado', () => {
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

  test('flujo completo real usando exclusivamente src/services/api.js', async () => {
    const opts = { baseUrl };

    const catalogs = await api.getProfileCatalogs(opts);
    assert.ok(catalogs.activities.items.length > 0, 'el catálogo real debe traer actividades');

    const soja = catalogs.activities.items.find((a) => a.id === 'cultivo-soja');
    assert.ok(soja, 'cultivo-soja debe existir en el catálogo real (no un dato inventado por el test)');

    const profile = await api.createProfile({ name: 'Perfil de integración (test automático)' }, opts);
    assert.ok(profile.id);
    assert.equal(profile.name, 'Perfil de integración (test automático)');

    const withActivities = await api.updateProfileActivities(profile.id, { main_activity_id: 'cultivo-soja', secondary_activity_ids: [] }, opts);
    assert.equal(withActivities.activities.find((a) => a.kind === 'main').activity_id, 'cultivo-soja');

    const ramifications = await api.getActivityRamifications('cultivo-soja', opts);
    assert.ok(ramifications.ramifications.products.some((p) => p.id === 'soja'), 'soja debe ser un producto real de cultivo-soja');
    assert.ok(ramifications.ramifications.inputs.some((i) => i.id === 'semillas'), 'semillas debe ser un insumo real de cultivo-soja');

    const withProducts = await api.updateProfileProducts(profile.id, [{ activity_id: 'cultivo-soja', ramification_id: 'soja' }], opts);
    assert.ok(withProducts.products.some((p) => p.ramification_id === 'soja'));

    const withInputs = await api.updateProfileInputs(profile.id, [{ activity_id: 'cultivo-soja', ramification_id: 'semillas' }], opts);
    assert.ok(withInputs.inputs.some((i) => i.ramification_id === 'semillas'));

    assert.ok(catalogs.markets.market_dimensions.includes('brasil'), 'brasil debe existir en el catálogo real de mercados');
    const withMarkets = await api.updateProfileMarkets(profile.id, ['brasil'], opts);
    assert.deepEqual(withMarkets.markets, ['brasil']);

    const firstTopic = catalogs.topics[0].id;
    const withPriorities = await api.updateProfilePriorities(profile.id, [{ topic_id: firstTopic, rank: 1 }], opts);
    assert.equal(withPriorities.priorities[0].topic_id, firstTopic);

    const category = catalogs.constraints.categories[0].id;
    const severity = catalogs.constraints.severities[0];
    const withConstraints = await api.updateProfileConstraints(profile.id, [{ category, severity, description: null }], opts);
    assert.equal(withConstraints.constraints[0].category, category);
    assert.equal(withConstraints.constraints[0].severity, severity);

    const reloaded = await api.getProfile(profile.id, opts);
    assert.equal(reloaded.name, 'Perfil de integración (test automático)');
    assert.equal(reloaded.markets[0], 'brasil');
    assert.equal(reloaded.products.length, 1);
    assert.equal(reloaded.inputs.length, 1);

    console.log('[integración real] catálogo -> actividad -> ramificaciones -> perfil -> guardado verificado contra el backend real vía src/services/api.js.');
  });

  test('actividad inexistente en ramificaciones propaga un ApiError con status 404 (sin romper la app)', async () => {
    await assert.rejects(() => api.getActivityRamifications('no-existe-xyz', { baseUrl }), (err) => {
      assert.equal(err.status, 404);
      return true;
    });
  });

  test('perfil inexistente al recargar propaga un ApiError con status 404', async () => {
    await assert.rejects(() => api.getProfile('00000000-0000-0000-0000-000000000000', { baseUrl }), (err) => {
      assert.equal(err.status, 404);
      return true;
    });
  });
});
