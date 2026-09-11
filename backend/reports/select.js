// Selección de contenido para reportes NO personalizados (sectorial, mercado,
// riesgo, oportunidad, ejecutivo sin perfil). Reusa exactamente la misma
// resolución intelligence->decision->recommendation que la personalización
// (core/profile/personalize.js), sin pasar por un perfil - un reporte
// sectorial no necesita que exista un perfil para una actividad.
import { intelligenceForSignal, decisionsAndRecommendations } from '../core/profile/personalize.js';
import { knowledge } from '../knowledge/loader.js';

// itemsForActivities(): construye la MISMA forma de "item" que getChanges()
// (activity_id, personalized_relevance.level, signal, intelligence[]) mapeando
// personalized_relevance.level = relevance_level CENTRAL (relevance/levels.json),
// porque aquí no hay perfil que personalice - documentado, no una segunda escala.
export function itemsForActivities(db, activityIds) {
  if (!activityIds.length) return [];
  const placeholders = activityIds.map(() => '?').join(',');
  const relevanceRows = db.prepare(`SELECT * FROM relevance_results WHERE activity_id IN (${placeholders})`).all(...activityIds);

  const items = [];
  for (const rel of relevanceRows) {
    const signal = db.prepare('SELECT * FROM signals WHERE id = ?').get(rel.signal_id);
    if (!signal || signal.status === 'dismissed') continue;
    const intelUnits = intelligenceForSignal(db, rel.run_id, rel.activity_id, signal.id);
    const intelligenceEntries = intelUnits.map((intel) => ({
      ...intel,
      confidence: JSON.parse(intel.confidence || '{}'),
      decisions: decisionsAndRecommendations(db, intel.id),
    }));
    items.push({
      activity_id: rel.activity_id,
      is_primary_activity: false,
      personalized_relevance: { base_level: rel.relevance_level, level: rel.relevance_level, bumps: [] },
      priority_match: false,
      relevance_factor: rel.factor,
      relevance_reason: rel.reason,
      signal: { id: signal.id, signal_type: signal.signal_type, topic_id: signal.topic_id, direction: signal.direction, detected_at: signal.detected_at, source_id: signal.source_id, monitor_id: signal.monitor_id, status: signal.status },
      intelligence: intelligenceEntries,
    });
  }
  return items;
}

export function filterByType(items, type) {
  return items.filter((i) => i.intelligence.some((x) => x.type === type));
}

// filterByMarket(): un mercado sigue siendo una dimensión (prompt seccion 4.3)
// - se filtra por sources.json[source_id].markets, no por un dominio/fuente nuevo.
export function filterByMarket(items, marketId) {
  return items.filter((i) => {
    const source = knowledge.sourceById(i.signal.source_id);
    return (source?.markets ?? []).includes(marketId);
  });
}

export function sourceIdsOf(items) {
  return [...new Set(items.map((i) => i.signal.source_id).filter(Boolean))];
}

export function signalIdsOf(items) {
  return [...new Set(items.map((i) => i.signal.id))];
}

export function intelligenceIdsOf(items) {
  return [...new Set(items.flatMap((i) => i.intelligence.map((x) => x.id)))];
}

export function decisionIdsOf(items) {
  return [...new Set(items.flatMap((i) => i.intelligence.flatMap((x) => x.decisions.map((d) => d.id))))];
}

export function recommendationIdsOf(items) {
  return [...new Set(items.flatMap((i) => i.intelligence.flatMap((x) => x.decisions.map((d) => d.recommendation?.id).filter(Boolean))))];
}
