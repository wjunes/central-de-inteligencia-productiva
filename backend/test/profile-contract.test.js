// Paso 2B-0: congela por test el contrato REAL de escritura de Perfil
// Productivo (auditoría, no rediseño - ver docs/arquitectura/contrato-perfil.md).
// Cada aserción de este archivo fue verificada por ejecución directa antes de
// escribirse (no se asume comportamiento). Donde el comportamiento actual es
// una inconsistencia real, el test la deja explícita y documentada como
// "GAP DE CONTRATO" en vez de forzar el resultado "correcto" que no existe
// hoy - el objetivo de esta etapa es documentar la realidad, no corregirla.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { resetDbForTests } from '../db/connection.js';
import { createRouter } from '../api/router.js';

describe('Contrato de Perfil Productivo (congelado)', () => {
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

  async function post(path, body) {
    const res = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  }
  async function put(path, body) {
    const res = await fetch(`${baseUrl}${path}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  }
  async function get(path) {
    const res = await fetch(`${baseUrl}${path}`);
    return { status: res.status, body: await res.json() };
  }

  // 1. Crear perfil
  test('1 - POST /profiles crea con 201, solo name obligatorio', async () => {
    const { status, body } = await post('/profiles', { name: 'Perfil de contrato' });
    assert.equal(status, 201);
    assert.equal(body.name, 'Perfil de contrato');
    assert.equal(body.role, null);
    assert.equal(body.main_activity_id, null);
    assert.deepEqual(body.activities, []);
    assert.deepEqual(body.markets, []);
  });

  test('1b - POST /profiles sin name -> 400 validation_error (no crea nada)', async () => {
    const { status, body } = await post('/profiles', {});
    assert.equal(status, 400);
    assert.equal(body.error, 'validation_error');
    assert.match(body.message, /name es obligatorio/);
  });

  // 2. Obtener perfil
  test('2 - GET /profiles/:id devuelve el objeto anidado completo; inexistente -> 404 sin message', async () => {
    const created = (await post('/profiles', { name: 'X' })).body;
    const { status, body } = await get(`/profiles/${created.id}`);
    assert.equal(status, 200);
    assert.equal(body.id, created.id);
    assert.ok(['activities', 'markets', 'products', 'inputs', 'priorities', 'constraints'].every((k) => k in body));

    const notFound = await get('/profiles/00000000-0000-0000-0000-000000000000');
    assert.equal(notFound.status, 404);
    assert.deepEqual(notFound.body, { error: 'profile_not_found' }); // sin campo "message" - distinto del resto de errores
  });

  test('2b - GET /profiles (listado) devuelve filas PLANAS, sin activities/markets/... anidados (distinto de GET /profiles/:id)', async () => {
    await post('/profiles', { name: 'Y' });
    const { status, body } = await get('/profiles');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.profiles));
    assert.ok(!('activities' in body.profiles[0]), 'el listado NO trae las colecciones anidadas - solo GET /profiles/:id las trae');
  });

  // 3. Actualizar perfil base: omitido != null
  test('3 - PUT /profiles/:id: un campo OMITIDO conserva su valor anterior', async () => {
    const created = (await post('/profiles', { name: 'Con rol', role: 'productor' })).body;
    const { status, body } = await put(`/profiles/${created.id}`, { name: 'Con rol (renombrado)' }); // role omitido
    assert.equal(status, 200);
    assert.equal(body.name, 'Con rol (renombrado)');
    assert.equal(body.role, 'productor', 'un campo omitido en el patch NO se borra - se conserva (merge sobre el existente)');
  });

  test('3b - PUT /profiles/:id: un campo explícito null SÍ lo borra (omitido ≠ null)', async () => {
    const created = (await post('/profiles', { name: 'Con rol', role: 'productor' })).body;
    const { body } = await put(`/profiles/${created.id}`, { name: 'Con rol', role: null });
    assert.equal(body.role, null, 'a diferencia de un campo omitido, null explícito sí sobrescribe a null');
  });

  test('3c [GAP DE CONTRATO] - PUT /profiles/:id con main_activity_id:null NO limpia profile_activities (inconsistencia real, documentada, no corregida en esta etapa)', async () => {
    const created = (await post('/profiles', { name: 'Con principal', main_activity_id: 'cultivo-soja' })).body;
    const { body } = await put(`/profiles/${created.id}`, { main_activity_id: null });
    assert.equal(body.main_activity_id, null, 'profiles.main_activity_id sí queda en null');
    assert.deepEqual(body.activities, [{ activity_id: 'cultivo-soja', kind: 'main' }], 'GAP: profile_activities conserva la fila kind=main anterior - queda desincronizado del campo profiles.main_activity_id');
  });

  // 4. Reemplazar activities
  test('4 - PUT /profiles/:id/activities reemplaza el conjunto completo (nunca acumula)', async () => {
    const created = (await post('/profiles', { name: 'Multiactividad' })).body;
    await put(`/profiles/${created.id}/activities`, { main_activity_id: 'cultivo-soja', secondary_activity_ids: ['ganaderia'] });
    const { body } = await put(`/profiles/${created.id}/activities`, { main_activity_id: 'ganaderia', secondary_activity_ids: [] });
    assert.deepEqual(body.activities, [{ activity_id: 'ganaderia', kind: 'main' }], 'la segunda llamada reemplazó completamente - cultivo-soja ya no aparece');
  });

  test('4b - la actividad principal nunca queda duplicada también como secundaria (el backend la descarta en silencio)', async () => {
    const created = (await post('/profiles', { name: 'Sin duplicado' })).body;
    const { status, body } = await put(`/profiles/${created.id}/activities`, { main_activity_id: 'cultivo-soja', secondary_activity_ids: ['cultivo-soja', 'ganaderia'] });
    assert.equal(status, 200);
    assert.deepEqual(body.activities, [
      { activity_id: 'cultivo-soja', kind: 'main' },
      { activity_id: 'ganaderia', kind: 'secondary' },
    ]);
  });

  test('4c [GAP DE CONTRATO] - PUT .../activities con main_activity_id:null limpia profile_activities pero deja profiles.main_activity_id desactualizado', async () => {
    const created = (await post('/profiles', { name: 'X', main_activity_id: 'cultivo-soja' })).body;
    const { body } = await put(`/profiles/${created.id}/activities`, { main_activity_id: null, secondary_activity_ids: ['ganaderia'] });
    assert.deepEqual(body.activities, [{ activity_id: 'ganaderia', kind: 'secondary' }], 'profile_activities queda correcto (sin fila kind=main)');
    assert.equal(body.main_activity_id, 'cultivo-soja', 'GAP: profiles.main_activity_id NO se limpia en este camino - queda con el valor anterior, inverso al GAP 3c');
  });

  test('4d - actividad inexistente -> 400 validation_error, no modifica nada', async () => {
    const created = (await post('/profiles', { name: 'X' })).body;
    const { status, body } = await put(`/profiles/${created.id}/activities`, { main_activity_id: 'no-existe-xyz', secondary_activity_ids: [] });
    assert.equal(status, 400);
    assert.equal(body.error, 'validation_error');
    const reloaded = await get(`/profiles/${created.id}`);
    assert.deepEqual(reloaded.body.activities, []);
  });

  // 5. Mercados
  test('5 - PUT .../markets reemplaza completo; [] elimina todas las relaciones', async () => {
    const created = (await post('/profiles', { name: 'X' })).body;
    await put(`/profiles/${created.id}/markets`, { market_ids: ['brasil', 'china'] });
    const replaced = await put(`/profiles/${created.id}/markets`, { market_ids: ['brasil'] });
    assert.deepEqual(replaced.body.markets, ['brasil'], 'china ya no está - reemplazo completo, no una fusión');
    const emptied = await put(`/profiles/${created.id}/markets`, { market_ids: [] });
    assert.deepEqual(emptied.body.markets, [], '[] significa inequívocamente "eliminar todas las relaciones", no "sin cambios"');
  });

  test('5b - mercado inexistente en el catálogo -> 400 validation_error', async () => {
    const created = (await post('/profiles', { name: 'X' })).body;
    const { status, body } = await put(`/profiles/${created.id}/markets`, { market_ids: ['pais-inventado'] });
    assert.equal(status, 400);
    assert.equal(body.error, 'validation_error');
  });

  test('5c [GAP DE CONTRATO] - un id de mercado duplicado en la MISMA solicitud produce un 500 con el mensaje crudo de SQLite (no un 400 validation_error)', async () => {
    const created = (await post('/profiles', { name: 'X' })).body;
    const { status, body } = await put(`/profiles/${created.id}/markets`, { market_ids: ['brasil', 'brasil'] });
    assert.equal(status, 500, 'GAP: no hay deduplicación ni validación de duplicados - el UNIQUE constraint de SQLite se propaga como error interno');
    assert.equal(body.error, 'internal_error');
    assert.match(body.message, /UNIQUE constraint failed/, 'GAP: el mensaje crudo de SQLite llega tal cual al cliente, no un mensaje de validación humano');
  });

  // 6/7. Productos e inputs
  test('6 - PUT .../products reemplaza completo, valida (activity_id,ramification_id) contra effectiveRamifications real', async () => {
    const created = (await post('/profiles', { name: 'X' })).body;
    const { status, body } = await put(`/profiles/${created.id}/products`, { products: [{ activity_id: 'cultivo-soja', ramification_id: 'soja' }] });
    assert.equal(status, 200);
    assert.deepEqual(body.products, [{ activity_id: 'cultivo-soja', ramification_id: 'soja' }]);
    const replaced = await put(`/profiles/${created.id}/products`, { products: [] });
    assert.deepEqual(replaced.body.products, []);
  });

  test('6b - ramification_id inexistente para esa actividad -> 400 validation_error', async () => {
    const created = (await post('/profiles', { name: 'X' })).body;
    const { status, body } = await put(`/profiles/${created.id}/products`, { products: [{ activity_id: 'cultivo-soja', ramification_id: 'no-existe' }] });
    assert.equal(status, 400);
    assert.equal(body.error, 'validation_error');
  });

  test('7 - PUT .../inputs reemplaza completo de forma independiente de products (misma actividad, dos colecciones separadas)', async () => {
    const created = (await post('/profiles', { name: 'X' })).body;
    await put(`/profiles/${created.id}/products`, { products: [{ activity_id: 'cultivo-soja', ramification_id: 'soja' }] });
    const { body } = await put(`/profiles/${created.id}/inputs`, { inputs: [{ activity_id: 'cultivo-soja', ramification_id: 'semillas' }] });
    assert.deepEqual(body.products, [{ activity_id: 'cultivo-soja', ramification_id: 'soja' }], 'actualizar inputs no toca products');
    assert.deepEqual(body.inputs, [{ activity_id: 'cultivo-soja', ramification_id: 'semillas' }]);
  });

  test('7b [observación de contrato] - .../inputs NO restringe la categoría del nodo: acepta un ramification_id de categoría "products" como input', async () => {
    const created = (await post('/profiles', { name: 'X' })).body;
    const { status, body } = await put(`/profiles/${created.id}/inputs`, { inputs: [{ activity_id: 'cultivo-soja', ramification_id: 'soja' }] });
    assert.equal(status, 200, '"soja" es category=products en knowledge/ramifications/cultivo-soja.json, pero requireRamification() no filtra por categoría - se acepta igual');
    assert.deepEqual(body.inputs, [{ activity_id: 'cultivo-soja', ramification_id: 'soja' }]);
  });

  // 8. Prioridades
  test('8 - PUT .../priorities: rank es opcional (default = posición en el array); [] limpia', async () => {
    const created = (await post('/profiles', { name: 'X' })).body;
    const { body } = await put(`/profiles/${created.id}/priorities`, { priorities: [{ topic_id: 'demanda' }, { topic_id: 'precios' }] });
    assert.deepEqual(body.priorities, [{ topic_id: 'demanda', rank: 1 }, { topic_id: 'precios', rank: 2 }], 'sin rank explícito, se asigna por posición (índice+1)');
    const emptied = await put(`/profiles/${created.id}/priorities`, { priorities: [] });
    assert.deepEqual(emptied.body.priorities, []);
  });

  test('8b [observación de contrato] - rank explícito no se valida como secuencial ni único entre sí (el backend no lo corrige)', async () => {
    const created = (await post('/profiles', { name: 'X' })).body;
    const { body } = await put(`/profiles/${created.id}/priorities`, { priorities: [{ topic_id: 'demanda', rank: 5 }, { topic_id: 'precios', rank: 5 }] });
    assert.deepEqual(body.priorities.map((p) => p.rank).sort(), [5, 5], 'dos temas distintos pueden terminar con el mismo rank=5 - no hay validación de unicidad de rank');
  });

  test('8c - topic_id inexistente -> 400 validation_error', async () => {
    const created = (await post('/profiles', { name: 'X' })).body;
    const { status } = await put(`/profiles/${created.id}/priorities`, { priorities: [{ topic_id: 'tema-inventado' }] });
    assert.equal(status, 400);
  });

  // 9. Restricciones
  test('9 - PUT .../constraints reemplaza completo, category/severity validados contra el catálogo; [] limpia', async () => {
    const created = (await post('/profiles', { name: 'X' })).body;
    const { body } = await put(`/profiles/${created.id}/constraints`, { constraints: [{ category: 'regulatory', severity: 'soft_constraint', description: 'detalle' }] });
    assert.deepEqual(body.constraints, [{ category: 'regulatory', severity: 'soft_constraint', description: 'detalle' }]);
    const emptied = await put(`/profiles/${created.id}/constraints`, { constraints: [] });
    assert.deepEqual(emptied.body.constraints, []);
  });

  test('9b [observación de contrato] - a diferencia de las otras 5 colecciones, constraints NO tiene UNIQUE: acepta duplicados exactos', async () => {
    const created = (await post('/profiles', { name: 'X' })).body;
    const dup = { category: 'regulatory', severity: 'soft_constraint', description: 'x' };
    const { status, body } = await put(`/profiles/${created.id}/constraints`, { constraints: [dup, dup] });
    assert.equal(status, 200, 'a diferencia de markets/products/inputs/priorities/activities, esto NO produce un 500 - se aceptan 2 filas idénticas');
    assert.equal(body.constraints.length, 2);
  });

  test('9c - categoría/severidad inexistente -> 400 validation_error', async () => {
    const created = (await post('/profiles', { name: 'X' })).body;
    const badCategory = await put(`/profiles/${created.id}/constraints`, { constraints: [{ category: 'categoria-inventada', severity: 'soft_constraint' }] });
    assert.equal(badCategory.status, 400);
    const badSeverity = await put(`/profiles/${created.id}/constraints`, { constraints: [{ category: 'regulatory', severity: 'severidad-inventada' }] });
    assert.equal(badSeverity.status, 400);
  });

  // 12/13. El reemplazo elimina relaciones anteriores y no deja rastros de lo no enviado
  test('12/13 - un reemplazo posterior no deja ninguna relación de la generación anterior (verificado en las 6 colecciones)', async () => {
    const created = (await post('/profiles', { name: 'Reemplazo total' })).body;
    await put(`/profiles/${created.id}/activities`, { main_activity_id: 'cultivo-soja', secondary_activity_ids: ['ganaderia'] });
    await put(`/profiles/${created.id}/markets`, { market_ids: ['brasil', 'china'] });
    await put(`/profiles/${created.id}/products`, { products: [{ activity_id: 'cultivo-soja', ramification_id: 'soja' }] });
    await put(`/profiles/${created.id}/inputs`, { inputs: [{ activity_id: 'cultivo-soja', ramification_id: 'semillas' }] });
    await put(`/profiles/${created.id}/priorities`, { priorities: [{ topic_id: 'demanda' }] });
    await put(`/profiles/${created.id}/constraints`, { constraints: [{ category: 'regulatory', severity: 'soft_constraint' }] });

    // segunda generación completamente distinta
    await put(`/profiles/${created.id}/activities`, { main_activity_id: 'ganaderia', secondary_activity_ids: [] });
    await put(`/profiles/${created.id}/markets`, { market_ids: ['china'] });
    await put(`/profiles/${created.id}/products`, { products: [] });
    await put(`/profiles/${created.id}/inputs`, { inputs: [] });
    await put(`/profiles/${created.id}/priorities`, { priorities: [{ topic_id: 'precios' }] });
    const final = await get(`/profiles/${created.id}`);

    assert.deepEqual(final.body.activities, [{ activity_id: 'ganaderia', kind: 'main' }]);
    assert.deepEqual(final.body.markets, ['china']);
    assert.deepEqual(final.body.products, []);
    assert.deepEqual(final.body.inputs, []);
    assert.deepEqual(final.body.priorities, [{ topic_id: 'precios', rank: 1 }]);
    assert.deepEqual(final.body.constraints, [{ category: 'regulatory', severity: 'soft_constraint', description: null }], 'constraints no se tocó en esta segunda ronda - sigue como quedó, confirma que cada colección es independiente');
  });

  // Transaccionalidad: sin BEGIN/COMMIT explícito, un fallo a mitad del reemplazo deja estado PARCIAL
  test('[GAP DE CONTRATO] transaccionalidad - un fallo a mitad de un reemplazo (ids VÁLIDOS pero duplicados, pasan la validación) deja el conjunto en estado PARCIAL, no revierte al anterior ni completa el nuevo', async () => {
    const created = (await post('/profiles', { name: 'X' })).body;
    await put(`/profiles/${created.id}/markets`, { market_ids: ['brasil', 'china'] });
    // 'reino-unido' es un id VÁLIDO del catálogo (a diferencia de un id inventado,
    // que sería rechazado por requireMarket() ANTES de tocar la base - ver caso
    // 5b). Al repetirse, pasa la validación de existencia (ambas ocurrencias son
    // válidas) y falla recién en el segundo INSERT, a mitad del reemplazo.
    const failing = await put(`/profiles/${created.id}/markets`, { market_ids: ['reino-unido', 'reino-unido'] });
    assert.equal(failing.status, 500);
    const reloaded = await get(`/profiles/${created.id}`);
    assert.deepEqual(reloaded.body.markets, ['reino-unido'], 'GAP: ni quedó ["brasil","china"] (rollback) ni la lista nueva completa - el DELETE ya se ejecutó y solo el primer INSERT del reemplazo sobrevivió antes del fallo');
  });
});
