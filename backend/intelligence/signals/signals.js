// generateSignals(): interpreta knowledge/signals/rules.json. CAMBIO != SEÑAL:
// no todo change_class se convierte en señal, y valor_modificado exige un
// umbral configurado (backend/config/thresholds.json) - si no existe, el
// resultado es pending_threshold, nunca un umbral inventado.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { knowledge } from '../../knowledge/loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const THRESHOLDS_PATH = join(__dirname, '..', '..', 'config', 'thresholds.json');
const thresholdConfig = JSON.parse(readFileSync(THRESHOLDS_PATH, 'utf-8'));

const EXCLUDED_CLASSES = new Set(['sin_cambio', 'fuente_no_disponible', 'error_de_adquisicion']);

function findThreshold(activityId, indicator) {
  return thresholdConfig.overrides.find((o) => o.activity_id === activityId && o.indicator === indicator) ?? null;
}

function magnitudeOutcome(change, context) {
  const threshold = findThreshold(context.originActivityId, context.indicator);
  if (!threshold) return { outcome: 'pending_threshold' };
  const prev = Number(change.previous_value);
  const curr = Number(change.new_value);
  if (!Number.isFinite(prev) || prev === 0 || !Number.isFinite(curr)) {
    return { outcome: 'pending_threshold', reason: 'valor previo no numerico o cero: no se puede calcular variacion porcentual' };
  }
  const pct = Math.abs((curr - prev) / prev) * 100;
  if (threshold.threshold_type === 'percentage_threshold' && pct >= threshold.value) {
    return { outcome: 'signal', direction: curr > prev ? 'increase' : 'decrease', magnitude_pct: pct, threshold };
  }
  return { outcome: 'no_signal', magnitude_pct: pct, threshold };
}

// context: { originActivityId, originRamificationId, indicator, topicId, sourceId, monitorId }
export function evaluateSignalRule(change, monitor, context) {
  if (EXCLUDED_CLASSES.has(change.change_class)) {
    return { outcome: 'no_signal', reason: `${change.change_class} es un evento tecnico/nulo, no productivo` };
  }

  if (change.change_class === 'valor_modificado') {
    // Bloque H3: record_diff produce valor_modificado cuando un REGISTRO
    // existente cambio de contenido (comparacion de objetos completos, ver
    // recordDiff() en change-detection.js) - no hay un unico valor escalar
    // ni un indicador que magnitudeOutcome() pueda evaluar (no fue diseñada
    // para esto: exige context.indicator + un threshold numerico que
    // record_diff nunca declara). Es un cambio ESTRUCTURAL (que campos
    // cambiaron), no CUANTITATIVO (cuanto cambio un numero) - se reutiliza
    // el mismo signal_type ya usado para otros cambios estructurales
    // (cambio_de_contenido/estructura_modificada, mas abajo), sin inventar
    // threshold, indicator ni porcentaje de variacion.
    if (monitor.change_detection.method === 'record_diff') {
      return { outcome: 'signal', signal_type: 'cambio-estructural' };
    }
    return magnitudeOutcome(change, context);
  }

  if (change.change_class === 'nuevo_registro') {
    if (monitor.change_detection.method === 'new_document_detection') {
      return { outcome: 'signal', signal_type: 'nuevo-elemento' };
    }
    return { outcome: 'signal', signal_type: 'nuevo-elemento', requires_grouping: true };
  }

  if (change.change_class === 'registro_eliminado') {
    return { outcome: 'signal', signal_type: 'elemento-retirado' };
  }

  if (change.change_class === 'cambio_de_contenido') {
    if (monitor.change_detection.method === 'hash_comparison') {
      return { outcome: 'pending_validation', reason: 'hash_comparison no distingue cambio sustantivo de cosmetico' };
    }
    return { outcome: 'signal', signal_type: 'cambio-estructural' };
  }

  if (change.change_class === 'estructura_modificada') {
    return { outcome: 'signal', signal_type: 'cambio-estructural' };
  }

  return { outcome: 'no_signal', reason: `change_class no manejado: ${change.change_class}` };
}

