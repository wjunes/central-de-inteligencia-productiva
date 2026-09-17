// Bloque B - contextualización de monitores y señales. Pruebas deterministas
// (sin red real; la validación con red real es un script aparte, ver informe
// de esta etapa). Cubren el flujo completo:
//   monitor (knowledge/monitoring/monitors.json#context) -> job.context
//   -> signal (origin_activity_id/origin_ramification_id/topic_id)
//   -> relevance_results -> Radar (getChanges/buildRadar)
// y la convivencia correcta con monitores SIN contexto determinable (la
// mayoría: no se inventa nada, la señal sigue siendo válida, simplemente no
// aparece en Radar - exactamente lo que ya hacía calculateRelevance()).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetDbForTests } from '../db/connection.js';
import { runPipeline } from '../pipeline/orchestrator.js';
import { createScheduler, operableMonitors, buildLiveJobs } from '../pipeline/scheduler.js';
import { createProfile, setActivities } from '../core/profile/store.js';
import { buildRadar } from '../radar/build.js';
import { knowledge } from '../knowledge/loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FX = (name) => join(__dirname, '..', 'fixtures', name);
const INUMET_FIXTURE = FX('inumet-datasets.t1.json');

describe('Bloque B - monitor -> contexto (buildLiveJobs)', () => {
  test('Caso 1 - un monitor con context curado en monitors.json propaga originActivityId/originRamificationId/topicId', () => {
    const monitor = knowledge.monitorById('inumet::principal');
    assert.ok(monitor.context, 'inumet::principal debe tener un context curado (ver knowledge/monitoring/monitors.json)');
    const [job] = buildLiveJobs([monitor]);
    assert.equal(job.monitorId, 'inumet::principal');
    assert.equal(job.context.originActivityId, 'agricultura-secano');
    assert.equal(job.context.originRamificationId, 'clima');
    assert.equal(job.context.topicId, 'clima-agua');
    assert.equal(job.context.kind, 'dataset_list', 'el context propagado no debe pisar kind, ya resuelto en Bloque A');
  });

  test('Caso 2 - ausencia legítima de contexto: un monitor sin context curado no inventa nada (mismo comportamiento que Bloque A)', () => {
    const monitor = knowledge.monitorById('ine::ipc');
    assert.equal(monitor.context, undefined, 'este monitor no tiene asociación determinística documentada todavía');
    const [job] = buildLiveJobs([monitor]);
    assert.deepEqual(job.context, { kind: 'dataset_list' });
  });

  test('Caso 9b - de los 21 monitores operables (19 + ursea/ursec desde Bloque I), hoy 3 tienen contexto determinístico curado', () => {
    const monitors = operableMonitors();
    const withContext = monitors.filter((m) => m.context);
    assert.equal(monitors.length, 21);
    assert.deepEqual(withContext.map((m) => m.id), ['inumet::principal', 'ursea::precios-paridad-combustibles', 'ursec::principal']);
  });
});

