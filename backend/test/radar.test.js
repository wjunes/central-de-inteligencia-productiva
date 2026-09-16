// Pruebas del Radar Productivo (prompt de Radar, sección 33, casos 1-25).
// Construye sobre el motor central y la personalización ya probados.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetDbForTests } from '../db/connection.js';
import { runPipeline } from '../pipeline/orchestrator.js';
import { knowledge } from '../knowledge/loader.js';
import { createProfile, setActivities } from '../core/profile/store.js';
import { buildRadar } from '../radar/build.js';
import { priorityKeyOf } from '../radar/prioritize.js';
import fs from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FX = (name) => join(__dirname, '..', 'fixtures', name);
const job = (file, extra = {}) => ({ monitorId: 'fao-giews-amis::principal', fixturePath: FX(file), context: { originActivityId: 'cultivo-soja', originRamificationId: 'soja', indicator: 'precio-soja-fao-amis', topicId: 'precios', kind: 'indicator', ...extra } });

async function runSojaT1T2(db) {
  await runPipeline(db, [job('soja-precio.t1.json')]);
  return runPipeline(db, [job('soja-precio.t2.json')]);
}

function profileABC(db) {
  const p = createProfile(db, { name: 'Perfil ABC', main_activity_id: 'ganaderia-bovina-carne' });
  setActivities(db, p.id, { main_activity_id: 'ganaderia-bovina-carne', secondary_activity_ids: ['cultivo-soja', 'elaboracion-aceites'] });
  return p;
}

