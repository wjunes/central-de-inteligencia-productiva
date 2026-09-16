// Scheduler (Bloque A) - pruebas deterministas. runPipelineFn/
// listOperableMonitors se inyectan siempre (mismo patrón de fetchImpl/
// baseUrl ya usado en web/src/services/api.js) para no depender de red real
// ni de minutos reales - la única prueba con datos reales de conocimiento es
// la de operableMonitors() (pura lectura de knowledge/, sin red).
import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { resetDbForTests } from '../db/connection.js';
import { createRouter } from '../api/router.js';
import { createScheduler, operableMonitors } from '../pipeline/scheduler.js';
import { knowledge } from '../knowledge/loader.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('operableMonitors() - Fase FRECUENCIA/Caso 5 y 10', () => {
  test('solo incluye monitores con adaptador real (ckan_api/api_rest_json) y enabled', () => {
    const monitors = operableMonitors();
    assert.ok(monitors.length > 0);
    for (const m of monitors) {
      assert.ok(['ckan_api', 'api_rest_json'].includes(m.method), `${m.id} tiene method=${m.method}, no debería estar en la lista operable`);
      assert.equal(m.enabled, true);
    }
  });

  test('excluye explícitamente los métodos todavía stub (file_download/manual_capture/api_soap/feed) - nunca se presentan como ejecutables', () => {
    const ids = new Set(operableMonitors().map((m) => m.id));
    const stubMonitors = knowledge.monitors().filter((m) => ['file_download', 'manual_capture', 'api_soap', 'feed'].includes(m.method));
    assert.ok(stubMonitors.length > 0, 'la base de conocimiento real debe tener monitores con métodos todavía no implementados');
    for (const m of stubMonitors) assert.ok(!ids.has(m.id), `${m.id} (method=${m.method}) no debe aparecer entre los operables`);
  });

  test('coincide con el conteo verificado en la evaluación de estado (19 monitores reales operables)', () => {
    assert.equal(operableMonitors().length, 19);
  });
});

describe('createScheduler() - ciclo de vida y concurrencia', () => {
  test('Caso 1 - start() activa el scheduler', () => {
    const db = resetDbForTests(':memory:');
    const scheduler = createScheduler(db, { runPipelineFn: async () => ({ runId: 'r1', hadErrors: false }), listOperableMonitors: () => [{ id: 'm1' }] });
    assert.equal(scheduler.getStatus().enabled, false);
    scheduler.start();
    assert.equal(scheduler.getStatus().enabled, true);
    scheduler.stop();
  });

  test('Caso 1b - start() no crea una segunda instancia si ya está activo', () => {
    const db = resetDbForTests(':memory:');
    let intervalCalls = 0;
    const realSetInterval = global.setInterval;
    global.setInterval = (...args) => { intervalCalls += 1; return realSetInterval(...args); };
    try {
      const scheduler = createScheduler(db, { runPipelineFn: async () => ({ runId: 'r1', hadErrors: false }) });
      scheduler.start();
      scheduler.start();
      scheduler.start();
      assert.equal(intervalCalls, 1, 'setInterval solo debe crearse una vez aunque start() se llame varias veces');
      scheduler.stop();
    } finally {
      global.setInterval = realSetInterval;
    }
  });

  test('Caso 2 - stop() desactiva el scheduler', () => {
    const db = resetDbForTests(':memory:');
    const scheduler = createScheduler(db, { runPipelineFn: async () => ({ runId: 'r1', hadErrors: false }) });
    scheduler.start();
    scheduler.stop();
    assert.equal(scheduler.getStatus().enabled, false);
  });

  test('Caso 3 - triggerNow() dispara una ejecución real del runPipelineFn inyectado, con los monitores operables', async () => {
    const db = resetDbForTests(':memory:');
    const calls = [];
    const scheduler = createScheduler(db, {
      runPipelineFn: async (_db, jobs, opts) => { calls.push({ jobs, opts }); return { runId: 'r1', hadErrors: false }; },
      listOperableMonitors: () => [{ id: 'fake::monitor-1' }, { id: 'fake::monitor-2' }],
    });
    await scheduler.triggerNow();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].opts.mode, 'live');
    assert.deepEqual(calls[0].jobs.map((j) => j.monitorId), ['fake::monitor-1', 'fake::monitor-2']);
  });

  test('Caso 4 - no permite ejecuciones concurrentes: una segunda invocación mientras la primera sigue activa se omite', async () => {
    const db = resetDbForTests(':memory:');
    const first = deferred();
    let callCount = 0;
    const scheduler = createScheduler(db, {
      runPipelineFn: async () => { callCount += 1; return first.promise; },
      listOperableMonitors: () => [{ id: 'fake::monitor' }],
    });

    const p1 = scheduler.triggerNow();
    assert.equal(scheduler.getStatus().state, 'running');
    const p2 = scheduler.triggerNow(); // debe omitirse, no llamar runPipelineFn de nuevo

    await p2;
    assert.equal(callCount, 1, 'runPipelineFn no debe invocarse una segunda vez mientras la primera corrida sigue activa');
    assert.equal(scheduler.getStatus().skipped_overlap_count, 1);

    first.resolve({ runId: 'r1', hadErrors: false });
    await p1;
    assert.equal(scheduler.getStatus().state, 'idle');
  });

  test('Caso 6 - un resultado con hadErrors=true (fallo parcial de un monitor) no interrumpe el ciclo ni deja el scheduler bloqueado', async () => {
    const db = resetDbForTests(':memory:');
    const scheduler = createScheduler(db, {
      runPipelineFn: async () => ({ runId: 'r1', hadErrors: true, stats: {} }),
      listOperableMonitors: () => [{ id: 'fake::monitor' }],
    });
    await scheduler.triggerNow();
    assert.equal(scheduler.getStatus().state, 'idle');
    assert.equal(scheduler.getStatus().last_run_id, 'r1');
    assert.equal(scheduler.getStatus().last_error, null, 'hadErrors=true es un resultado válido del pipeline, no un error del scheduler');
    // una segunda corrida debe poder dispararse con normalidad después de una con errores parciales
    await scheduler.triggerNow();
    assert.equal(scheduler.getStatus().state, 'idle');
  });

  test('Caso 7 - estado running/idle y failed real: un fallo no anticipado del runPipelineFn marca la corrida "running" en curso como failed', async () => {
    const db = resetDbForTests(':memory:');
    // Simula exactamente lo que runPipeline() hace al empezar (startRun) -
    // el scheduler no conoce el runId hasta que la promesa resuelve, así que
    // su red de seguridad opera sobre "cualquier corrida que haya quedado en
    // running", igual que documentado en scheduler.js.
    db.prepare("INSERT INTO pipeline_runs (id, mode, started_at, status) VALUES ('run-atascado', 'live', datetime('now'), 'running')").run();

    const scheduler = createScheduler(db, {
      runPipelineFn: async () => { throw new Error('fallo no anticipado, fuera del try/catch por job del orquestador'); },
      listOperableMonitors: () => [{ id: 'fake::monitor' }],
    });

    await scheduler.triggerNow();
    assert.equal(scheduler.getStatus().state, 'idle', 'el scheduler debe volver a idle incluso tras un fallo');
    assert.match(scheduler.getStatus().last_error, /fallo no anticipado/);

    const row = db.prepare("SELECT status FROM pipeline_runs WHERE id = 'run-atascado'").get();
    assert.equal(row.status, 'failed', 'la corrida que quedó "running" debe quedar marcada failed, nunca fantasma');
  });

  test('Caso 8 - shutdown (stop) libera el timer: tras detenerlo, avanzar el reloj no dispara más ticks', () => {
    mock.timers.enable({ apis: ['setInterval'] });
    try {
      const db = resetDbForTests(':memory:');
      let ticks = 0;
      const scheduler = createScheduler(db, {
        intervalMs: 1000,
        runPipelineFn: async () => { ticks += 1; return { runId: 'r' + ticks, hadErrors: false }; },
        listOperableMonitors: () => [{ id: 'fake::monitor' }],
      });
      scheduler.start();
      mock.timers.tick(1000);
      assert.equal(ticks, 1);
      scheduler.stop();
      mock.timers.tick(5000);
      assert.equal(ticks, 1, 'ningún tick adicional debe dispararse después de stop()');
    } finally {
      mock.timers.reset();
    }
  });
});

