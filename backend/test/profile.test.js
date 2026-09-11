// Pruebas de perfil productivo y personalizacion (prompt de perfil
// productivo, seccion 30, casos 1-14). Reusa el motor central ya probado en
// test/pipeline.test.js - aqui solo se prueba la capa de personalizacion.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetDbForTests } from '../db/connection.js';
import { runPipeline } from '../pipeline/orchestrator.js';
import { knowledge } from '../knowledge/loader.js';
import { createProfile, setActivities, setMarkets, setPriorities, ValidationError } from '../core/profile/store.js';
import { getChanges, getPersonalizedRelevance } from '../core/profile/personalize.js';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FX = (name) => join(__dirname, '..', 'fixtures', name);

async function runSojaT1T2(db) {
  await runPipeline(db, [{ monitorId: 'fao-giews-amis::principal', fixturePath: FX('soja-precio.t1.json'), context: { originActivityId: 'cultivo-soja', originRamificationId: 'soja', indicator: 'precio-soja-fao-amis', topicId: 'precios', kind: 'indicator' } }]);
  return runPipeline(db, [{ monitorId: 'fao-giews-amis::principal', fixturePath: FX('soja-precio.t2.json'), context: { originActivityId: 'cultivo-soja', originRamificationId: 'soja', indicator: 'precio-soja-fao-amis', topicId: 'precios', kind: 'indicator' } }]);
}

