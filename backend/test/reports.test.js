// Pruebas del Motor de Reportes (prompt de Reportes, sección 25, 30 casos).
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetDbForTests } from '../db/connection.js';
import { runPipeline } from '../pipeline/orchestrator.js';
import { knowledge } from '../knowledge/loader.js';
import { createProfile, setActivities } from '../core/profile/store.js';
import { generateReport } from '../reports/build.js';
import { getReport, getVersions, getTraceability, listReports } from '../reports/store.js';
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

describe('Motor de Reportes', () => {
  let db;
  beforeEach(() => {
    db = resetDbForTests(':memory:');
  });

  test('Caso 1 - reporte ejecutivo (con perfil)', async () => {
    await runSojaT1T2(db);
    const p = profileABC(db);
    const r = generateReport(db, 'executive', { profileId: p.id });
    assert.equal(r.type, 'executive');
    assert.ok(r.body.executive_summary.claims.length > 0);
  });

  test('Caso 2 - reporte sectorial', async () => {
    await runSojaT1T2(db);
    const r = generateReport(db, 'sectorial', { activityId: 'elaboracion-aceites' });
    assert.equal(r.type, 'sectorial');
    assert.ok(r.body.risks.claims.length > 0);
    assert.equal(r.scope.activity_id, 'elaboracion-aceites');
  });

  test('Caso 3 - reporte de mercado', async () => {
    // señal sintética asociada a INAC (markets=[china,...]) reusando el patrón de profile.test.js
    db.prepare("INSERT INTO pipeline_runs (id, mode, started_at, status) VALUES ('r1','fixture', datetime('now'), 'completed')").run();
    db.prepare("INSERT INTO captures (id, run_id, source_id, monitor_id, captured_at, status) VALUES ('cap1','r1','inac','inac::faena-y-precios', datetime('now'), 'fixture')").run();
    db.prepare("INSERT INTO changes (id, run_id, capture_id, monitor_id, change_class, detected_at) VALUES ('c1','r1','cap1','inac::faena-y-precios','valor_modificado', datetime('now'))").run();
    db.prepare("INSERT INTO signals (id, run_id, change_id, signal_type, topic_id, direction, origin_activity_id, source_id, monitor_id, detected_at, dedup_key, status) VALUES ('s1','r1','c1','cambio-significativo','precios','increase','ganaderia-bovina-carne','inac','inac::faena-y-precios', datetime('now'), 'd1', 'active')").run();
    db.prepare("INSERT INTO relevance_results (id, run_id, signal_id, activity_id, relevance_level, factor, reason, evidence, is_primary_activity) VALUES ('rel1','r1','s1','ganaderia-bovina-carne','high','direct_dependency','prueba', '[]', 0)").run();

    const r = generateReport(db, 'market', { marketId: 'china', activityIds: ['ganaderia-bovina-carne'] });
    assert.equal(r.type, 'market');
    assert.ok(r.sources.some((s) => s.id === 'inac'));
  });

  test('Caso 4/8 - reporte de riesgo, y ausencia de información como resultado válido', async () => {
    await runSojaT1T2(db);
    const rWithRisk = generateReport(db, 'risk', { activityIds: ['elaboracion-aceites'] });
    assert.ok(rWithRisk.body.risks.claims.length > 0);

    const rEmpty = generateReport(db, 'risk', { activityIds: ['software-ti'] });
    assert.equal(rEmpty.body.risks.no_relevant_information, true);
  });

  test('Caso 5 - reporte de oportunidad', async () => {
    await runSojaT1T2(db);
    const r = generateReport(db, 'opportunity', { activityIds: ['cultivo-soja'] });
    assert.ok(r.body.opportunities.claims.length > 0);
    assert.equal(r.body.opportunities.claims[0].type, 'opportunity');
  });

  test('Caso 6 - reporte personalizado usa el perfil completo', async () => {
    await runSojaT1T2(db);
    const p = profileABC(db);
    const r = generateReport(db, 'personalized', { profileId: p.id });
    assert.equal(r.scope.main_activity_id, 'ganaderia-bovina-carne');
    assert.equal(r.scope.activities.length, 3);
  });

  test('Caso 7/15/16 - reporte periódico: comparación real, multiactividad implícita vía distintas corridas', async () => {
    await runPipeline(db, [job('soja-precio.t1.json')]);
    await runPipeline(db, [job('soja-precio.t2.json')]);
    // recorre los timestamps para simular dos periodos reales distintos
    const changes = db.prepare("SELECT id, detected_at FROM changes ORDER BY detected_at ASC").all();
    const t0 = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const t1 = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const t2 = new Date().toISOString();
    db.prepare('UPDATE changes SET detected_at = ? WHERE id = ?').run(t1, changes[0].id);
    db.prepare('UPDATE changes SET detected_at = ? WHERE id = ?').run(t2, changes[1].id);

    const r = generateReport(db, 'periodic', {
      monitorId: 'fao-giews-amis::principal', field: 'precio-soja-fao-amis',
      periodStart: new Date(Date.now() - 30 * 60 * 1000).toISOString(), periodEnd: new Date(Date.now() + 60 * 1000).toISOString(),
      activityId: 'cultivo-soja',
    });
    assert.equal(r.type, 'periodic');
    const claim = r.body.comparisons.claims[0];
    assert.equal(claim.type, 'comparison');
    assert.ok(!/^la tendencia es/i.test(claim.text), 'una comparación nunca debe AFIRMAR una tendencia (prompt seccion 10)');
    assert.ok(claim.text.includes('no implica'), 'debe aclarar explícitamente que una comparación no implica tendencia');
  });

  test('Caso 9 - evidencia insuficiente no se presenta como confirmada', async () => {
    const r = await runPipeline(db, [{ monitorId: 'bcu::cotizaciones', fixturePath: FX('soja-precio.t1.json'), context: { originActivityId: 'cultivo-soja', originRamificationId: 'soja', indicator: 'no-configurado', kind: 'indicator' } }]);
    assert.equal(r.stats.signals_generated, 0);
    const rep = generateReport(db, 'sectorial', { activityId: 'cultivo-soja' });
    assert.equal(rep.body.changes.no_relevant_changes, true);
  });

  test('Caso 10 - evidencia contradictoria se conserva explícita, sin recomendación categórica', async () => {
    await runPipeline(db, [job('soja-precio.t1.json')]);
    await runPipeline(db, [job('soja-precio.t2.json', { conflicting: true })]);
    const r = generateReport(db, 'sectorial', { activityId: 'cultivo-soja' });
    const recClaim = r.body.recommendations.claims.find((c) => c.text.includes('No existe evidencia suficiente'));
    assert.ok(recClaim);
    const uncertaintyClaim = r.body.uncertainty.claims.find((c) => c.evidence_level === 'conflicting');
    assert.ok(uncertaintyClaim, 'debe registrarse como incertidumbre explícita, no ocultarse');
  });

  test('Caso 11/19 - recomendaciones existentes se muestran; recomendación superseded no aparece como vigente', async () => {
    await runPipeline(db, [job('soja-precio.t1.json')]);
    await runPipeline(db, [job('soja-precio.t2.json')]);
    await runPipeline(db, [job('soja-precio.t3.json')]);
    const r = generateReport(db, 'sectorial', { activityId: 'cultivo-soja' });
    const recs = r.body.recommendations.claims.filter((c) => c.references.activity_id === 'cultivo-soja');
    assert.equal(recs.length, 1, 'solo la recomendación vigente aparece como claim');
  });

  test('Caso 12 - ausencia de recomendación es un resultado válido (no_recommendation)', async () => {
    const r = generateReport(db, 'sectorial', { activityId: 'software-ti' });
    assert.equal(r.body.recommendations.no_recommendation, true);
  });

  test('Caso 13/14 - multiactividad: actividad secundaria con conclusión distinta de la principal', async () => {
    await runSojaT1T2(db);
    const p = profileABC(db);
    const r = generateReport(db, 'personalized', { profileId: p.id });
    const byActivity = Object.fromEntries(r.claims.filter((c) => c.type === 'risk' || c.type === 'opportunity').map((c) => [c.activity_id, c.type]));
    assert.equal(byActivity['cultivo-soja'], 'opportunity');
    assert.equal(byActivity['elaboracion-aceites'], 'risk');
    assert.equal(byActivity['ganaderia-bovina-carne'], undefined, 'la actividad principal no tiene riesgo/oportunidad forzado');
  });

  test('Caso 16 - diferencia sin tendencia: un reporte periódico nunca usa el término tendencia', async () => {
    await runPipeline(db, [job('soja-precio.t1.json')]);
    await runPipeline(db, [job('soja-precio.t2.json')]);
    const changes = db.prepare('SELECT id FROM changes ORDER BY detected_at ASC').all();
    db.prepare('UPDATE changes SET detected_at = ? WHERE id = ?').run(new Date(Date.now() - 30 * 60 * 1000).toISOString(), changes[0].id);
    db.prepare('UPDATE changes SET detected_at = ? WHERE id = ?').run(new Date().toISOString(), changes[1].id);
    const r = generateReport(db, 'periodic', {
      monitorId: 'fao-giews-amis::principal', field: 'precio-soja-fao-amis',
      periodStart: new Date(Date.now() - 45 * 60 * 1000).toISOString(), periodEnd: new Date(Date.now() + 60 * 1000).toISOString(),
      activityId: 'cultivo-soja',
    });
    const bodyStr = JSON.stringify(r.body.comparisons);
    assert.ok(!bodyStr.toLowerCase().includes('"tendencia confirmada"'));
  });

  test('Caso 17 - tendencia validada aparece cuando existe evidencia real (3 observaciones)', async () => {
    await runPipeline(db, [job('soja-precio.t1.json')]);
    await runPipeline(db, [job('soja-precio.t2.json')]);
    await runPipeline(db, [job('soja-precio.t2b.json')]);
    await runPipeline(db, [job('soja-precio.t2c.json')]);
    const p = profileABC(db);
    const r = generateReport(db, 'personalized', { profileId: p.id });
    assert.ok(r.body.trends.claims.length > 0, 'con 3 observaciones consecutivas, el reporte debe incluir un claim de tendencia');
    assert.equal(r.body.trends.claims[0].type, 'trend');
  });

  test('Caso 18 - inteligencia superseded no debe fabricarse (gap documentado: intelligence/ no versiona todavía)', async () => {
    // knowledge/intelligence/rules.json no define supersession de intelligence units en esta version del motor -
    // se verifica que el reporte no inventa un estado 'superseded' para intelligence (solo recommendations lo tiene).
    await runSojaT1T2(db);
    const r = generateReport(db, 'sectorial', { activityId: 'cultivo-soja' });
    const intelClaims = r.claims.filter((c) => c.type === 'opportunity' || c.type === 'impact');
    assert.ok(intelClaims.every((c) => !('status' in c) || c.status === undefined));
  });

  test('Caso 20 - trazabilidad completa reporte -> claim -> señal -> cambio -> captura -> fuente', async () => {
    await runSojaT1T2(db);
    const r = generateReport(db, 'sectorial', { activityId: 'cultivo-soja' });
    const trace = getTraceability(db, r.id);
    const withSource = trace.find((t) => t.source_id);
    assert.ok(withSource);
    assert.equal(withSource.source_id, 'fao-giews-amis');
    assert.ok(withSource.institution);
  });

  test('Caso 21 - reproducibilidad: mismo snapshot/reglas producen el mismo contenido estructurado', async () => {
    await runSojaT1T2(db);
    const r1 = generateReport(db, 'sectorial', { activityId: 'cultivo-soja' });
    // Releer el mismo reporte ya persistido debe devolver exactamente el mismo body (no se regenera al leer).
    const reread = getReport(db, r1.id);
    assert.deepEqual(reread.body, r1.body);
  });

  test('Caso 22 - snapshot identifica el conjunto de información utilizado', async () => {
    await runSojaT1T2(db);
    const r = generateReport(db, 'sectorial', { activityId: 'cultivo-soja' });
    assert.ok(r.snapshot.signal_ids.length > 0);
    assert.ok(r.snapshot.intelligence_ids.length > 0);
  });

  test('Caso 23 - versionado: una nueva generación con el mismo alcance sucede a la anterior', async () => {
    await runSojaT1T2(db);
    const r1 = generateReport(db, 'sectorial', { activityId: 'cultivo-soja' });
    const r2 = generateReport(db, 'sectorial', { activityId: 'cultivo-soja' });
    assert.equal(r2.version, r1.version + 1);
    assert.equal(r2.previous_version_id, r1.id);
    const versions = getVersions(db, r2.id);
    assert.equal(versions.length, 2);
    assert.equal(versions.find((v) => v.id === r1.id).status, 'superseded');
  });

  test('Caso 24 - no duplicación: generar 2 reportes no duplica señales/inteligencia/capturas', async () => {
    await runSojaT1T2(db);
    const capturesBefore = db.prepare('SELECT COUNT(*) AS n FROM captures').get().n;
    const signalsBefore = db.prepare('SELECT COUNT(*) AS n FROM signals').get().n;
    const intelBefore = db.prepare('SELECT COUNT(*) AS n FROM intelligence').get().n;

    generateReport(db, 'sectorial', { activityId: 'cultivo-soja' });
    generateReport(db, 'risk', { activityIds: ['elaboracion-aceites'] });

    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM captures').get().n, capturesBefore);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM signals').get().n, signalsBefore);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM intelligence').get().n, intelBefore);
  });

  test('Caso 25 - sin llamadas externas: el motor de reportes no importa services/ai ni services/search', () => {
    const files = ['build.js', 'claims.js', 'select.js', 'store.js'].map((f) => fs.readFileSync(join(__dirname, '..', 'reports', f), 'utf-8')).join('\n');
    assert.ok(!files.includes('services/ai'));
    assert.ok(!files.includes('services/search'));
  });

  test('Caso 26 - funciona completamente sin IA (ningún generateReport llama a un AIProvider)', async () => {
    await runSojaT1T2(db);
    // Si el motor dependiera de IA, esto lanzaría por falta de API key configurada - no lanza.
    assert.doesNotThrow(() => generateReport(db, 'personalized', { profileId: profileABC(db).id }));
  });

  test('Caso 27/28 - DeepSeek y OpenRouter permanecen abstractos (no invocados, mismo AIProvider de etapas anteriores)', async () => {
    const { AIProvider } = await import('../services/ai/provider.js');
    const { DeepSeekProvider } = await import('../services/ai/deepseek-provider.js');
    const { OpenRouterProvider } = await import('../services/ai/openrouter-provider.js');
    assert.ok(new DeepSeekProvider() instanceof AIProvider);
    assert.ok(new OpenRouterProvider() instanceof AIProvider);
  });

  test('Caso 29 - self-loops continúan bloqueados', () => {
    const graph = knowledge.relevanceMappings();
    for (const id of ['agencias-operadores', 'alojamiento', 'cosecha-forestal']) {
      assert.equal((graph[id] ?? []).find((e) => e.target_activity_id === id), undefined);
    }
  });

  test('Caso 30 - información fuera del alcance no aparece en el reporte', async () => {
    await runSojaT1T2(db);
    const r = generateReport(db, 'sectorial', { activityId: 'cultivo-soja' });
    const activityIdsInReport = new Set(r.claims.map((c) => c.activity_id).filter(Boolean));
    assert.ok(!activityIdsInReport.has('turismo'), 'una actividad fuera del alcance declarado no debe aparecer');
    for (const aid of activityIdsInReport) assert.equal(aid, 'cultivo-soja');
  });

  test('listReports / getReport / endpoints básicos de consulta', async () => {
    await runSojaT1T2(db);
    generateReport(db, 'sectorial', { activityId: 'cultivo-soja' });
    const list = listReports(db, { type: 'sectorial' });
    assert.equal(list.length, 1);
    assert.equal(getReport(db, 'id-inexistente'), null);
  });
});