describe('Radar Productivo', () => {
  let db;
  beforeEach(() => {
    db = resetDbForTests(':memory:');
  });

  test('Caso 1 - un cambio reciente aparece en la vista changes', async () => {
    await runSojaT1T2(db);
    const p = profileABC(db);
    const radar = buildRadar(db, p.id);
    assert.equal(radar.changes.no_relevant_changes, false);
    assert.ok(radar.changes.items.some((c) => c.activity_id === 'cultivo-soja'));
  });

  test('Caso 2/6/24 - una situación agrupa correctamente y mantiene una sola identidad para múltiples actividades', async () => {
    await runSojaT1T2(db);
    const p = profileABC(db);
    const radar = buildRadar(db, p.id);
    assert.equal(radar.situations.items.length, 1, 'las 3 actividades comparten topic_id=precios y la misma señal -> UNA situación');
    const sit = radar.situations.items[0];
    assert.equal(sit.topic_id, 'precios');
    assert.deepEqual([...sit.activity_ids].sort(), ['cultivo-soja', 'elaboracion-aceites', 'ganaderia-bovina-carne']);
    assert.equal(sit.intelligence_ids.length, 3, 'referencia 3 intelligence units, no los copia');
  });

  test('Caso 3 - una única señal no se convierte en tendencia', async () => {
    await runSojaT1T2(db);
    const p = profileABC(db);
    const radar = buildRadar(db, p.id);
    assert.equal(radar.situations.items[0].trend.status, 'insufficient_evidence');
  });

  test('Caso 4/25 - tres observaciones consecutivas en la misma dirección sustentan una tendencia; una situación emergente no se presenta como tendencia confirmada prematuramente', async () => {
    await runPipeline(db, [job('soja-precio.t1.json')]);
    const r2 = await runPipeline(db, [job('soja-precio.t2.json')]);
    const p = profileABC(db);
    // tras la 1ra suba: emerging + trend insuficiente
    let radar = buildRadar(db, p.id);
    assert.equal(radar.situations.items[0].status, 'emerging');
    assert.equal(radar.situations.items[0].trend.status, 'insufficient_evidence');

    await runPipeline(db, [job('soja-precio.t2b.json')]);
    await runPipeline(db, [job('soja-precio.t2c.json')]);
    radar = buildRadar(db, p.id);
    const sit = radar.situations.items.find((s) => s.topic_id === 'precios');
    assert.equal(sit.trend.status, 'confirmed');
    assert.equal(sit.trend.direction, 'increase');
    assert.equal(sit.trend.observations, 3);
  });

  test('Caso 5/23 - situación relevante para actividad secundaria prioriza sobre la principal, sin privilegio artificial', async () => {
    await runSojaT1T2(db);
    const p = profileABC(db);
    const radar = buildRadar(db, p.id);
    // elaboracion-aceites (secundaria, risk/high) debe listarse antes en risks que cualquier entrada de ganaderia-bovina-carne (principal)
    const riskActivities = radar.risks.map((r) => r.activity_id);
    assert.ok(riskActivities.includes('elaboracion-aceites'));
    assert.ok(!riskActivities.includes('ganaderia-bovina-carne'), 'ganaderia-bovina-carne no calificó como riesgo (dirección incierta) pese a ser la actividad principal');
    // priorityKeyOf no debe usar is_primary_activity en absoluto
    assert.equal(Object.keys(priorityKeyOf({})).includes('is_primary_activity'), false);
  });

  test('Caso 7/8 - riesgo y oportunidad aparecen correctamente, vía intelligence ya generada (no inferidos por signo)', async () => {
    await runSojaT1T2(db);
    const p = profileABC(db);
    const radar = buildRadar(db, p.id);
    assert.ok(radar.risks.some((r) => r.activity_id === 'elaboracion-aceites' && r.intelligence.some((i) => i.type === 'risk')));
    assert.ok(radar.opportunities.some((r) => r.activity_id === 'cultivo-soja' && r.intelligence.some((i) => i.type === 'opportunity')));
  });

  test('Caso 9/19-conflicto - evidencia contradictoria se conserva explícita (conflicting=true), nunca se oculta', async () => {
    await runPipeline(db, [job('soja-precio.t1.json')]);
    await runPipeline(db, [job('soja-precio.t2.json', { conflicting: true })]);
    const p = profileABC(db);
    const radar = buildRadar(db, p.id);
    const sit = radar.situations.items.find((s) => s.topic_id === 'precios');
    assert.equal(sit.conflicting, true);
  });

  test('Caso 10 - confidence y relevance permanecen dimensiones separadas en la situación', async () => {
    await runSojaT1T2(db);
    const p = profileABC(db);
    const radar = buildRadar(db, p.id);
    const sit = radar.situations.items[0];
    assert.ok(sit.personalized_relevance.level);
    assert.ok(sit.confidence);
    assert.notEqual(sit.personalized_relevance.level, sit.confidence, 'no son el mismo campo');
  });

  test('Caso 11/22 - recomendación superseded no aparece en radar.recommendations (solo activas)', async () => {
    await runPipeline(db, [job('soja-precio.t1.json')]);
    await runPipeline(db, [job('soja-precio.t2.json')]);
    await runPipeline(db, [job('soja-precio.t3.json')]);
    const p = profileABC(db);
    const radar = buildRadar(db, p.id);
    const sojaRecs = radar.recommendations.filter((r) => r.activity_id === 'cultivo-soja');
    assert.equal(sojaRecs.length, 1, 'solo la recomendación vigente, nunca la superseded');
    assert.equal(sojaRecs[0].status, 'active');
    assert.equal(sojaRecs[0].type, 'mitigate');
  });

  test('Caso 12/22 - una situación resuelta (sin evidencia reciente) deja de aparecer entre las activas, pero queda en resolved', async () => {
    await runSojaT1T2(db);
    const p = profileABC(db);
    let radar = buildRadar(db, p.id);
    assert.equal(radar.situations.items.length, 1);

    // Simula el paso del tiempo: la única señal que sustenta la situación
    // queda fuera de su ventana reciente (fao-giews-amis es event_driven,
    // ventana con piso de 1 día -> se retrocede 30 días).
    const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare("UPDATE signals SET detected_at = ?").run(oldDate);

    radar = buildRadar(db, p.id);
    const stillActive = radar.situations.items.find((s) => s.topic_id === 'precios');
    assert.equal(stillActive, undefined, 'sin evidencia dentro de la ventana, la situación no debe listarse como activa');
    const resolvedOne = radar.situations.resolved.find((s) => s.topic_id === 'precios');
    assert.ok(resolvedOne, 'debe conservarse en resolved, no eliminarse');
    assert.equal(resolvedOne.status, 'resolved');
  });

  test('Caso 13 - información insuficiente no se presenta como confirmada (indicador sin umbral configurado)', async () => {
    // bcu::cotizaciones no tiene entrada en backend/config/thresholds.json -> pending_threshold -> ninguna señal, ninguna situación fabricada.
    const r = await runPipeline(db, [{ monitorId: 'bcu::cotizaciones', fixturePath: FX('soja-precio.t1.json'), context: { originActivityId: 'cultivo-soja', originRamificationId: 'soja', indicator: 'tipo-cambio-no-configurado', kind: 'indicator' } }]);
    assert.equal(r.stats.signals_generated, 0);
    const r2 = await runPipeline(db, [{ monitorId: 'bcu::cotizaciones', fixturePath: FX('soja-precio.t2.json'), context: { originActivityId: 'cultivo-soja', originRamificationId: 'soja', indicator: 'tipo-cambio-no-configurado', kind: 'indicator' } }]);
    assert.equal(r2.stats.signals_generated, 0, 'sin umbral configurado, nunca se fabrica una señal');
  });

  test('Caso 14 - radar sin elementos relevantes devuelve no_active_situations', () => {
    const p = createProfile(db, { name: 'Perfil vacío', main_activity_id: 'software-ti' });
    const radar = buildRadar(db, p.id);
    assert.equal(radar.situations.no_active_situations, true);
    assert.equal(radar.changes.no_relevant_changes, true);
  });

  test('Caso 15 - self-loops continúan bloqueados', () => {
    const graph = knowledge.relevanceMappings();
    for (const id of ['agencias-operadores', 'alojamiento', 'cosecha-forestal']) {
      assert.equal((graph[id] ?? []).find((e) => e.target_activity_id === id), undefined);
    }
  });

  test('Caso 16 - dos perfiles distintos reciben distinta priorización desde la misma inteligencia central', async () => {
    await runSojaT1T2(db);
    const profileGanadero = createProfile(db, { name: 'Ganadero', main_activity_id: 'ganaderia-bovina-carne' });
    setActivities(db, profileGanadero.id, { main_activity_id: 'ganaderia-bovina-carne', secondary_activity_ids: ['cultivo-soja'] });
    const profileAceitero = createProfile(db, { name: 'Aceitero', main_activity_id: 'elaboracion-aceites' });

    const radarA = buildRadar(db, profileGanadero.id);
    const radarB = buildRadar(db, profileAceitero.id);
    assert.notDeepEqual(radarA.risks.map((r) => r.activity_id), radarB.risks.map((r) => r.activity_id));
    assert.ok(radarB.risks.some((r) => r.activity_id === 'elaboracion-aceites'));
    assert.ok(!radarA.risks.some((r) => r.activity_id === 'elaboracion-aceites'), 'perfil ganadero ni siquiera tiene esa actividad declarada');
  });

  test('Caso 17/18 - no se generan señales ni capturas adicionales al construir el radar (2 perfiles)', async () => {
    await runSojaT1T2(db);
    const capturesBefore = db.prepare('SELECT COUNT(*) AS n FROM captures').get().n;
    const signalsBefore = db.prepare('SELECT COUNT(*) AS n FROM signals').get().n;

    const p1 = profileABC(db);
    const p2 = createProfile(db, { name: 'Otro perfil', main_activity_id: 'cultivo-soja' });
    buildRadar(db, p1.id);
    buildRadar(db, p2.id);
    buildRadar(db, p1.id); // segunda consulta del mismo perfil

    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM captures').get().n, capturesBefore);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM signals').get().n, signalsBefore);
  });

  test('Caso 19/20 - el Radar no importa servicios de búsqueda ni de IA (verificación estructural)', () => {
    const src = fs.readFileSync(join(__dirname, '..', 'radar', 'build.js'), 'utf-8') +
      fs.readFileSync(join(__dirname, '..', 'radar', 'situations.js'), 'utf-8') +
      fs.readFileSync(join(__dirname, '..', 'radar', 'trend.js'), 'utf-8') +
      fs.readFileSync(join(__dirname, '..', 'radar', 'prioritize.js'), 'utf-8');
    assert.ok(!src.includes("services/ai"), 'el radar no debe importar services/ai');
    assert.ok(!src.includes("services/search"), 'el radar no debe importar services/search');
  });

  test('Caso 21 - trazabilidad radar item -> situación -> inteligencia -> señal -> cambio -> captura -> fuente', async () => {
    await runSojaT1T2(db);
    const p = profileABC(db);
    const radar = buildRadar(db, p.id);
    const sit = radar.situations.items[0];
    const intelId = sit.intelligence_ids[0];
    const intel = db.prepare('SELECT * FROM intelligence WHERE id = ?').get(intelId);
    assert.ok(intel);
    const signalId = JSON.parse(intel.based_on_signal_ids)[0];
    const signal = db.prepare('SELECT * FROM signals WHERE id = ?').get(signalId);
    assert.ok(signal);
    const change = db.prepare('SELECT * FROM changes WHERE id = ?').get(signal.change_id);
    assert.ok(change);
    const capture = db.prepare('SELECT * FROM captures WHERE id = ?').get(change.capture_id);
    assert.ok(capture);
    const source = knowledge.sourceById(capture.source_id);
    assert.ok(source, 'la cadena llega hasta una fuente real de knowledge/sources/');
    assert.equal(source.id, 'fao-giews-amis');
  });
});
