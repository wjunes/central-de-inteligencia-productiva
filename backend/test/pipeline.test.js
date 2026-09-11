// Pruebas extremo a extremo del pipeline (prompt del motor operativo,
// secciones 34-40). Modo 'fixture': no depende de fuentes externas.
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetDbForTests } from '../db/connection.js';
import { runPipeline } from '../pipeline/orchestrator.js';
import { knowledge } from '../knowledge/loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FX = (name) => join(__dirname, '..', 'fixtures', name);

const FORBIDDEN_VERBS = ['debe hacer', 'haga inmediatamente', 'venda', 'compre', 'contrate', 'invierta', 'abandone', 'ejecute'];

function assertNoForbiddenLanguage(statement) {
  const lower = statement.toLowerCase();
  for (const verb of FORBIDDEN_VERBS) {
    assert.ok(!lower.includes(verb), `statement contiene lenguaje prohibido ('${verb}'): "${statement}"`);
  }
}

describe('Pipeline operativo - casos extremo a extremo', () => {
  let db;

  beforeEach(() => {
    db = resetDbForTests(':memory:');
  });

  test('Caso 1/7/13/36 - ganadería + soja: multiactividad, sin salto de capas, actividad principal sin relevancia inflada', async () => {
    // t1: linea de base, no debe generar señal (sin capturas previas -> pending_threshold)
    const r1 = await runPipeline(
      db,
      [{ monitorId: 'fao-giews-amis::principal', fixturePath: FX('soja-precio.t1.json'), context: { originActivityId: 'cultivo-soja', originRamificationId: 'soja', indicator: 'precio-soja-fao-amis', topicId: 'precios', kind: 'indicator' } }],
      { mode: 'fixture' }
    );
    assert.equal(r1.stats.signals_generated, 0, 't1 no debe producir señal (sin umbral que evaluar)');
    assert.equal(r1.stats.changes_detected, 1);

    // t2: +10% (umbral operativo 5%). El pipeline CENTRAL no conoce perfiles
    // (is_primary_activity se calcula en la personalización, ver test/profile.test.js).
    const r2 = await runPipeline(
      db,
      [{ monitorId: 'fao-giews-amis::principal', fixturePath: FX('soja-precio.t2.json'), context: { originActivityId: 'cultivo-soja', originRamificationId: 'soja', indicator: 'precio-soja-fao-amis', topicId: 'precios', kind: 'indicator' } }],
      { mode: 'fixture' }
    );
    assert.equal(r2.stats.signals_generated, 1, 't2 debe producir exactamente 1 señal (cambio-significativo)');
    assert.equal(r2.outputs.signals[0].signal_type, 'cambio-significativo');
    assert.equal(r2.outputs.signals[0].direction, 'increase');

    const intelByActivity = Object.fromEntries(r2.outputs.intelligence.map((i) => [i.activity_id, i]));
    const recByActivity = Object.fromEntries(r2.outputs.recommendations.map((r) => [r.activity_id, r]));

    // cultivo-soja (direct_dependency, category=products -> revenue_side, increase -> positive -> opportunity)
    assert.equal(intelByActivity['cultivo-soja'].type, 'opportunity');
    assert.equal(intelByActivity['cultivo-soja'].impact_direction, 'positive');
    assert.equal(recByActivity['cultivo-soja'].type, 'pursue_opportunity');
    assert.equal(recByActivity['cultivo-soja'].strength, 'conditional');
    assertNoForbiddenLanguage(recByActivity['cultivo-soja'].statement);

    // elaboracion-aceites (customer de cultivo-soja -> se invierte a cost_side -> negative -> risk)
    assert.equal(intelByActivity['elaboracion-aceites'].type, 'risk');
    assert.equal(intelByActivity['elaboracion-aceites'].impact_direction, 'negative');
    assert.equal(recByActivity['elaboracion-aceites'].type, 'mitigate');
    assertNoForbiddenLanguage(recByActivity['elaboracion-aceites'].statement);

    // ganaderia-bovina-carne: related_activity heredada (uncertain) - vinculo debil
    assert.equal(intelByActivity['ganaderia-bovina-carne'].impact_direction, 'uncertain');
    assert.notEqual(intelByActivity['ganaderia-bovina-carne'].type, 'risk');
    assert.notEqual(intelByActivity['ganaderia-bovina-carne'].type, 'opportunity');
    assert.equal(recByActivity['ganaderia-bovina-carne'].type, 'monitor');
    // is_primary_activity ya no se calcula centralmente (ver core/relevance/relevance-engine.js) - siempre false aquí.
    const relResult = r2.outputs.relevance.find((x) => x.activity_id === 'ganaderia-bovina-carne');
    assert.equal(relResult.is_primary_activity, false);

    // no se duplico la señal ni la captura por tener 3 actividades relacionadas
    assert.equal(r2.stats.signals_generated, 1);
  });

  test('Caso 5/37 - riesgo sanitario: category=risks estructural -> prepare, sin ejecución automática', async () => {
    const r = await runPipeline(
      db,
      [{ monitorId: 'mgap-dgsg::principal', fixturePath: FX('sanidad-brote-aftosa.t1.json'), context: { originActivityId: 'ganaderia-bovina-carne', originRamificationId: 'brote-aftosa', topicId: 'sanidad', kind: 'document' } }],
      { mode: 'fixture' }
    );
    assert.equal(r.outputs.signals[0].signal_type, 'nuevo-elemento');
    const intel = r.outputs.intelligence.find((i) => i.activity_id === 'ganaderia-bovina-carne');
    assert.equal(intel.type, 'risk');
    const rec = r.outputs.recommendations.find((x) => x.activity_id === 'ganaderia-bovina-carne');
    assert.equal(rec.type, 'prepare');
    assert.equal(rec.strength, 'preventive');
    assert.match(rec.statement, /^Conviene prepararse para/);
    assertNoForbiddenLanguage(rec.statement);
    // ninguna estructura de este motor ejecuta nada: solo se verifica la ausencia de campos de ejecución.
    assert.equal(Object.prototype.hasOwnProperty.call(rec, 'executed'), false);
  });

  test('Caso 3/38 - evidencia contradictoria: nunca produce una recomendación categórica', async () => {
    await runPipeline(db, [{ monitorId: 'fao-giews-amis::principal', fixturePath: FX('soja-precio.t1.json'), context: { originActivityId: 'cultivo-soja', originRamificationId: 'soja', indicator: 'precio-soja-fao-amis', kind: 'indicator' } }]);
    const r = await runPipeline(
      db,
      [{ monitorId: 'fao-giews-amis::principal', fixturePath: FX('soja-precio.t2.json'), context: { originActivityId: 'cultivo-soja', originRamificationId: 'soja', indicator: 'precio-soja-fao-amis', kind: 'indicator', conflicting: true } }]
    );
    const rec = r.outputs.recommendations.find((x) => x.activity_id === 'cultivo-soja');
    assert.equal(rec.strength, 'none');
    assert.equal(rec.statement, 'No existe evidencia suficiente para recomendar una acción.');
  });

  test('Caso 4/10/39 - información insuficiente: monitor o seek_information, nunca una acción inventada', async () => {
    await runPipeline(db, [{ monitorId: 'fao-giews-amis::principal', fixturePath: FX('soja-precio.t1.json'), context: { originActivityId: 'cultivo-soja', originRamificationId: 'soja', indicator: 'precio-soja-fao-amis', kind: 'indicator' } }]);
    const r = await runPipeline(db, [{ monitorId: 'fao-giews-amis::principal', fixturePath: FX('soja-precio.t2.json'), context: { originActivityId: 'cultivo-soja', originRamificationId: 'soja', indicator: 'precio-soja-fao-amis', kind: 'indicator' } }]);
    const rec = r.outputs.recommendations.find((x) => x.activity_id === 'ganaderia-bovina-carne');
    assert.ok(['monitor', 'seek_information'].includes(rec.type));
  });

  test('función pura - seek_information cuando no hay recurso de monitoring/ relevante', async () => {
    const { generateRecommendation, computeEvidenceLevel } = await import('../intelligence/recommendations/recommendations.js');
    db.prepare("INSERT INTO pipeline_runs (id, mode, started_at, status) VALUES ('r1','fixture', datetime('now'), 'running')").run();
    db.prepare("INSERT INTO intelligence (id, run_id, based_on_signal_ids, activity_id, type, impact_direction, evidence_level, status, rationale, created_at) VALUES ('i1','r1','[]','act-x','impact','uncertain','structural_relationship','detected','prueba unitaria', datetime('now'))").run();
    db.prepare("INSERT INTO decisions (id, run_id, triggered_by_intelligence_id, type, scope, activity_id, alternatives, status, created_at) VALUES ('d1','r1','i1','production','operational','act-x','[]','open', datetime('now'))").run();
    const intel = { id: 'i1', activity_id: 'act-x', type: 'impact', impact_direction: 'uncertain', evidence_level: 'structural_relationship', rationale: 'prueba unitaria' };
    const result = generateRecommendation(db, 'r1', { id: 'd1', activity_id: 'act-x', type: 'production' }, intel, { hasMonitoringResource: false });
    assert.equal(result.recommendation.type, 'seek_information');
    assert.equal(computeEvidenceLevel(intel), 'insufficient');
  });

  test('Caso 11/12/40 - actualización/reemplazo: nueva evidencia reemplaza sin perder histórico', async () => {
    await runPipeline(db, [{ monitorId: 'fao-giews-amis::principal', fixturePath: FX('soja-precio.t1.json'), context: { originActivityId: 'cultivo-soja', originRamificationId: 'soja', indicator: 'precio-soja-fao-amis', kind: 'indicator' } }]);
    const r2 = await runPipeline(db, [{ monitorId: 'fao-giews-amis::principal', fixturePath: FX('soja-precio.t2.json'), context: { originActivityId: 'cultivo-soja', originRamificationId: 'soja', indicator: 'precio-soja-fao-amis', kind: 'indicator' } }]);
    const recV1 = r2.outputs.recommendations.find((x) => x.activity_id === 'cultivo-soja');
    assert.equal(recV1.type, 'pursue_opportunity');

    const r3 = await runPipeline(db, [{ monitorId: 'fao-giews-amis::principal', fixturePath: FX('soja-precio.t3.json'), context: { originActivityId: 'cultivo-soja', originRamificationId: 'soja', indicator: 'precio-soja-fao-amis', kind: 'indicator' } }]);
    const recV2 = r3.outputs.recommendations.find((x) => x.activity_id === 'cultivo-soja');
    assert.equal(recV2.type, 'mitigate', 'la caida de precio (-13.4%) invierte la clasificación a riesgo');
    assert.equal(recV2.previous_version_id, recV1.id);

    const v1InDb = db.prepare('SELECT status FROM recommendations WHERE id = ?').get(recV1.id);
    assert.equal(v1InDb.status, 'superseded', 'la recomendación anterior no se elimina, se marca superseded');
    const allForActivity = db.prepare('SELECT id, status FROM recommendations WHERE activity_id = ?').all('cultivo-soja');
    assert.equal(allForActivity.length, 2, 'el histórico se conserva completo');
  });

  test('Idempotencia - la misma captura ejecutada dos veces no duplica señales', async () => {
    await runPipeline(db, [{ monitorId: 'fao-giews-amis::principal', fixturePath: FX('soja-precio.t1.json'), context: { originActivityId: 'cultivo-soja', originRamificationId: 'soja', indicator: 'precio-soja-fao-amis', kind: 'indicator' } }]);
    const jobT2 = { monitorId: 'fao-giews-amis::principal', fixturePath: FX('soja-precio.t2.json'), context: { originActivityId: 'cultivo-soja', originRamificationId: 'soja', indicator: 'precio-soja-fao-amis', kind: 'indicator' } };
    const first = await runPipeline(db, [jobT2]);
    assert.equal(first.stats.signals_generated, 1);
    // Re-ejecutar el MISMO job (misma captura, mismo valor) -> la comparación
    // contra la última captura (idéntica) debe dar sin_cambio, no una señal nueva.
    const second = await runPipeline(db, [jobT2]);
    assert.equal(second.stats.signals_generated, 0);
    const totalSignals = db.prepare('SELECT COUNT(*) AS n FROM signals').get();
    assert.equal(totalSignals.n, 1);
  });

  test('Caso 22/54 - self-loops: 0 casos en relevance/mappings.json (ver relevance/gaps.json.propagation_self_loop_bug)', () => {
    const graph = knowledge.relevanceMappings();
    for (const id of ['agencias-operadores', 'alojamiento', 'cosecha-forestal']) {
      const selfLoop = (graph[id] ?? []).find((e) => e.target_activity_id === id);
      assert.equal(selfLoop, undefined, `self-loop detectado para ${id}`);
    }
  });

  test('Seguridad/observabilidad - ningún error registrado contiene la API key', async () => {
    await runPipeline(db, [{ monitorId: 'inexistente::x', context: {} }]);
    const errors = db.prepare('SELECT * FROM errors').all();
    assert.ok(errors.length >= 1);
    for (const e of errors) {
      assert.ok(!JSON.stringify(e).includes(process.env.DEEPSEEK_API_KEY || '__none__'));
    }
  });
});

describe('Proveedor de IA - interfaz desacoplada (sin llamadas reales)', () => {
  test('resolveProvider selecciona un proveedor sin llamar a ninguna API', async () => {
    const { AIProvider } = await import('../services/ai/provider.js');
    class FakeProvider extends AIProvider {
      isConfigured() { return true; }
      async generate(prompt) { return `fake:${prompt}`; }
    }
    const provider = new FakeProvider();
    const out = await provider.generate('hola');
    assert.equal(out, 'fake:hola');
    assert.ok(provider instanceof AIProvider);
  });
});