describe('Bloque B - contexto -> signal -> change -> Radar (fixture, sin red)', () => {
  function runInumetFixture(context) {
    const db = resetDbForTests(':memory:');
    return { db, resultPromise: runPipeline(db, [{ monitorId: 'inumet::principal', fixturePath: INUMET_FIXTURE, context }], { mode: 'fixture' }) };
  }

  test('Caso 3 - la señal generada conserva origin_activity_id/origin_ramification_id/topic_id del contexto propagado', async () => {
    const [monitor] = [knowledge.monitorById('inumet::principal')];
    const [job] = buildLiveJobs([monitor]);
    const { db, resultPromise } = runInumetFixture(job.context);
    const result = await resultPromise;

    assert.equal(result.hadErrors, false);
    assert.equal(result.stats.signals_generated, 1);
    const signal = result.outputs.signals[0];
    assert.equal(signal.origin_activity_id, 'agricultura-secano');
    assert.equal(signal.origin_ramification_id, 'clima');
    assert.equal(signal.topic_id, 'clima-agua');

    const row = db.prepare('SELECT origin_activity_id, origin_ramification_id, topic_id FROM signals WHERE id = ?').get(signal.id);
    assert.deepEqual({ ...row }, { origin_activity_id: 'agricultura-secano', origin_ramification_id: 'clima', topic_id: 'clima-agua' });
  });

  test('Caso 4 - change -> signal: el cambio detectado es nuevo_registro (primera captura) y sí produce señal (regresión del motor, no de esta etapa)', async () => {
    const [job] = buildLiveJobs([knowledge.monitorById('inumet::principal')]);
    const { resultPromise } = runInumetFixture(job.context);
    const result = await resultPromise;
    assert.equal(result.outputs.changes[0].change_class, 'nuevo_registro');
    assert.equal(result.outputs.signals[0].signal_type, 'nuevo-elemento');
  });

  test('Caso 5/6 - change -> Radar: un perfil con la actividad de origen (agricultura-secano) ve el item contextualizado', async () => {
    const [job] = buildLiveJobs([knowledge.monitorById('inumet::principal')]);
    const { db, resultPromise } = runInumetFixture(job.context);
    await resultPromise;

    const profile = createProfile(db, { name: 'Chacra de secano', main_activity_id: 'agricultura-secano' });
    const radar = buildRadar(db, profile.id);
    assert.equal(radar.changes.no_relevant_changes, false);
    assert.ok(radar.changes.items.some((c) => c.activity_id === 'agricultura-secano'), 'el perfil de agricultura-secano debe ver el cambio contextualizado en Radar');
  });

  test('Caso 7 - actividad incorrecta: un perfil sin relación (software-ti, sin arista en relevance/mappings.json) NO ve el item', async () => {
    const [job] = buildLiveJobs([knowledge.monitorById('inumet::principal')]);
    const { db, resultPromise } = runInumetFixture(job.context);
    await resultPromise;

    const unrelated = createProfile(db, { name: 'Estudio de software', main_activity_id: 'software-ti' });
    const radar = buildRadar(db, unrelated.id);
    assert.ok(radar.changes.no_relevant_changes || radar.changes.items.every((c) => c.activity_id !== 'agricultura-secano'));
    assert.ok(!radar.changes.items.some((c) => c.activity_id === 'software-ti'), 'software-ti no tiene relación con agricultura-secano: no debe recibir relevancia inventada');
  });

  test('Caso 8a - perfil multiactividad: aparece bajo la actividad relacionada aunque sea secundaria (main_activity_id no privilegia)', async () => {
    const [job] = buildLiveJobs([knowledge.monitorById('inumet::principal')]);
    const { db, resultPromise } = runInumetFixture(job.context);
    await resultPromise;

    const profile = createProfile(db, { name: 'Software + chacra (secano secundario)', main_activity_id: 'software-ti' });
    setActivities(db, profile.id, { main_activity_id: 'software-ti', secondary_activity_ids: ['agricultura-secano'] });
    const radar = buildRadar(db, profile.id);
    assert.ok(radar.changes.items.some((c) => c.activity_id === 'agricultura-secano'), 'debe aparecer para agricultura-secano aunque sea actividad secundaria');
    assert.ok(!radar.changes.items.some((c) => c.activity_id === 'software-ti'), 'no debe fabricarse un item para software-ti solo por ser main_activity_id');
  });

  test('Caso 8b - perfil multiactividad: mismo resultado si la actividad relacionada es la principal y la no relacionada es secundaria', async () => {
    const [job] = buildLiveJobs([knowledge.monitorById('inumet::principal')]);
    const { db, resultPromise } = runInumetFixture(job.context);
    await resultPromise;

    const profile = createProfile(db, { name: 'Chacra (software secundario)', main_activity_id: 'agricultura-secano' });
    setActivities(db, profile.id, { main_activity_id: 'agricultura-secano', secondary_activity_ids: ['software-ti'] });
    const radar = buildRadar(db, profile.id);
    assert.ok(radar.changes.items.some((c) => c.activity_id === 'agricultura-secano'));
    assert.ok(!radar.changes.items.some((c) => c.activity_id === 'software-ti'));
  });

  test('Caso 9 - ausencia legítima de contexto: un monitor sin context curado genera una señal válida SIN activity_id, no llega a Radar, y no rompe el pipeline', async () => {
    const [job] = buildLiveJobs([knowledge.monitorById('ine::ipc')]);
    assert.equal(job.context.originActivityId, undefined);

    const db = resetDbForTests(':memory:');
    // ine::ipc es ckan_api (kind dataset_list, igual que inumet) - reusamos el
    // mismo fixture shape para no depender de red, cambiando solo el monitorId.
    const result = await runPipeline(db, [{ monitorId: 'ine::ipc', fixturePath: INUMET_FIXTURE, context: job.context }], { mode: 'fixture' });

    assert.equal(result.hadErrors, false, 'un monitor sin contexto no debe producir un error de pipeline');
    assert.equal(result.stats.signals_generated, 1, 'la señal se genera igual: la ausencia de contexto no invalida la señal');
    const signal = result.outputs.signals[0];
    assert.equal(signal.origin_activity_id, null);
    assert.equal(result.stats.intelligence_generated, 0, 'sin origin_activity_id, calculateRelevance() no produce relevance_results (comportamiento preexistente, no nuevo)');
  });
});

describe('Bloque B - regresión del scheduler (Bloque A) con contexto habilitado', () => {
  test('Caso 10 - triggerNow() sigue despachando los 21 operables (Bloque I: + ursea/ursec), con el contexto ya mezclado en el job de cada monitor curado', async () => {
    const db = resetDbForTests(':memory:');
    const calls = [];
    const scheduler = createScheduler(db, {
      runPipelineFn: async (_db, jobs) => { calls.push(jobs); return { runId: 'r1', hadErrors: false }; },
    });
    await scheduler.triggerNow();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].length, 21);
    const inumetJob = calls[0].find((j) => j.monitorId === 'inumet::principal');
    assert.equal(inumetJob.context.originActivityId, 'agricultura-secano');
    const ureaJob = calls[0].find((j) => j.monitorId === 'ursea::precios-paridad-combustibles');
    assert.equal(ureaJob.context.originActivityId, 'combustibles');
    const ursecJob = calls[0].find((j) => j.monitorId === 'ursec::principal');
    assert.equal(ursecJob.context.originActivityId, 'telecomunicaciones');
    const curated = new Set(['inumet::principal', 'ursea::precios-paridad-combustibles', 'ursec::principal']);
    const others = calls[0].filter((j) => !curated.has(j.monitorId));
    assert.ok(others.every((j) => j.context.originActivityId === undefined), 'ningún otro monitor debe recibir un origin_activity_id inventado');
  });
});
