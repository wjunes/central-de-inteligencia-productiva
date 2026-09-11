// acquire(): decide si corresponde volver a consultar una fuente (cache/
// reuso por frecuencia, prompt seccion 7) y persiste la captura.
import { randomUUID } from 'node:crypto';
import { adapters } from './adapters.js';
import { knowledge } from '../../knowledge/loader.js';

export const FREQUENCY_MS = {
  realtime: 0,
  hourly: 60 * 60 * 1000,
  every_3_hours: 3 * 60 * 60 * 1000,
  every_6_hours: 6 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
  quarterly: 90 * 24 * 60 * 60 * 1000,
  annual: 365 * 24 * 60 * 60 * 1000,
  event_driven: 0,   // no hay cadencia fija: siempre elegible, la novedad la define change detection
  manual: 7 * 24 * 60 * 60 * 1000,
};

function lastCapture(db, monitorId) {
  const row = db
    .prepare('SELECT * FROM captures WHERE monitor_id = ? ORDER BY captured_at DESC LIMIT 1')
    .get(monitorId);
  return row ?? null;
}

// Decide si hay que (re)adquirir. No se reimplementa la tabla de frecuencias
// de monitoring/frequencies.json: se interpreta directamente el campo
// monitor.frequency ya calculado en knowledge/monitoring/monitors.json.
export function isDue(db, monitor, { force = false } = {}) {
  if (force) return true;
  const prev = lastCapture(db, monitor.id);
  if (!prev) return true;
  const intervalMs = FREQUENCY_MS[monitor.frequency] ?? 0;
  if (intervalMs === 0) return true; // event_driven/realtime: siempre elegible
  const elapsed = Date.now() - new Date(prev.captured_at).getTime();
  return elapsed >= intervalMs;
}

export async function acquire(db, runId, monitor, { force = false, fixturePath = null } = {}) {
  const source = knowledge.sourceById(monitor.source_id);
  if (!source) {
    throw new Error(`acquire: source_id desconocido '${monitor.source_id}' (no existe en knowledge/sources/sources.json)`);
  }

  if (!isDue(db, monitor, { force }) && !fixturePath) {
    const prev = lastCapture(db, monitor.id);
    return { skipped: true, reason: 'not_due', reused_capture: prev };
  }

  const adapterFn = fixturePath ? adapters.fixture : adapters[monitor.method];
  if (!adapterFn) throw new Error(`acquire: adaptador desconocido '${monitor.method}'`);

  const result = fixturePath
    ? await adapterFn(monitor, source, { fixturePath })
    : await adapterFn(monitor, source, {});

  const id = randomUUID();
  const capturedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO captures (id, run_id, source_id, monitor_id, resource_id, captured_at, parameters, status, response_hash, version, size_bytes, latency_ms, error, normalized_data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    runId,
    monitor.source_id,
    monitor.id,
    monitor.resource_id ?? null,
    capturedAt,
    JSON.stringify({ fixturePath }),
    result.status,
    result.hash ?? null,
    null,
    result.size_bytes ?? null,
    result.latency_ms ?? null,
    result.error ?? null,
    result.normalized ? JSON.stringify(result.normalized) : null
  );

  return { skipped: false, capture: { id, run_id: runId, monitor_id: monitor.id, source_id: monitor.source_id, captured_at: capturedAt, ...result } };
}
