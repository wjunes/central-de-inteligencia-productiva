// buildRadar(): punto de entrada único del Radar Productivo. Consume
// getChanges() (ya construido en la etapa de Personalización) y produce una
// vista temporal/agregada/priorizada - CERO señales, capturas, fuentes o
// llamadas a IA nuevas (prompt seccion 1/30/31/32).
import { getChanges } from '../core/profile/personalize.js';
import { groupIntoSituations, upsertSituations, computeStatus, windowMsFor } from './situations.js';
import { detectTrend } from './trend.js';
import { sortByPriority } from './prioritize.js';
import { knowledge } from '../knowledge/loader.js';

function situationView(db, row, isCurrentlyObserved) {
  const group = row.group;
  const memberItems = group ? group.items : [];
  const signals = memberItems.map((i) => i.signal);
  const windowMs = windowMsFor(signals.length ? signals : [{ monitor_id: null }]);
  const status = computeStatus(row, { isCurrentlyObserved, windowMs });

  const relevanceLevels = memberItems.map((i) => i.personalized_relevance.level);
  const LEVEL_ORDER = ['none', 'low', 'medium', 'high', 'critical'];
  const topRelevance = relevanceLevels.reduce((best, l) => (LEVEL_ORDER.indexOf(l) > LEVEL_ORDER.indexOf(best) ? l : best), 'none');

  const recs = memberItems.flatMap((i) => i.intelligence.flatMap((x) => x.decisions.map((d) => d.recommendation).filter(Boolean)));
  const PRIORITY_ORDER = ['none', 'low', 'medium', 'high', 'critical'];
  const topPriority = recs.reduce((best, r) => (PRIORITY_ORDER.indexOf(r.priority) > PRIORITY_ORDER.indexOf(best) ? r.priority : best), 'none');

  const riskActivities = [...new Set(memberItems.filter((i) => i.intelligence.some((x) => x.type === 'risk')).map((i) => i.activity_id))];
  const opportunityActivities = [...new Set(memberItems.filter((i) => i.intelligence.some((x) => x.type === 'opportunity')).map((i) => i.activity_id))];

  const trend = detectTrend(db, group ? group.signal_ids : JSON.parse(row.intelligence_ids ? '[]' : '[]'));

  return {
    id: row.id,
    topic_id: row.topic_id,
    activity_ids: row.activity_ids ?? JSON.parse(row.activity_ids || '[]'),
    intelligence_ids: Array.isArray(row.intelligence_ids) ? row.intelligence_ids : JSON.parse(row.intelligence_ids || '[]'),
    status,
    conflicting: Boolean(row.conflicting),
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
    observation_count: row.observation_count,
    personalized_relevance: { level: topRelevance },
    recommendation_priority: topPriority,
    confidence: memberItems[0]?.intelligence?.[0]?.confidence?.analysis_confidence ?? null,
    risk_activities: riskActivities,
    opportunity_activities: opportunityActivities,
    trend,
    type: riskActivities.length ? 'risk' : opportunityActivities.length ? 'opportunity' : 'impact',
    members: memberItems.map((i) => ({ activity_id: i.activity_id, signal_id: i.signal.id, intelligence_ids: i.intelligence.map((x) => x.id) })),
  };
}

function resolvedSituationsFor(db, profileActivityIds, currentDedupKeys) {
  const placeholders = profileActivityIds.map(() => '?').join(',');
  if (!profileActivityIds.length) return [];
  const all = db.prepare('SELECT * FROM radar_situations').all();
  return all
    .filter((row) => !currentDedupKeys.has(row.dedup_key))
    .filter((row) => JSON.parse(row.activity_ids).some((a) => profileActivityIds.includes(a)))
    .map((row) => situationView(db, { ...row, activity_ids: JSON.parse(row.activity_ids), intelligence_ids: JSON.parse(row.intelligence_ids), group: null }, false));
}

export function buildRadar(db, profileId) {
  const changes = getChanges(db, profileId);
  if (changes === null) return null;

  if (changes.no_relevant_changes) {
    return {
      profile_id: profileId,
      changes: { no_relevant_changes: true, items: [] },
      situations: { no_active_situations: true, items: [] },
      risks: [], opportunities: [], monitor: [], recommendations: [],
    };
  }

  const allGroups = groupIntoSituations(changes.changes);

  // 'observada actualmente' = tiene al menos una señal miembro dentro de su
  // propia ventana reciente (la ventana depende de la frecuencia de SUS
  // fuentes, no una duración universal - prompt seccion 8). Un grupo sin
  // evidencia reciente no se re-confirma (no se le toca last_seen_at) - si ya
  // existía en radar_situations, se reporta como 'resolved' más abajo, nunca
  // se sigue mostrando como activo solo porque su historial sigue en la base.
  const freshGroups = allGroups.filter((g) => {
    const windowMs = windowMsFor(g.items.map((i) => i.signal));
    return g.items.some((i) => Date.now() - new Date(i.signal.detected_at).getTime() <= windowMs.short_term);
  });

  const situationRows = upsertSituations(db, freshGroups);
  const currentDedupKeys = new Set(situationRows.map((r) => r.dedup_key));
  const activeSituations = situationRows.map((r) => situationView(db, r, true));

  const profileActivityIds = [...new Set(changes.changes.map((c) => c.activity_id))];
  const resolved = resolvedSituationsFor(db, profileActivityIds, currentDedupKeys);

  const risks = changes.changes.filter((c) => c.intelligence.some((i) => i.type === 'risk'));
  const opportunities = changes.changes.filter((c) => c.intelligence.some((i) => i.type === 'opportunity'));
  const monitorItems = changes.changes.filter((c) =>
    c.intelligence.some((i) => i.decisions.some((d) => ['monitor', 'seek_information'].includes(d.recommendation?.type)))
  );
  const recsById = new Map();
  for (const c of changes.changes) {
    for (const i of c.intelligence) {
      for (const d of i.decisions) {
        if (d.recommendation && d.recommendation.status === 'active') recsById.set(d.recommendation.id, d.recommendation);
      }
    }
  }
  const activeRecommendations = [...recsById.values()];

  const prioritizedSituations = sortByPriority(activeSituations);

  return {
    profile_id: profileId,
    changes: { no_relevant_changes: false, items: changes.changes },
    situations: {
      no_active_situations: prioritizedSituations.length === 0,
      items: prioritizedSituations,
      resolved,
    },
    risks,
    opportunities,
    monitor: monitorItems,
    recommendations: activeRecommendations,
  };
}

export function buildRadarView(db, profileId, view) {
  const radar = buildRadar(db, profileId);
  if (radar === null) return null;
  if (!view || view === 'all') return radar;
  if (view === 'changes') return radar.changes;
  if (view === 'situations') return radar.situations;
  if (view === 'risks') return { risks: radar.risks };
  if (view === 'opportunities') return { opportunities: radar.opportunities };
  if (view === 'monitor') return { monitor: radar.monitor };
  if (view === 'recommendations') return { recommendations: radar.recommendations };
  return { error: `view desconocida: ${view}` };
}
