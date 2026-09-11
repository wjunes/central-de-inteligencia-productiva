// Pruebas del GAP "Paso 2A": GET /profile/ramifications/:activityId debe
// exponer exclusivamente knowledge.effectiveRamifications(), la misma fuente
// que core/profile/store.js ya usa para validar profile_products/profile_inputs.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { resetDbForTests } from '../db/connection.js';
import { createRouter } from '../api/router.js';
import { knowledge } from '../knowledge/loader.js';
import { getActivityRamifications, groupRamificationsByCategory, ActivityNotFoundError } from '../core/profile/ramifications.js';

describe('GET /profile/ramifications/:activityId', () => {
  let server;
  let baseUrl;

  before(async () => {
    const db = resetDbForTests(':memory:');
    const handle = createRouter(db);
    server = createServer((req, res) => handle(req, res));
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  // Caso 1 - actividad válida
  test('Caso 1 - actividad válida responde 200 con activity_id y ramificaciones agrupadas', async () => {
    const res = await fetch(`${baseUrl}/profile/ramifications/cultivo-soja`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.activity_id, 'cultivo-soja');
    assert.ok(body.ramifications && typeof body.ramifications === 'object');
    assert.ok(Object.keys(body.ramifications).length > 0);
  });

  // Caso 2 - actividad inexistente
  test('Caso 2 - actividad inexistente responde 404 con el patrón de error del router', async () => {
    const res = await fetch(`${baseUrl}/profile/ramifications/actividad-que-no-existe`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, 'activity_not_found');
    assert.match(body.message, /actividad-que-no-existe/);
  });

  // Caso 3 - actividad válida sin ramificaciones (no existe hoy en knowledge/
  // real - cobertura verificada 1:1, 115 actividades / 115 archivos - se
  // prueba la funcion pura que resuelve ese caso, no un fixture inventado)
  test('Caso 3 - sin ramificaciones (entrada vacía) produce un objeto vacío, no un error', () => {
    assert.deepEqual(groupRamificationsByCategory([]), {});
  });

  // Caso 4 - actividad con productos
  test('Caso 4 - actividad con productos: cultivo-soja expone products con ids reales', async () => {
    const res = await fetch(`${baseUrl}/profile/ramifications/cultivo-soja`);
    const body = await res.json();
    assert.ok(Array.isArray(body.ramifications.products));
    const ids = body.ramifications.products.map((n) => n.id);
    assert.ok(ids.includes('soja'), 'soja debe ser un producto real de cultivo-soja');
    for (const node of body.ramifications.products) {
      assert.equal(node.category, 'products');
      assert.ok(node.id && node.name);
    }
  });

  // Caso 5 - actividad con inputs
  test('Caso 5 - actividad con inputs: cultivo-soja expone inputs con ids reales', async () => {
    const res = await fetch(`${baseUrl}/profile/ramifications/cultivo-soja`);
    const body = await res.json();
    assert.ok(Array.isArray(body.ramifications.inputs));
    const ids = body.ramifications.inputs.map((n) => n.id);
    assert.ok(ids.includes('semillas'));
    assert.ok(ids.includes('fertilizantes'));
  });

  // Caso 6 - preservación de las categorías reales (ni inventa ni transforma)
  test('Caso 6 - coherencia: agrupa exactamente los nodos de knowledge.effectiveRamifications(), sin alterarlos', async () => {
    const res = await fetch(`${baseUrl}/profile/ramifications/cultivo-soja`);
    const body = await res.json();
    const expected = getActivityRamifications('cultivo-soja');
    assert.deepEqual(body, expected);

    // cada clave de nivel superior debe ser una `category` real presente en
    // los nodos crudos devueltos por el loader - nunca un nombre inventado.
    const rawNodes = knowledge.effectiveRamifications('cultivo-soja');
    const realCategories = new Set(rawNodes.map((n) => n.category));
    for (const key of Object.keys(body.ramifications)) {
      assert.ok(realCategories.has(key), `'${key}' no es una category real de knowledge.effectiveRamifications('cultivo-soja')`);
    }
    // cada nodo agrupado debe ser el mismo objeto (misma cantidad total, sin perdidas ni duplicados)
    const totalGrouped = Object.values(body.ramifications).reduce((sum, arr) => sum + arr.length, 0);
    assert.equal(totalGrouped, rawNodes.length);
  });

  // Caso 6b - actividad NO usa activities.json.products/.inputs como fuente
  test('Caso 6b - no usa activities.json.products/.inputs como fuente alternativa', async () => {
    const res = await fetch(`${baseUrl}/profile/ramifications/ganaderia-bovina-carne`);
    const body = await res.json();
    const activityJsonProducts = knowledge.activityById('ganaderia-bovina-carne').products; // ['carne-bovina','ganado-en-pie','cueros']
    const effectiveProductIds = (body.ramifications.products ?? []).map((n) => n.id);
    // la fuente correcta es mas rica/estructurada que el resumen editorial de
    // activities.json - no deben ser identicas listas planas de strings
    assert.notDeepEqual(effectiveProductIds, activityJsonProducts);
  });

  // Caso 7/8 - sin llamadas externas, sin IA (verificación estructural del
  // módulo, mismo patrón que reports.test.js Caso 25)
  test('Caso 7/8 - core/profile/ramifications.js no importa fetch/services/ai/services/search', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'core', 'profile', 'ramifications.js'), 'utf-8');
    assert.ok(!src.includes('services/ai'));
    assert.ok(!src.includes('services/search'));
    assert.ok(!/\bfetch\s*\(/.test(src));
    assert.match(src, /from '\.\.\/\.\.\/knowledge\/loader\.js'/, 'unica fuente debe ser knowledge/loader.js');
  });

  // Caso 9 - sin modificación de knowledge (solo lectura, ninguna escritura a disco)
  test('Caso 9 - core/profile/ramifications.js no escribe archivos (solo lectura de knowledge/)', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'core', 'profile', 'ramifications.js'), 'utf-8');
    assert.ok(!/writeFileSync|writeFile\s*\(/.test(src));
  });

  test('errores lanzados son instancia de ActivityNotFoundError (para el manejo homogéneo del router)', () => {
    assert.throws(() => getActivityRamifications('no-existe-xyz'), ActivityNotFoundError);
  });
});
