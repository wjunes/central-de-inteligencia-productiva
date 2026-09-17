// Bloque H2/H3 - identidad determinista de eventos (dedup_key) y tratamiento
// de valor_modificado proveniente de record_diff. Pruebas directas sobre
// intelligence/signals/signals.js#generateSignal(), con objetos `change`
// sintéticos (no requieren pipeline completo) - complementan las pruebas de
// integración de csv-change-detection.test.js (Bloque G, actualizadas en
// este bloque para reflejar el comportamiento ya corregido).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resetDbForTests } from '../db/connection.js';
import { generateSignal } from '../intelligence/signals/signals.js';

const RECORD_DIFF_MONITOR = { id: 'test::record-diff-monitor', source_id: 'test-source', change_detection: { method: 'record_diff' } };

function insertRunningRun(db) {
  const runId = randomUUID();
  db.prepare("INSERT INTO pipeline_runs (id, mode, started_at, status) VALUES (?, 'fixture', datetime('now'), 'running')").run(runId);
  return runId;
}

// generateSignal() inserta en `signals` con FK real hacia `changes` (y
// `changes` hacia `captures`) - se insertan filas mínimas reales para poder
// probar generateSignal() de forma aislada sin correr todo runPipeline().
function change(db, runId, overrides) {
  const captureId = randomUUID();
  db.prepare(
    "INSERT INTO captures (id, run_id, source_id, monitor_id, captured_at, status) VALUES (?, ?, 'test-source', 'test::record-diff-monitor', datetime('now'), 'fixture')"
  ).run(captureId, runId);
  const id = randomUUID();
  db.prepare(
    "INSERT INTO changes (id, run_id, capture_id, monitor_id, change_class, detected_at, previous_value, new_value, detail) VALUES (?, ?, ?, 'test::record-diff-monitor', ?, datetime('now'), ?, ?, ?)"
  ).run(id, runId, captureId, overrides.change_class ?? 'sin_cambio', overrides.previous_value ?? null, overrides.new_value ?? null, overrides.detail ? JSON.stringify(overrides.detail) : null);
  return { id, change_class: 'sin_cambio', ...overrides };
}

describe('Bloque H4 - Deduplicación (1-5)', () => {
  test('1 - registro A nuevo -> signal', () => {
    const db = resetDbForTests(':memory:');
    const runId = insertRunningRun(db);
    const changeA = change(db, runId, { change_class: 'nuevo_registro', detail: { newKeys: ['A'] } });
    const result = generateSignal(db, runId, changeA, RECORD_DIFF_MONITOR, {});
    assert.equal(result.created, true);
    assert.equal(result.signal.signal_type, 'nuevo-elemento');
  });

  test('2 - registro B diferente nuevo -> segunda signal (distinta de A)', () => {
    const db = resetDbForTests(':memory:');
    const runId = insertRunningRun(db);
    const changeA = change(db, runId, { change_class: 'nuevo_registro', detail: { newKeys: ['A'] } });
    const changeB = change(db, runId, { change_class: 'nuevo_registro', detail: { newKeys: ['B'] } });
    const rA = generateSignal(db, runId, changeA, RECORD_DIFF_MONITOR, {});
    const rB = generateSignal(db, runId, changeB, RECORD_DIFF_MONITOR, {});
    assert.equal(rA.created, true);
    assert.equal(rB.created, true);
    assert.notEqual(rA.signal.dedup_key, rB.signal.dedup_key);
  });

  test('3 - repetición exacta de A -> no crea una nueva signal (se reactiva la existente)', () => {
    const db = resetDbForTests(':memory:');
    const runId = insertRunningRun(db);
    const changeA1 = change(db, runId, { change_class: 'nuevo_registro', detail: { newKeys: ['A'] } });
    const changeA2 = change(db, runId, { change_class: 'nuevo_registro', detail: { newKeys: ['A'] } });
    const r1 = generateSignal(db, runId, changeA1, RECORD_DIFF_MONITOR, {});
    const r2 = generateSignal(db, runId, changeA2, RECORD_DIFF_MONITOR, {});
    assert.equal(r1.created, true);
    assert.equal(r2.created, false);
    assert.equal(r2.persisted.id, r1.signal.id);
    const count = db.prepare('SELECT COUNT(*) as c FROM signals').get().c;
    assert.equal(count, 1);
  });

  test('4 - repetición exacta de B -> no crea una nueva signal', () => {
    const db = resetDbForTests(':memory:');
    const runId = insertRunningRun(db);
    const changeB1 = change(db, runId, { change_class: 'nuevo_registro', detail: { newKeys: ['B'] } });
    const changeB2 = change(db, runId, { change_class: 'nuevo_registro', detail: { newKeys: ['B'] } });
    const r1 = generateSignal(db, runId, changeB1, RECORD_DIFF_MONITOR, {});
    const r2 = generateSignal(db, runId, changeB2, RECORD_DIFF_MONITOR, {});
    assert.equal(r1.created, true);
    assert.equal(r2.created, false);
  });

  test('5 - A y B tienen dedup_key diferentes, verificado explícitamente en la fila persistida', () => {
    const db = resetDbForTests(':memory:');
    const runId = insertRunningRun(db);
    generateSignal(db, runId, change(db, runId, { change_class: 'nuevo_registro', detail: { newKeys: ['A'] } }), RECORD_DIFF_MONITOR, {});
    generateSignal(db, runId, change(db, runId, { change_class: 'nuevo_registro', detail: { newKeys: ['B'] } }), RECORD_DIFF_MONITOR, {});
    const keys = db.prepare('SELECT dedup_key FROM signals ORDER BY dedup_key').all().map((r) => r.dedup_key);
    assert.equal(keys.length, 2);
    assert.notEqual(keys[0], keys[1]);
    assert.ok(keys[0].endsWith('|A') || keys[0].endsWith('|B'));
  });

  test('identidad no depende del orden en que aparecen las claves nuevas (determinismo real)', () => {
    const db = resetDbForTests(':memory:');
    const runId = insertRunningRun(db);
    const c1 = change(db, runId, { change_class: 'nuevo_registro', detail: { newKeys: ['B', 'A'] } });
    const c2 = change(db, runId, { change_class: 'nuevo_registro', detail: { newKeys: ['A', 'B'] } });
    const r1 = generateSignal(db, runId, c1, RECORD_DIFF_MONITOR, {});
    const r2 = generateSignal(db, runId, c2, RECORD_DIFF_MONITOR, {});
    assert.equal(r1.created, true);
    assert.equal(r2.created, false, 'mismo conjunto de claves (distinto orden de aparición) -> misma identidad, no una señal nueva');
  });
});

