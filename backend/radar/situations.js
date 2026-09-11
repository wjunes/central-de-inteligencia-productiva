// Formación y actualización de 'situaciones' del Radar (prompt seccion 6-7).
// Una situación agrupa >=2 intelligence units relacionados - nunca se crea
// para un elemento aislado (eso sigue siendo un 'cambio', no una 'situación').
// Persistida en radar_situations (solo ids de referencia) porque su ESTADO
// depende de observarla a través de varias corridas, no de una sola consulta.
import { randomUUID } from 'node:crypto';
import { FREQUENCY_MS } from '../data/acquisition/capture.js';
import { knowledge } from '../knowledge/loader.js';

const STATUS_VALUES = ['emerging', 'active', 'persistent', 'resolved'];
// 'weakening' y 'superseded' quedan documentados pero NO se usan en esta
// version: no hay suficiente granularidad temporal en el modelo actual para
// distinguir de forma no arbitraria "debilitándose" de "persistente", y
// 'superseded' ya es un concepto propio de recommendations/, no de una
// situación (una situación se resuelve, no se reemplaza por otra).

function windowMsFor(signals) {
  // La ventana temporal de una situación depende de la frecuencia de sus
  // fuentes (prompt seccion 8: "no imponer una duración universal") - se
  // toma la frecuencia MAS ALTA (menor intervalo) entre sus monitores.
  const monitors = knowledge.monitors();
  const freqs = signals
    .map((s) => monitors.find((m) => m.id === s.monitor_id)?.frequency)
    .filter(Boolean)
    .map((f) => FREQUENCY_MS[f] ?? FREQUENCY_MS.weekly);
  // event_driven/realtime valen 0 en FREQUENCY_MS (siempre elegibles para
  // adquisicion) pero una ventana de 0ms dejaria todo "resuelto" al instante -
  // se usa un piso de 1 dia para esos casos (el evento puede repetirse en
  // cualquier momento, no significa "sin vigencia").
  const positiveFreqs = freqs.filter((f) => f > 0);
  const base = positiveFreqs.length ? Math.min(...positiveFreqs) : FREQUENCY_MS.daily || 24 * 60 * 60 * 1000;
  return { recent: base, short_term: base * 4, medium_term: base * 12, long_term: base * 12 };
}

// Solo agrupa por relaciones YA demostrables (prompt seccion 6): mismo
// topic_id (tema, de ramifications/_signal_types.json) Y actividades que ya
// pertenecen al conjunto de cambios personalizados del perfil (es decir, ya
// conectadas estructuralmente vía relevance/ - no se inventa una relación nueva).
export function groupIntoSituations(changeItems) {
  const byTopic = new Map();
  for (const item of changeItems) {
    const topicId = item.signal.topic_id;
    if (!topicId) continue; // sin tema no hay base determinística de agrupación
    if (!byTopic.has(topicId)) byTopic.set(topicId, []);
    byTopic.get(topicId).push(item);
  }

  const groups = [];
  for (const [topicId, items] of byTopic) {
    const activityIds = [...new Set(items.map((i) => i.activity_id))];
    const intelligenceIds = [...new Set(items.flatMap((i) => i.intelligence.map((x) => x.id)))];
    const signalIds = [...new Set(items.map((i) => i.signal.id))];
    // una situación requiere evidencia de MAS de un elemento (prompt seccion 2/6):
    // >1 intelligence unit relacionado, o la misma señal afectando >1 actividad.
    if (intelligenceIds.length < 2 && activityIds.length < 2) continue;
    groups.push({ topic_id: topicId, activity_ids: activityIds, intelligence_ids: intelligenceIds, signal_ids: signalIds, items });
  }
  return groups;
}

function dedupKeyOf(group) {
  return `${group.topic_id}::${[...group.activity_ids].sort().join(',')}`;
}

// upsertSituations(): persiste/actualiza identidad de situaciones. Se llama
// en cada construcción del Radar (no en el pipeline central - las
// situaciones son una interpretación del Radar, no un nuevo hecho central).
export function upsertSituations(db, groups) {
  const now = new Date().toISOString();
  const rows = [];
  for (const group of groups) {
    const dedupKey = dedupKeyOf(group);
    const existing = db.prepare('SELECT * FROM radar_situations WHERE dedup_key = ?').get(dedupKey);
    const conflicting = group.items.some((i) => i.intelligence.some((x) => x.decisions.some((d) => d.recommendation?.evidence_level === 'conflicting')));

    if (existing) {
      const prevIds = new Set(JSON.parse(existing.intelligence_ids));
      const hasNew = group.intelligence_ids.some((id) => !prevIds.has(id));
      const mergedIds = [...new Set([...prevIds, ...group.intelligence_ids])];
      db.prepare(
        'UPDATE radar_situations SET intelligence_ids = ?, activity_ids = ?, last_seen_at = ?, observation_count = observation_count + ?, conflicting = ? WHERE id = ?'
      ).run(JSON.stringify(mergedIds), JSON.stringify(group.activity_ids), now, hasNew ? 1 : 0, conflicting ? 1 : 0, existing.id);
      rows.push({ ...existing, intelligence_ids: mergedIds, last_seen_at: now, observation_count: existing.observation_count + (hasNew ? 1 : 0), conflicting: conflicting ? 1 : 0, group });
    } else {
      const id = randomUUID();
      db.prepare(
        `INSERT INTO radar_situations (id, dedup_key, topic_id, activity_ids, intelligence_ids, status, conflicting, first_seen_at, last_seen_at, observation_count)
         VALUES (?, ?, ?, ?, ?, 'emerging', ?, ?, ?, 1)`
      ).run(id, dedupKey, group.topic_id, JSON.stringify(group.activity_ids), JSON.stringify(group.intelligence_ids), conflicting ? 1 : 0, now, now);
      rows.push({ id, dedup_key: dedupKey, topic_id: group.topic_id, activity_ids: group.activity_ids, intelligence_ids: group.intelligence_ids, status: 'emerging', conflicting: conflicting ? 1 : 0, first_seen_at: now, last_seen_at: now, observation_count: 1, group });
    }
  }
  return rows;
}

// computeStatus(): deriva el estado de forma pura a partir de los
// timestamps/observation_count, sin persistir transiciones imperativas
// (prompt seccion 10/22).
export function computeStatus(row, { isCurrentlyObserved, windowMs }) {
  const now = Date.now();
  const lastSeen = new Date(row.last_seen_at).getTime();
  const firstSeen = new Date(row.first_seen_at).getTime();

  if (!isCurrentlyObserved) {
    return now - lastSeen > windowMs.long_term ? 'resolved' : 'resolved';
    // (una situación que ya no tiene evidencia activa deja de listarse como
    // activa inmediatamente - "resolved" no espera una ventana adicional,
    // el drop de evidencia ya es la señal de resolución, prompt seccion 22)
  }
  if (row.observation_count <= 1) return 'emerging';
  if (now - firstSeen >= windowMs.medium_term) return 'persistent';
  return 'active';
}

export { STATUS_VALUES, windowMsFor, dedupKeyOf };
