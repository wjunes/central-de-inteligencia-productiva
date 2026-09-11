// Personalización: RELEVANCIA CENTRAL + CONTEXTO DEL PERFIL = RELEVANCIA
// PERSONALIZADA (prompt de perfil productivo, seccion 14). No recalcula
// nada del motor central: consulta relevance_results/intelligence/decisions/
// recommendations ya generados y los reinterpreta para un perfil concreto.
// Nunca crea señales, capturas ni llamadas a fuentes/IA (seccion 1/29).
import { knowledge } from '../../knowledge/loader.js';
import { getProfile } from './store.js';

const LEVEL_ORDER = ['none', 'low', 'medium', 'high', 'critical'];

function bumpLevel(level, steps) {
  const i = LEVEL_ORDER.indexOf(level);
  return LEVEL_ORDER[Math.min(LEVEL_ORDER.length - 1, i + steps)];
}

// Dos vías estructurales de escalado, NUNCA por preferencia (seccion 12: una
// prioridad declarada no puede convertirse en evidencia). Cada bump exige
// una coincidencia de ID real entre el perfil y la señal, no una opinión.
function computeBumps(profile, relevanceResult, signal) {
  const bumps = [];

  if (relevanceResult.factor === 'direct_dependency' && signal.origin_ramification_id) {
    const declared = [...profile.products, ...profile.inputs].some(
      (p) => p.activity_id === relevanceResult.activity_id && p.ramification_id === signal.origin_ramification_id
    );
    if (declared) {
      bumps.push({ rule: 'declared_interest_match', reason: `el perfil declaró '${signal.origin_ramification_id}' como producto/insumo de interés en ${relevanceResult.activity_id}` });
    }
  }

  if (profile.markets.length && signal.source_id) {
    const source = knowledge.sourceById(signal.source_id);
    const sourceMarkets = source?.markets ?? [];
    const overlap = profile.markets.filter((m) => sourceMarkets.includes(m));
    if (overlap.length) {
      bumps.push({ rule: 'market_match', reason: `la fuente de la señal cubre mercado(s) declarados por el perfil: ${overlap.join(', ')}` });
    }
  }

  return bumps;
}

function personalizedRelevance(profile, relevanceResult, signal) {
  const bumps = computeBumps(profile, relevanceResult, signal);
  const level = bumpLevel(relevanceResult.relevance_level, bumps.length);
  return { base_level: relevanceResult.relevance_level, level, bumps };
}

function parseIds(json) {
  try {
    return JSON.parse(json ?? '[]');
  } catch {
    return [];
  }
}

function intelligenceForSignal(db, runId, activityId, signalId) {
  const rows = db.prepare('SELECT * FROM intelligence WHERE run_id = ? AND activity_id = ?').all(runId, activityId);
  return rows.filter((i) => parseIds(i.based_on_signal_ids).includes(signalId));
}

// La recomendación vigente/superseded se rastrea por ACTIVIDAD, no por
// decision_id: cada corrida del pipeline crea una decisión nueva (ver
// decision/decision.js), así que el historial de una misma actividad
// atraviesa varias decisiones a lo largo del tiempo (recommendations.js:
// findActiveRecommendation ya busca por activity_id, no por decisión).
function decisionsAndRecommendations(db, intelligenceId) {
  const decisions = db.prepare('SELECT * FROM decisions WHERE triggered_by_intelligence_id = ?').all(intelligenceId);
  return decisions.map((decision) => {
    const recs = db.prepare('SELECT * FROM recommendations WHERE activity_id = ? ORDER BY created_at DESC').all(decision.activity_id);
    const current = recs.find((r) => r.status === 'active') ?? null;
    const history = recs.filter((r) => r !== current);
    return { ...decision, alternatives: JSON.parse(decision.alternatives || '[]'), recommendation: current, recommendation_history: history };
  });
}