// Bloque H2: identidad determinista del REGISTRO/evento afectado, para
// dedup_key. Antes, cuando change.new_value era undefined (siempre el caso
// para record_diff), se usaba `change.detail` (un objeto) directo en un
// template string - la interpolacion lo colapsa SIEMPRE a la cadena literal
// "[object Object]", sin importar su contenido real: dos altas/bajas/
// modificaciones distintas del mismo monitor terminaban con el MISMO
// dedup_key (la segunda se trataba como repeticion de la primera). No se usa
// JSON.stringify(detail) directo (el orden de un array construido
// dinamicamente - ver recordDiff() - no esta garantizado): se ordena
// explicitamente cada lista de claves antes de unirla, para que la MISMA
// entrada produzca siempre la MISMA identidad y entradas distintas produzcan
// identidades distintas.
function structuralIdentity(detail) {
  if (!detail || typeof detail !== 'object') return null;
  const recordKeys = detail.newKeys ?? detail.removedKeys ?? detail.modified ?? null;
  if (Array.isArray(recordKeys)) return [...recordKeys].sort().join(',');
  if (typeof detail.currKeys === 'string' || typeof detail.prevKeys === 'string') {
    return `${detail.prevKeys ?? ''}=>${detail.currKeys ?? ''}`;
  }
  return null;
}

function eventIdentity(change) {
  if (change.new_value != null) return String(change.new_value);
  const structural = structuralIdentity(change.detail);
  if (structural != null) return structural;
  return 'na';
}

function signalTypeForOutcome(outcome, evaluation) {
  if (evaluation.outcome === 'signal' && evaluation.signal_type) return evaluation.signal_type;
  if (evaluation.outcome === 'signal') return 'cambio-significativo';
  return null;
}

// Deduplicacion (signals/rules.json.deduplication): misma clave activa dentro
// de la ventana -> se trata como persistencia, no una señal nueva.
function findActiveSignalByDedupKey(db, dedupKey) {
  return db.prepare("SELECT * FROM signals WHERE dedup_key = ? AND status != 'dismissed' ORDER BY detected_at DESC LIMIT 1").get(dedupKey);
}

export function generateSignal(db, runId, change, monitor, context) {
  const evaluation = evaluateSignalRule(change, monitor, context);

  if (evaluation.outcome !== 'signal') {
    return { created: false, evaluation };
  }

  const direction = evaluation.direction ?? (change.change_class === 'nuevo_registro' ? 'new' : change.change_class === 'registro_eliminado' ? 'removed' : 'unknown');
  // Clave = (monitor_id, indicador, período comparado, dirección) - knowledge/signals/rules.json.deduplication.
  // 'período comparado' se aproxima con el nuevo valor/documento observado: una
  // repetición EXACTA de la misma captura (mismo new_value) dedupe correctamente
  // (idempotencia), pero una 2da/3ra suba consecutiva con un valor DISTINTO,
  // aunque comparta dirección, es una observación nueva - no debe colapsarse
  // (necesario para poder confirmar una tendencia con >1 observación, ver radar/trend.js).
  const period = eventIdentity(change);
  const dedupKey = `${monitor.id}|${context.indicator ?? context.originRamificationId ?? 'na'}|${change.change_class}|${direction}|${period}`;

  const existing = findActiveSignalByDedupKey(db, dedupKey);
  if (existing) {
    db.prepare("UPDATE signals SET status = 'active' WHERE id = ?").run(existing.id);
    return { created: false, persisted: existing, evaluation, dedupKey };
  }

  const id = randomUUID();
  const detectedAt = new Date().toISOString();
  const signalType = signalTypeForOutcome(evaluation.outcome, evaluation);
  db.prepare(
    `INSERT INTO signals (id, run_id, change_id, signal_type, topic_id, direction, origin_activity_id, origin_ramification_id, source_id, monitor_id, detected_at, dedup_key, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, runId, change.id, signalType, context.topicId ?? null, direction,
    context.originActivityId ?? null, context.originRamificationId ?? null,
    context.sourceId ?? monitor.source_id, monitor.id, detectedAt, dedupKey, 'detected'
  );

  return {
    created: true,
    signal: { id, run_id: runId, change_id: change.id, signal_type: signalType, topic_id: context.topicId ?? null, direction, origin_activity_id: context.originActivityId ?? null, origin_ramification_id: context.originRamificationId ?? null, source_id: context.sourceId ?? monitor.source_id, monitor_id: monitor.id, detected_at: detectedAt, dedup_key: dedupKey },
    evaluation,
  };
}
