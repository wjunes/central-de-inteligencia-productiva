// Orquestador central (prompt seccion 5). Cada etapa esta desacoplada
// (modulos separados en data/, core/, intelligence/, decision/); este
// archivo solo coordina el orden y persiste el resultado de la ejecucion
// (pipeline_runs, errors) - nunca ejecuta el pipeline "por usuario" (seccion 6).
import { randomUUID } from 'node:crypto';
import { knowledge } from '../knowledge/loader.js';
import { acquire } from '../data/acquisition/capture.js';
import { normalize } from '../data/normalization/normalize.js';
import { validate } from '../data/validation/validate.js';
import { detectChanges } from '../data/updates/change-detection.js';
import { generateSignal } from '../intelligence/signals/signals.js';
import { isApplicable as isTabularApplicable, toRecords, persistNormalized } from '../data/normalization/tabular.js';
import { isApplicable as isScalarApplicable, extractValue } from '../data/normalization/scalar.js';
import { isApplicable as isSelectionApplicable, select } from '../data/normalization/selection.js';
import { calculateRelevance } from '../core/relevance/relevance-engine.js';
import { generateIntelligenceUnit } from '../intelligence/analysis/intelligence.js';
import { evaluateDecision } from '../decision/decision.js';
import { generateRecommendation } from '../intelligence/recommendations/recommendations.js';

function startRun(db, mode) {
  const id = randomUUID();
  db.prepare('INSERT INTO pipeline_runs (id, mode, started_at, status) VALUES (?, ?, ?, ?)').run(id, mode, new Date().toISOString(), 'running');
  return id;
}

function finishRun(db, runId, status, stats) {
  db.prepare(
    `UPDATE pipeline_runs SET finished_at = ?, status = ?, records_processed = ?, changes_detected = ?, signals_generated = ?, intelligence_generated = ?, decisions_generated = ?, recommendations_generated = ? WHERE id = ?`
  ).run(new Date().toISOString(), status, stats.records_processed, stats.changes_detected, stats.signals_generated, stats.intelligence_generated, stats.decisions_generated, stats.recommendations_generated, runId);
}

function logError(db, runId, stage, errorType, message, detail) {
  db.prepare('INSERT INTO errors (id, run_id, stage, error_type, message, detail, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    randomUUID(), runId, stage, errorType, message, detail ? JSON.stringify(detail) : null, new Date().toISOString()
  );
}

function lastCaptureBefore(db, monitorId, captureId) {
  return db.prepare('SELECT * FROM captures WHERE monitor_id = ? AND id != ? ORDER BY captured_at DESC LIMIT 1').get(monitorId, captureId);
}

function hasMonitoringResourceFor(activityId) {
  return knowledge.monitors().some((m) => {
    const source = knowledge.sourceById(m.source_id);
    return source?.activities?.includes(activityId);
  });
}