describe('Bloque H4 - record_diff (6-11)', () => {
  test('6 - sin_cambio nunca genera señal (excluido antes de calcular identidad)', () => {
    const db = resetDbForTests(':memory:');
    const runId = insertRunningRun(db);
    const result = generateSignal(db, runId, change(db, runId, { change_class: 'sin_cambio' }), RECORD_DIFF_MONITOR, {});
    assert.equal(result.created, false);
    assert.equal(result.evaluation.outcome, 'no_signal');
  });

  test('7 - alta de registro -> signal (nuevo-elemento)', () => {
    const db = resetDbForTests(':memory:');
    const runId = insertRunningRun(db);
    const result = generateSignal(db, runId, change(db, runId, { change_class: 'nuevo_registro', detail: { newKeys: ['X'] } }), RECORD_DIFF_MONITOR, {});
    assert.equal(result.created, true);
    assert.equal(result.signal.signal_type, 'nuevo-elemento');
    assert.equal(result.signal.direction, 'new');
  });

  test('8 - baja de registro -> signal (elemento-retirado)', () => {
    const db = resetDbForTests(':memory:');
    const runId = insertRunningRun(db);
    const result = generateSignal(db, runId, change(db, runId, { change_class: 'registro_eliminado', detail: { removedKeys: ['X'] } }), RECORD_DIFF_MONITOR, {});
    assert.equal(result.created, true);
    assert.equal(result.signal.signal_type, 'elemento-retirado');
    assert.equal(result.signal.direction, 'removed');
  });

  test('9 - modificación de registro -> valor_modificado, signal estructural (sin magnitud/threshold/indicator inventados)', () => {
    const db = resetDbForTests(':memory:');
    const runId = insertRunningRun(db);
    const result = generateSignal(db, runId, change(db, runId, { change_class: 'valor_modificado', detail: { modified: ['X'] } }), RECORD_DIFF_MONITOR, {});
    assert.equal(result.created, true);
    assert.equal(result.signal.signal_type, 'cambio-estructural');
  });

  test('10 - dos modificaciones de registros distintos no colisionan', () => {
    const db = resetDbForTests(':memory:');
    const runId = insertRunningRun(db);
    const r1 = generateSignal(db, runId, change(db, runId, { change_class: 'valor_modificado', detail: { modified: ['X'] } }), RECORD_DIFF_MONITOR, {});
    const r2 = generateSignal(db, runId, change(db, runId, { change_class: 'valor_modificado', detail: { modified: ['Y'] } }), RECORD_DIFF_MONITOR, {});
    assert.equal(r1.created, true);
    assert.equal(r2.created, true);
    assert.notEqual(r1.signal.dedup_key, r2.signal.dedup_key);
  });

  test('11 - una misma modificación repetida queda deduplicada', () => {
    const db = resetDbForTests(':memory:');
    const runId = insertRunningRun(db);
    const r1 = generateSignal(db, runId, change(db, runId, { change_class: 'valor_modificado', detail: { modified: ['X'] } }), RECORD_DIFF_MONITOR, {});
    const r2 = generateSignal(db, runId, change(db, runId, { change_class: 'valor_modificado', detail: { modified: ['X'] } }), RECORD_DIFF_MONITOR, {});
    assert.equal(r1.created, true);
    assert.equal(r2.created, false);
    const count = db.prepare('SELECT COUNT(*) as c FROM signals').get().c;
    assert.equal(count, 1);
  });
});

describe('Bloque H3 - value_comparison NO se ve afectado (regresión explícita)', () => {
  test('valor_modificado desde value_comparison sigue pasando por magnitudeOutcome() (pending_threshold sin threshold configurado, igual que siempre)', () => {
    const db = resetDbForTests(':memory:');
    const runId = insertRunningRun(db);
    const monitor = { id: 'test::value-comparison-monitor', source_id: 'test-source', change_detection: { method: 'value_comparison' } };
    const result = generateSignal(
      db, runId,
      change(db, runId, { change_class: 'valor_modificado', previous_value: '100', new_value: '105' }),
      monitor,
      { originActivityId: 'combustibles', indicator: 'un-indicador-sin-threshold-configurado' }
    );
    assert.equal(result.created, false);
    assert.equal(result.evaluation.outcome, 'pending_threshold');
  });
});