describe('Ejecución manual (Fase API/Caso 9) - POST /pipeline/run sigue funcionando exactamente igual, con o sin scheduler', () => {
  test('sin scheduler adjunto (createRouter(db), igual que antes de esta etapa)', async () => {
    const db = resetDbForTests(':memory:');
    const handle = createRouter(db);
    const server = createServer((req, res) => handle(req, res));
    await new Promise((resolve) => server.listen(0, resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try {
      const res = await fetch(`${baseUrl}/pipeline/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'fixture', jobs: [{ monitorId: 'fao-giews-amis::principal', fixtureFile: 'soja-precio.t1.json', context: { originActivityId: 'cultivo-soja', originRamificationId: 'soja', indicator: 'precio-soja-fao-amis', topicId: 'precios', kind: 'indicator' } }] }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.run_id);

      const statusRes = await fetch(`${baseUrl}/pipeline/status`);
      const status = await statusRes.json();
      assert.equal(status.scheduler, null, 'sin scheduler adjunto, /pipeline/status no debe inventar un bloque scheduler');
      assert.equal(status.last_run.id, body.run_id);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('con scheduler adjunto, GET /pipeline/status expone su estado sin romper el shape existente (last_run intacto)', async () => {
    const db = resetDbForTests(':memory:');
    const scheduler = createScheduler(db, { runPipelineFn: async () => ({ runId: 'r1', hadErrors: false }), listOperableMonitors: () => [{ id: 'm1' }, { id: 'm2' }] });
    const handle = createRouter(db, { scheduler });
    const server = createServer((req, res) => handle(req, res));
    await new Promise((resolve) => server.listen(0, resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try {
      const res = await fetch(`${baseUrl}/pipeline/status`);
      const body = await res.json();
      assert.equal(body.last_run, null);
      assert.equal(body.scheduler.enabled, false);
      assert.equal(body.scheduler.state, 'idle');
      assert.equal(body.scheduler.operable_monitor_count, 2);

      // la ejecución manual sigue funcionando con normalidad aunque haya un scheduler adjunto
      const runRes = await fetch(`${baseUrl}/pipeline/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'fixture', jobs: [{ monitorId: 'fao-giews-amis::principal', fixtureFile: 'soja-precio.t1.json', context: { originActivityId: 'cultivo-soja', originRamificationId: 'soja', indicator: 'precio-soja-fao-amis', topicId: 'precios', kind: 'indicator' } }] }),
      });
      assert.equal(runRes.status, 200);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