// job = { monitorId, fixturePath?, force?, context: { originActivityId, originRamificationId, indicator, topicId, kind, conflicting?, conditionText? } }
// NOTA: context ya NO acepta profileContext (ver core/relevance/relevance-engine.js:
// el pipeline central no conoce perfiles - la personalizacion ocurre en
// core/profile/personalize.js, sobre datos ya generados aqui).
export async function runPipeline(db, jobs, { mode = 'fixture' } = {}) {
  const runId = startRun(db, mode);
  const stats = { records_processed: 0, changes_detected: 0, signals_generated: 0, intelligence_generated: 0, decisions_generated: 0, recommendations_generated: 0 };
  const outputs = { captures: [], changes: [], signals: [], relevance: [], intelligence: [], decisions: [], recommendations: [] };
  let hadErrors = false;

  for (const job of jobs) {
    const { monitorId, fixturePath, force = false, context = {} } = job;
    try {
      const monitor = knowledge.monitorById(monitorId);
      if (!monitor) throw new Error(`monitor desconocido: ${monitorId}`);

      const acqResult = await acquire(db, runId, monitor, { force, fixturePath });
      if (acqResult.skipped) {
        stats.records_processed += 1;
        continue; // reuso por frecuencia (prompt seccion 7): no se cuenta como cambio
      }
      const capture = acqResult.capture;
      capture.normalized = normalize(capture.normalized);
      outputs.captures.push(capture);
      stats.records_processed += 1;

      if (capture.status === 'ok' || capture.status === 'fixture') {
        const kind = context.kind ?? 'indicator';
        const validation = validate(capture.normalized, { kind });
        if (!validation.valid) {
          logError(db, runId, 'validate', 'validation_error', validation.errors.join('; '), { monitorId });
          hadErrors = true;
          continue;
        }

        // Bloque G: si la captura es una tabla CSV (Bloque E) Y el monitor
        // tiene una record_key curada (Bloque F/G, ver monitors.json), se
        // convierte a { records: [...] } - la forma que
        // change-detection.js#recordDiff() ya sabe leer, sin tocar ese
        // archivo. Para cualquier otro caso (raw_json/dataset_list/indicator,
        // o un csv_table SIN record_key curada - mgap-snig/dgi hoy) esto no
        // hace nada: capture.normalized sigue exactamente igual que antes.
        if (isTabularApplicable(capture.normalized, monitor)) {
          try {
            capture.normalized = toRecords(capture.normalized, monitor.change_detection.record_key);
            persistNormalized(db, capture.id, capture.normalized);
          } catch (err) {
            logError(db, runId, 'normalize', 'validation_error', err.message, { monitorId });
            hadErrors = true;
            continue;
          }
        } else if (isScalarApplicable(capture.normalized, monitor)) {
          // Bloque L: si la captura es una tabla CSV Y el monitor declara
          // monitoring_definition.value_field (curado por evidencia real),
          // se extrae el valor escalar hacia la forma {kind:'indicator',
          // indicator, value} que change-detection.js#valueComparison() YA
          // sabe leer (mismo contrato de los monitores ckan_api/api_rest_json
          // existentes) - sin tocar ese archivo. mutuamente excluyente con la
          // rama record_diff de arriba (un monitor declara record_key O
          // value_field, nunca ambos hoy).
          try {
            // Bloque N: si ADEMAS el monitor declara monitoring_definition.
            // selection (curado por evidencia real, ver dgi::principal en
            // Bloque M), el csv_table de N filas se reduce a EXACTAMENTE 1
            // fila (por valor de la columna declarada, nunca por posicion)
            // ANTES de extractValue() - que sigue exigiendo 1 sola fila
            // exactamente igual que en Bloque L, sin saber nada de
            // estrategias temporales. Sin selection declarada, este paso no
            // hace nada (comportamiento de Bloque L intacto).
            let scalarInput = capture.normalized;
            if (isSelectionApplicable(scalarInput, monitor)) {
              scalarInput = select(scalarInput, monitor.monitoring_definition.selection);
            }
            capture.normalized = extractValue(scalarInput, monitor);
            persistNormalized(db, capture.id, capture.normalized);
          } catch (err) {
            logError(db, runId, 'normalize', 'validation_error', err.message, { monitorId });
            hadErrors = true;
            continue;
          }
        }
      }

      const previousCapture = lastCaptureBefore(db, monitorId, capture.id);
      const change = detectChanges(db, runId, monitor, capture, previousCapture);
      outputs.changes.push(change);
      stats.changes_detected += 1;

      const signalResult = generateSignal(db, runId, change, monitor, context);
      if (!signalResult.created) continue;
      outputs.signals.push(signalResult.signal);
      stats.signals_generated += 1;

      const relevanceResults = calculateRelevance(db, runId, signalResult.signal);
      outputs.relevance.push(...relevanceResults);

      const source = knowledge.sourceById(monitor.source_id);
      for (const rel of relevanceResults) {
        let originCategory = null;
        if (rel.factor === 'direct_dependency' && context.originRamificationId) {
          const node = knowledge.findRamificationNode(context.originActivityId, context.originRamificationId);
          originCategory = node?.category ?? null;
        }
        const intel = generateIntelligenceUnit(db, runId, rel, signalResult.signal, monitor, source, { originCategory });
        outputs.intelligence.push(intel);
        stats.intelligence_generated += 1;

        const decResult = evaluateDecision(db, runId, intel, { reversibility: context.reversibility });
        if (!decResult.created) continue;
        outputs.decisions.push(decResult.decision);
        stats.decisions_generated += 1;

        const recResult = generateRecommendation(db, runId, decResult.decision, intel, {
          hasMonitoringResource: hasMonitoringResourceFor(intel.activity_id),
          conflicting: Boolean(context.conflicting),
          conditionText: context.conditionText,
          hasMagnitude: signalResult.signal.signal_type === 'cambio-significativo',
        });
        if (recResult.created) {
          outputs.recommendations.push(recResult.recommendation);
          stats.recommendations_generated += 1;
        }
      }
    } catch (err) {
      hadErrors = true;
      logError(db, runId, 'pipeline', 'technical_error', err.message, { job: { monitorId: job.monitorId } });
    }
  }

  finishRun(db, runId, hadErrors ? 'completed_with_errors' : 'completed', stats);
  return { runId, stats, outputs, hadErrors };
}