// getChanges(): responde "¿qué cambió para mí?" usando exclusivamente datos
// ya procesados centralmente (prompt seccion 16/29) - 0 llamadas a fuentes/IA.
export function getChanges(db, profileId, { includeNoneLevel = false } = {}) {
  const profile = getProfile(db, profileId);
  if (!profile) return null;

  const activityIds = profile.activities.map((a) => a.activity_id);
  if (!activityIds.length) {
    return { profile_id: profileId, no_relevant_changes: true, reason: 'el perfil no tiene actividades declaradas', changes: [] };
  }

  const placeholders = activityIds.map(() => '?').join(',');
  const relevanceRows = db.prepare(`SELECT * FROM relevance_results WHERE activity_id IN (${placeholders})`).all(...activityIds);

  const items = [];
  for (const rel of relevanceRows) {
    const signal = db.prepare('SELECT * FROM signals WHERE id = ?').get(rel.signal_id);
    if (!signal || signal.status === 'dismissed') continue;

    const personalized = personalizedRelevance(profile, rel, signal);
    if (!includeNoneLevel && personalized.level === 'none') continue;

    const intelUnits = intelligenceForSignal(db, rel.run_id, rel.activity_id, signal.id);
    const intelligenceEntries = intelUnits.map((intel) => ({
      ...intel,
      confidence: JSON.parse(intel.confidence || '{}'),
      decisions: decisionsAndRecommendations(db, intel.id),
    }));

    const priorityMatch = profile.priorities.some((p) => intelUnits.some((i) => i.topic_id === p.topic_id));
    const isPrimary = rel.activity_id === profile.main_activity_id;

    items.push({
      activity_id: rel.activity_id,
      is_primary_activity: isPrimary,
      personalized_relevance: personalized,
      priority_match: priorityMatch,
      relevance_factor: rel.factor,
      relevance_reason: rel.reason,
      signal: { id: signal.id, signal_type: signal.signal_type, topic_id: signal.topic_id, direction: signal.direction, detected_at: signal.detected_at, source_id: signal.source_id, monitor_id: signal.monitor_id, status: signal.status },
      intelligence: intelligenceEntries,
    });
  }

  if (!items.length) {
    return { profile_id: profileId, no_relevant_changes: true, reason: 'no hay cambios centrales relacionados con las actividades del perfil', changes: [] };
  }

  items.sort((a, b) => {
    const levelDiff = LEVEL_ORDER.indexOf(b.personalized_relevance.level) - LEVEL_ORDER.indexOf(a.personalized_relevance.level);
    if (levelDiff !== 0) return levelDiff;
    if (a.priority_match !== b.priority_match) return a.priority_match ? -1 : 1;
    return new Date(b.signal.detected_at) - new Date(a.signal.detected_at);
  });

  return { profile_id: profileId, no_relevant_changes: false, count: items.length, changes: items };
}

// getPersonalizedRelevance(): vista mas liviana (sin intelligence/decisions/recommendations),
// para GET /profiles/:id/relevance.
export function getPersonalizedRelevance(db, profileId) {
  const profile = getProfile(db, profileId);
  if (!profile) return null;
  const activityIds = profile.activities.map((a) => a.activity_id);
  if (!activityIds.length) return { profile_id: profileId, results: [] };
  const placeholders = activityIds.map(() => '?').join(',');
  const relevanceRows = db.prepare(`SELECT * FROM relevance_results WHERE activity_id IN (${placeholders})`).all(...activityIds);
  const results = relevanceRows.map((rel) => {
    const signal = db.prepare('SELECT * FROM signals WHERE id = ?').get(rel.signal_id);
    const personalized = signal ? personalizedRelevance(profile, rel, signal) : { base_level: rel.relevance_level, level: rel.relevance_level, bumps: [] };
    return { activity_id: rel.activity_id, is_primary_activity: rel.activity_id === profile.main_activity_id, factor: rel.factor, ...personalized };
  });
  return { profile_id: profileId, results };
}
