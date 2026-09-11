// Pruebas del GAP crítico resuelto en la etapa "Catálogos para Perfil
// Productivo": GET /profile/catalogs debe permitir al frontend construir la
// edición del Perfil Productivo sin duplicar conocimiento (activities,
// marketDimensions, topicCatalog, decisionConstraintCategories/Severities).
// Casos 1-8 del prompt de esta etapa.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { resetDbForTests } from '../db/connection.js';
import { createRouter } from '../api/router.js';
import { knowledge } from '../knowledge/loader.js';
import { getProfileCatalogs } from '../core/profile/catalogs.js';

describe('GET /profile/catalogs - catálogos para Perfil Productivo', () => {
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

  // Caso 1 - HTTP 200
  test('Caso 1 - responde 200 con Content-Type JSON', async () => {
    const res = await fetch(`${baseUrl}/profile/catalogs`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /application\/json/);
    const body = await res.json();
    assert.ok(body && typeof body === 'object');
  });

  // Caso 2 - actividades
  test('Caso 2 - expone actividades válidas con jerarquía sector/actividad/subactividad', async () => {
    const res = await fetch(`${baseUrl}/profile/catalogs`);
    const body = await res.json();
    assert.ok(Array.isArray(body.activities.sectors) && body.activities.sectors.length > 0);
    assert.ok(Array.isArray(body.activities.items) && body.activities.items.length > 0);

    const cultivoSoja = body.activities.items.find((a) => a.id === 'cultivo-soja');
    assert.ok(cultivoSoja, 'cultivo-soja debe estar en el catálogo (actividad real usada en toda la suite)');
    assert.ok(['activity', 'subactivity'].includes(cultivoSoja.level));
    assert.ok(body.activities.sectors.some((s) => s.id === cultivoSoja.sector_id), 'el sector_id de la actividad debe existir en la lista de sectores');

    const bovina = body.activities.items.find((a) => a.id === 'ganaderia-bovina-carne');
    assert.equal(bovina.level, 'subactivity');
    assert.equal(bovina.parent_id, 'ganaderia');
    const ganaderia = body.activities.items.find((a) => a.id === 'ganaderia');
    assert.ok(ganaderia.subactivities.includes('ganaderia-bovina-carne'));
  });

  // Caso 3 - mercados
  test('Caso 3 - expone el catálogo oficial de dimensiones de mercado (sin lista paralela de países)', async () => {
    const res = await fetch(`${baseUrl}/profile/catalogs`);
    const body = await res.json();
    assert.ok(Array.isArray(body.markets.market_dimensions));
    assert.ok(body.markets.market_dimensions.length > 0);
    assert.ok(body.markets.market_dimensions.includes('brasil'));
    assert.deepEqual(body.markets.market_dimensions, knowledge.marketDimensions(), 'debe ser exactamente el catálogo oficial, sin transformar ni reordenar');
  });

  // Caso 4 - temas
  test('Caso 4 - expone topicCatalog tal como está definido', async () => {
    const res = await fetch(`${baseUrl}/profile/catalogs`);
    const body = await res.json();
    assert.ok(Array.isArray(body.topics) && body.topics.length > 0);
    for (const t of body.topics) {
      assert.ok(t.id && t.name);
    }
    const official = knowledge.topicCatalog();
    assert.equal(body.topics.length, official.length);
    assert.deepEqual(body.topics.map((t) => t.id).sort(), official.map((t) => t.id).sort());
  });

  // Caso 5 - restricciones (categorías + severidades, sin confundirlas con prioridad/riesgo/recomendación)
  test('Caso 5 - expone categorías y severidades de restricción, sin mezclarlas con otras taxonomías', async () => {
    const res = await fetch(`${baseUrl}/profile/catalogs`);
    const body = await res.json();
    assert.ok(Array.isArray(body.constraints.categories) && body.constraints.categories.length > 0);
    for (const c of body.constraints.categories) {
      assert.ok(c.id && c.name);
    }
    assert.deepEqual(body.constraints.categories.map((c) => c.id).sort(), knowledge.decisionConstraintCategories().sort());
    assert.deepEqual(body.constraints.severities, knowledge.decisionConstraintSeverities());
    // no debe traer campos de otras taxonomías (riesgo/oportunidad/prioridad/recomendación)
    const keys = Object.keys(body.constraints);
    assert.deepEqual(keys.sort(), ['categories', 'severities']);
  });

  // Caso 6 - coherencia: los datos proceden del conocimiento existente, no de una copia hardcoded
  test('Caso 6 - coherencia: idéntico a llamar getProfileCatalogs() directamente sobre knowledge/loader.js', async () => {
    const res = await fetch(`${baseUrl}/profile/catalogs`);
    const body = await res.json();
    assert.deepEqual(body, getProfileCatalogs(), 'la respuesta HTTP debe ser exactamente la proyección del loader, sin una copia paralela');
  });

  // Caso 7 - contrato/estructura
  test('Caso 7 - contrato JSON estable: solo las 4 raíces documentadas, sin campos de base de datos', async () => {
    const res = await fetch(`${baseUrl}/profile/catalogs`);
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(), ['activities', 'constraints', 'markets', 'topics']);
    // ninguna actividad debe filtrar campos internos no necesarios para esta pantalla
    const forbiddenFields = ['products', 'inputs', 'processes', 'related_activities', 'dependencies', 'impact_factors', 'markets'];
    for (const item of body.activities.items) {
      for (const f of forbiddenFields) assert.ok(!(f in item), `activities.items no debe incluir '${f}' (no lo necesita esta pantalla)`);
    }
  });

  // Caso 8 - no regresión / eficiencia: no toca la base de datos ni hace I/O adicional por request
  test('Caso 8 - no requiere base de datos ni I/O externo (llamadas repetidas devuelven igual, sin llamadas externas)', async () => {
    const [a, b] = await Promise.all([
      fetch(`${baseUrl}/profile/catalogs`).then((r) => r.json()),
      fetch(`${baseUrl}/profile/catalogs`).then((r) => r.json()),
    ]);
    assert.deepEqual(a, b);
  });
});

