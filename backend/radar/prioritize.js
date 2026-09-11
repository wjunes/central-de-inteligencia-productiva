// Priorización del Radar (prompt seccion 14-17). Sin score mágico: una
// secuencia EXPLÍCITA y documentada de criterios de desempate, cada uno
// reproducible e interpretable. relevance/confidence/priority/risk se leen
// como dimensiones separadas, nunca se combinan en un número (seccion 15).
const LEVEL_ORDER = ['none', 'low', 'medium', 'high', 'critical'];
const PRIORITY_ORDER = ['none', 'low', 'medium', 'high', 'critical'];
const STATUS_WEIGHT = { persistent: 3, active: 2, emerging: 1, resolved: 0 };
const TYPE_WEIGHT = { risk: 2, opportunity: 2, impact: 1, trend: 1 };
const CONFIDENCE_ORDER = ['low', 'medium', 'high', 'very_high'];

function idx(arr, v) {
  const i = arr.indexOf(v);
  return i === -1 ? -1 : i;
}

// Cada situación/cambio llega con: personalized_relevance.level,
// recommendation.priority (si existe), confidence.analysis_confidence (del
// primer intelligence unit relevante), status, type.
export function priorityKeyOf(entry) {
  return {
    relevance: idx(LEVEL_ORDER, entry.personalized_relevance?.level ?? 'none'),
    type: TYPE_WEIGHT[entry.type] ?? 0,
    recommendationPriority: idx(PRIORITY_ORDER, entry.recommendation_priority ?? 'none'),
    status: STATUS_WEIGHT[entry.status] ?? 0,
    confidence: idx(CONFIDENCE_ORDER, entry.confidence ?? 'low'),
    recency: entry.last_seen_at ? new Date(entry.last_seen_at).getTime() : 0,
  };
}

// Comparador documentado (orden de criterios, de mayor a menor peso):
// 1) relevancia personalizada  2) tipo (riesgo/oportunidad > impacto/tendencia)
// 3) prioridad de la recomendación vigente  4) persistencia de la situación
// 5) confianza del análisis  6) más reciente primero.
export function compareForPriority(a, b) {
  const ka = priorityKeyOf(a);
  const kb = priorityKeyOf(b);
  return (
    kb.relevance - ka.relevance ||
    kb.type - ka.type ||
    kb.recommendationPriority - ka.recommendationPriority ||
    kb.status - ka.status ||
    kb.confidence - ka.confidence ||
    kb.recency - ka.recency
  );
}

export function sortByPriority(entries) {
  return [...entries].sort(compareForPriority);
}