describe('Perfil productivo y personalizacion', () => {
  let db;
  beforeEach(() => {
    db = resetDbForTests(':memory:');
  });

  test('Caso 1 - perfil simple: señal irrelevante no aparece', async () => {
    await runSojaT1T2(db);
    const profile = createProfile(db, { name: 'Perfil software', main_activity_id: 'software-ti' });
    const changes = getChanges(db, profile.id);
    assert.equal(changes.no_relevant_changes, true);
    assert.deepEqual(changes.changes, []);
  });

  test('Caso 2 - actividad principal directamente relacionada aparece', async () => {
    await runSojaT1T2(db);
    const profile = createProfile(db, { name: 'Productor de soja', main_activity_id: 'cultivo-soja' });
    const changes = getChanges(db, profile.id);
    assert.equal(changes.no_relevant_changes, false);
    const item = changes.changes.find((c) => c.activity_id === 'cultivo-soja');
    assert.ok(item);
    assert.equal(item.is_primary_activity, true);
    const rec = item.intelligence[0].decisions[0].recommendation;
    assert.equal(rec.type, 'pursue_opportunity');
  });

  test('Caso 3 - actividad secundaria puede tener mayor relevancia que la principal', async () => {
    await runSojaT1T2(db);
    const profile = createProfile(db, { name: 'Ganadero con soja', main_activity_id: 'ganaderia-bovina-carne' });
    setActivities(db, profile.id, { main_activity_id: 'ganaderia-bovina-carne', secondary_activity_ids: ['elaboracion-aceites'] });
    const changes = getChanges(db, profile.id);
    const LEVELS = ['none', 'low', 'medium', 'high', 'critical'];
    const main = changes.changes.find((c) => c.activity_id === 'ganaderia-bovina-carne');
    const secondary = changes.changes.find((c) => c.activity_id === 'elaboracion-aceites');
    assert.ok(main && secondary);
    assert.equal(main.is_primary_activity, true);
    assert.equal(secondary.is_primary_activity, false);
    assert.ok(
      LEVELS.indexOf(secondary.personalized_relevance.level) > LEVELS.indexOf(main.personalized_relevance.level),
      `secundaria (${secondary.personalized_relevance.level}) debe superar a la principal (${main.personalized_relevance.level})`
    );
  });

  test('Caso 4/6-multiactividad/13 - multiactividad sin duplicar la señal central', async () => {
    await runSojaT1T2(db);
    const profile = createProfile(db, { name: 'Perfil agroindustrial', main_activity_id: 'cultivo-soja' });
    setActivities(db, profile.id, { main_activity_id: 'cultivo-soja', secondary_activity_ids: ['ganaderia-bovina-carne', 'elaboracion-aceites'] });
    const changes = getChanges(db, profile.id);
    assert.equal(changes.changes.length, 3, 'debe haber 3 resultados de personalizacion, uno por actividad del perfil');
    const types = Object.fromEntries(changes.changes.map((c) => [c.activity_id, c.intelligence[0]?.type]));
    assert.equal(types['cultivo-soja'], 'opportunity');
    assert.equal(types['elaboracion-aceites'], 'risk');
    assert.notEqual(types['ganaderia-bovina-carne'], 'risk');
    assert.notEqual(types['ganaderia-bovina-carne'], 'opportunity');

    const totalSignals = db.prepare('SELECT COUNT(*) AS n FROM signals').get().n;
    assert.equal(totalSignals, 1, 'una sola señal central, sin importar cuántas actividades del perfil la consuman');
  });

  test('Caso 5 - ubicación es contexto, no altera todavía la relevancia (gap documentado)', async () => {
    await runSojaT1T2(db);
    const withLocation = createProfile(db, { name: 'Con ubicación', main_activity_id: 'cultivo-soja', location: 'Soriano' });
    const withoutLocation = createProfile(db, { name: 'Sin ubicación', main_activity_id: 'cultivo-soja' });
    const c1 = getChanges(db, withLocation.id).changes.find((c) => c.activity_id === 'cultivo-soja');
    const c2 = getChanges(db, withoutLocation.id).changes.find((c) => c.activity_id === 'cultivo-soja');
    assert.equal(withLocation.location, 'Soriano');
    assert.equal(c1.personalized_relevance.level, c2.personalized_relevance.level, 'sin datos geograficos reales en knowledge/, la ubicación no debe inventar una relevancia distinta');
  });

  test('Caso 6 - mercado declarado coincide con la fuente -> escala relevancia (función pura, fuente real INAC)', () => {
    const profile = createProfile(db, { name: 'Exportador a China', main_activity_id: 'ganaderia-bovina-carne' });
    setMarkets(db, profile.id, ['china']);
    // Inserta una señal/relevance_result sintética asociada a INAC (fuente real con markets=[china,...]) sin correr el pipeline completo.
    db.prepare("INSERT INTO pipeline_runs (id, mode, started_at, status) VALUES ('r1','fixture', datetime('now'), 'completed')").run();
    db.prepare("INSERT INTO captures (id, run_id, source_id, monitor_id, captured_at, status) VALUES ('cap1','r1','inac','inac::faena-y-precios', datetime('now'), 'fixture')").run();
    db.prepare("INSERT INTO changes (id, run_id, capture_id, monitor_id, change_class, detected_at) VALUES ('c1','r1','cap1','inac::faena-y-precios','valor_modificado', datetime('now'))").run();
    db.prepare(
      "INSERT INTO signals (id, run_id, change_id, signal_type, topic_id, direction, origin_activity_id, origin_ramification_id, source_id, monitor_id, detected_at, dedup_key, status) VALUES ('s1','r1','c1','cambio-significativo','precios','increase','ganaderia-bovina-carne', NULL, 'inac', 'inac::faena-y-precios', datetime('now'), 'dedup1', 'active')"
    ).run();
    db.prepare(
      "INSERT INTO relevance_results (id, run_id, signal_id, activity_id, relevance_level, factor, reason, evidence, is_primary_activity) VALUES ('rel1','r1','s1','ganaderia-bovina-carne','medium','direct_dependency','prueba', '[]', 0)"
    ).run();
    const rel = getPersonalizedRelevance(db, profile.id).results.find((r) => r.activity_id === 'ganaderia-bovina-carne');
    assert.equal(rel.base_level, 'medium');
    assert.equal(rel.level, 'high', 'china coincide con sources.json[inac].markets -> debe escalar un nivel');
    assert.ok(rel.bumps.some((b) => b.rule === 'market_match'));
  });

  test('Caso 6b - mercado sin coincidencia no escala relevancia artificialmente', () => {
    const profile = createProfile(db, { name: 'Exportador a un mercado no cubierto', main_activity_id: 'ganaderia-bovina-carne' });
    setMarkets(db, profile.id, ['reino-unido']); // INAC no cubre reino-unido (markets=[china,union-europea,estados-unidos,mercosur])
    db.prepare("INSERT INTO pipeline_runs (id, mode, started_at, status) VALUES ('r1','fixture', datetime('now'), 'completed')").run();
    db.prepare("INSERT INTO captures (id, run_id, source_id, monitor_id, captured_at, status) VALUES ('cap1','r1','inac','inac::faena-y-precios', datetime('now'), 'fixture')").run();
    db.prepare("INSERT INTO changes (id, run_id, capture_id, monitor_id, change_class, detected_at) VALUES ('c1','r1','cap1','inac::faena-y-precios','valor_modificado', datetime('now'))").run();
    db.prepare(
      "INSERT INTO signals (id, run_id, change_id, signal_type, topic_id, direction, origin_activity_id, origin_ramification_id, source_id, monitor_id, detected_at, dedup_key, status) VALUES ('s1','r1','c1','cambio-significativo','precios','increase','ganaderia-bovina-carne', NULL, 'inac', 'inac::faena-y-precios', datetime('now'), 'dedup1', 'active')"
    ).run();
    db.prepare(
      "INSERT INTO relevance_results (id, run_id, signal_id, activity_id, relevance_level, factor, reason, evidence, is_primary_activity) VALUES ('rel1','r1','s1','ganaderia-bovina-carne','medium','direct_dependency','prueba', '[]', 0)"
    ).run();
    const rel = getPersonalizedRelevance(db, profile.id).results.find((r) => r.activity_id === 'ganaderia-bovina-carne');
    assert.equal(rel.level, 'medium', 'sin coincidencia real de mercado no debe escalar');
    assert.equal(rel.bumps.length, 0);
  });

  test('Caso 7 - una prioridad declarada no convierte evidencia débil en fuerte', async () => {
    await runSojaT1T2(db);
    const profile = createProfile(db, { name: 'Prioriza precios', main_activity_id: 'ganaderia-bovina-carne' });
    setPriorities(db, profile.id, [{ topic_id: 'precios', rank: 1 }]);
    const changes = getChanges(db, profile.id, { includeNoneLevel: false });
    // ganaderia-bovina-carne tiene relevancia 'low'/uncertain frente a esta señal - la prioridad NO debe subirla.
    const item = changes.changes.find((c) => c.activity_id === 'ganaderia-bovina-carne');
    if (item) {
      assert.notEqual(item.personalized_relevance.level, 'critical');
      assert.notEqual(item.personalized_relevance.level, 'high');
      assert.equal(item.personalized_relevance.bumps.length, 0, 'priority_match no debe generar un bump de relevancia');
    }
  });

  test('Caso 8 - evidencia contradictoria permanece contradictoria en la vista personalizada', async () => {
    await runPipeline(db, [{ monitorId: 'fao-giews-amis::principal', fixturePath: FX('soja-precio.t1.json'), context: { originActivityId: 'cultivo-soja', originRamificationId: 'soja', indicator: 'precio-soja-fao-amis', kind: 'indicator' } }]);
    await runPipeline(db, [{ monitorId: 'fao-giews-amis::principal', fixturePath: FX('soja-precio.t2.json'), context: { originActivityId: 'cultivo-soja', originRamificationId: 'soja', indicator: 'precio-soja-fao-amis', kind: 'indicator', conflicting: true } }]);
    const profile = createProfile(db, { name: 'Perfil soja', main_activity_id: 'cultivo-soja' });
    const changes = getChanges(db, profile.id);
    const item = changes.changes.find((c) => c.activity_id === 'cultivo-soja');
    const rec = item.intelligence[0].decisions[0].recommendation;
    assert.equal(rec.strength, 'none');
    assert.equal(rec.statement, 'No existe evidencia suficiente para recomendar una acción.');
  });

  test('Caso 9 - relevancia y confianza permanecen dimensiones separadas', async () => {
    await runSojaT1T2(db);
    const profile = createProfile(db, { name: 'Perfil aceitero', main_activity_id: 'elaboracion-aceites' });
    const changes = getChanges(db, profile.id);
    const item = changes.changes.find((c) => c.activity_id === 'elaboracion-aceites');
    const intel = item.intelligence[0];
    assert.ok(item.personalized_relevance.level, 'relevance existe');
    assert.ok(intel.confidence.analysis_confidence, 'confidence existe como campo separado');
    assert.notEqual(Object.keys(intel.confidence).length, 0);
    // no son el mismo campo ni se derivan uno del otro automáticamente
    assert.notEqual(item.personalized_relevance.level, intel.confidence.analysis_confidence);
  });

  test('Caso 10/21 - recomendación superseded no se presenta como vigente, pero el histórico se conserva', async () => {
    await runPipeline(db, [{ monitorId: 'fao-giews-amis::principal', fixturePath: FX('soja-precio.t1.json'), context: { originActivityId: 'cultivo-soja', originRamificationId: 'soja', indicator: 'precio-soja-fao-amis', kind: 'indicator' } }]);
    await runPipeline(db, [{ monitorId: 'fao-giews-amis::principal', fixturePath: FX('soja-precio.t2.json'), context: { originActivityId: 'cultivo-soja', originRamificationId: 'soja', indicator: 'precio-soja-fao-amis', kind: 'indicator' } }]);
    await runPipeline(db, [{ monitorId: 'fao-giews-amis::principal', fixturePath: FX('soja-precio.t3.json'), context: { originActivityId: 'cultivo-soja', originRamificationId: 'soja', indicator: 'precio-soja-fao-amis', kind: 'indicator' } }]);
    const profile = createProfile(db, { name: 'Perfil soja histórico', main_activity_id: 'cultivo-soja' });
    const changes = getChanges(db, profile.id);
    const item = changes.changes.find((c) => c.activity_id === 'cultivo-soja');
    const decision = item.intelligence[0].decisions[0];
    assert.equal(decision.recommendation.type, 'mitigate', 'la recomendación vigente es la más reciente (t3)');
    assert.equal(decision.recommendation.status, 'active');
    assert.equal(decision.recommendation_history.length, 1);
    assert.equal(decision.recommendation_history[0].status, 'superseded');
    assert.equal(decision.recommendation_history[0].type, 'pursue_opportunity');
  });

  test('Caso 11 - no_relevant_changes cuando no hay ningún cambio central relacionado', () => {
    const profile = createProfile(db, { name: 'Perfil sin datos', main_activity_id: 'turismo' });
    const changes = getChanges(db, profile.id);
    assert.equal(changes.no_relevant_changes, true);
    assert.ok(changes.reason);
  });

  test('Caso 12 - self-loops siguen bloqueados, la personalización no introduce propagación nueva', () => {
    const graph = knowledge.relevanceMappings();
    for (const id of ['agencias-operadores', 'alojamiento', 'cosecha-forestal']) {
      assert.equal((graph[id] ?? []).find((e) => e.target_activity_id === id), undefined);
    }
  });

  test('Caso 14 - múltiples perfiles distintos sobre la misma inteligencia central, sin duplicar nada', async () => {
    await runSojaT1T2(db);
    const profileA = createProfile(db, { name: 'Perfil A', main_activity_id: 'ganaderia-bovina-carne' });
    setActivities(db, profileA.id, { main_activity_id: 'ganaderia-bovina-carne', secondary_activity_ids: ['cultivo-soja'] });
    const profileB = createProfile(db, { name: 'Perfil B', main_activity_id: 'elaboracion-aceites' });

    const changesA = getChanges(db, profileA.id);
    const changesB = getChanges(db, profileB.id);

    assert.notDeepEqual(
      changesA.changes.map((c) => c.activity_id).sort(),
      changesB.changes.map((c) => c.activity_id).sort()
    );
    const recA = changesA.changes.find((c) => c.activity_id === 'cultivo-soja').intelligence[0].decisions[0].recommendation.type;
    const recB = changesB.changes.find((c) => c.activity_id === 'elaboracion-aceites').intelligence[0].decisions[0].recommendation.type;
    assert.equal(recA, 'pursue_opportunity');
    assert.equal(recB, 'mitigate');

    const totalCaptures = db.prepare('SELECT COUNT(*) AS n FROM captures').get().n;
    const totalSignals = db.prepare('SELECT COUNT(*) AS n FROM signals').get().n;
    const totalIntelligence = db.prepare('SELECT COUNT(*) AS n FROM intelligence').get().n;
    assert.equal(totalCaptures, 2, '2 capturas (t1 baseline + t2), independientemente de cuántos perfiles consulten');
    assert.equal(totalSignals, 1);
    assert.equal(totalIntelligence, 16, 'una unidad de inteligencia por actividad relacionada, no por perfil');
  });

  test('Validación - no acepta un activity_id inexistente (sin taxonomía paralela)', () => {
    assert.throws(() => createProfile(db, { name: 'x', main_activity_id: 'actividad-inventada' }), ValidationError);
  });
});