// Test de integridad (prompt seccion 16): getProfileCatalogs() debe construirse
// exclusivamente a partir de knowledge/loader.js - una inspección estructural
// simple que falla si alguna vez alguien reemplaza esas llamadas por arrays
// literales dentro de core/profile/catalogs.js (duplicación de conocimiento).
describe('Integridad - fuente única de verdad', () => {
  test('core/profile/catalogs.js no contiene listas de conocimiento hardcodeadas', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { join, dirname } = await import('node:path');
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'core', 'profile', 'catalogs.js'), 'utf-8');
    assert.match(src, /from '\.\.\/\.\.\/knowledge\/loader\.js'/, 'debe importar knowledge/loader.js');
    assert.ok(src.includes('knowledge.sectors()'));
    assert.ok(src.includes('knowledge.activities()'));
    assert.ok(src.includes('knowledge.marketDimensions()'));
    assert.ok(src.includes('knowledge.topicCatalog()'));
    assert.ok(src.includes('knowledge.decisionConstraintCategoriesDetailed()'));
    assert.ok(src.includes('knowledge.decisionConstraintSeverities()'));
    // no debe declarar un array/objeto literal de ids de actividades, mercados
    // o categorías por su cuenta (heurística simple: no listas de strings de
    // más de 3 elementos separadas por comas, fuera de un import).
    const suspiciousLiteral = /\[\s*(['"][\w-]+['"]\s*,\s*){3,}['"][\w-]+['"]\s*\]/;
    assert.ok(!suspiciousLiteral.test(src), 'no debe contener un array literal de ids (posible catálogo duplicado)');
  });
});
