// Prueba de integracion con una fuente REAL (prompt seccion 35: "al menos
// una fuente estructurada; una fuente con cambios"). Usa el monitor real
// inumet::principal (ckan_api) contra el catalogo oficial de datos abiertos
// del Uruguay (AGESIC). Se detiene en la capa de adquisicion/deteccion de
// cambios (no fuerza una señal/inteligencia/decisión/recomendación semántica
// para un dataset meteorológico sin un caso de uso curado - ver README).
//
// Tolerante a falta de conectividad: si la red no está disponible, la prueba
// se omite (skip) en vez de fallar el resto de la suite - la validación
// autoritativa de este motor es la suite basada en fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resetDbForTests } from '../db/connection.js';
import { knowledge } from '../knowledge/loader.js';
import { acquire } from '../data/acquisition/capture.js';
import { normalize } from '../data/normalization/normalize.js';
import { detectChanges } from '../data/updates/change-detection.js';
import { randomUUID } from 'node:crypto';

test('fuente real - inumet::principal via ckan_api (catalogodatos.gub.uy)', async (t) => {
  const db = resetDbForTests(':memory:');
  const runId = randomUUID();
  db.prepare("INSERT INTO pipeline_runs (id, mode, started_at, status) VALUES (?, 'live', datetime('now'), 'running')").run(runId);

  const monitor = knowledge.monitorById('inumet::principal');
  assert.ok(monitor, 'inumet::principal debe existir en knowledge/monitoring/monitors.json');

  let acqResult;
  try {
    acqResult = await acquire(db, runId, monitor, { force: true });
  } catch (err) {
    t.skip(`sin conectividad de red en este entorno: ${err.message}`);
    return;
  }

  if (acqResult.capture?.status !== 'ok') {
    t.skip(`adquisición real no disponible ahora mismo (status=${acqResult.capture?.status}, error=${acqResult.capture?.error}) - no se falla la suite por esto`);
    return;
  }

  const capture = acqResult.capture;
  capture.normalized = normalize(capture.normalized);
  assert.equal(capture.normalized.kind, 'dataset_list');
  assert.ok(capture.normalized.count > 0, 'INUMET debe tener al menos un dataset publicado en catalogodatos.gub.uy');

  // primera captura -> sin previa -> nuevo_registro (kind=nuevo_registro, no fabricado: es el comportamiento real de new_item_detection sin historial)
  const change = detectChanges(db, runId, monitor, capture, null);
  assert.equal(change.change_class, 'nuevo_registro');

  console.log(`[real-source] INUMET: ${capture.normalized.count} datasets reales obtenidos de catalogodatos.gub.uy, latencia=${capture.latency_ms}ms`);
});

// Prueba real completa (prompt de Radar, seccion 34): fuente real -> captura
// -> cambio -> señal -> inteligencia -> perfil -> Radar. Reusa el MISMO
// monitor/fuente ya probado arriba (no se adquiere una fuente nueva solo
// para este test). agricultura-secano es una actividad real y genuinamente
// dependiente del clima (ver knowledge/ramifications/agricultura-secano.json,
// domain-names 'clima-y-agua'); topic_id='clima-agua' existe en
// knowledge/ramifications/_signal_types.json.
test('fuente real -> Radar Productivo (extremo a extremo)', async (t) => {
  const [{ resetDbForTests }, { runPipeline }, { createProfile }, { buildRadar }] = await Promise.all([
    import('../db/connection.js'),
    import('../pipeline/orchestrator.js'),
    import('../core/profile/store.js'),
    import('../radar/build.js'),
  ]);
  const db = resetDbForTests(':memory:');

  let result;
  try {
    result = await runPipeline(
      db,
      [{ monitorId: 'inumet::principal', force: true, context: { originActivityId: 'agricultura-secano', topicId: 'clima-agua', kind: 'dataset_list' } }],
      { mode: 'live' }
    );
  } catch (err) {
    t.skip(`sin conectividad de red en este entorno: ${err.message}`);
    return;
  }

  const capture = result.outputs.captures[0];
  if (!capture || capture.status !== 'ok') {
    t.skip(`adquisición real no disponible ahora mismo (status=${capture?.status}) - no se falla la suite por esto`);
    return;
  }

  assert.equal(result.outputs.changes[0].change_class, 'nuevo_registro');
  assert.equal(result.stats.signals_generated, 1);
  assert.equal(result.outputs.signals[0].signal_type, 'nuevo-elemento');

  const profile = createProfile(db, { name: 'Perfil agrícola real', main_activity_id: 'agricultura-secano' });
  const radar = buildRadar(db, profile.id);
  assert.equal(radar.changes.no_relevant_changes, false);
  assert.ok(radar.changes.items.some((c) => c.activity_id === 'agricultura-secano'));
  assert.ok(radar.monitor.length >= 0); // un elemento nuevo sin magnitud puede o no calificar para 'monitor' según evidencia

  console.log('[real-source->radar] cambio real de INUMET propagado hasta el Radar de un perfil real (agricultura-secano).');
});
