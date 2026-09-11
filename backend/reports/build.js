// generateReport(): punto de entrada único del Motor de Reportes. Selecciona
// (reports/<tipo>/index.js), construye claims (reports/claims.js) y persiste
// (reports/store.js). NUNCA calcula relevancia/inteligencia/decisión/
// recomendación nueva - solo selecciona, organiza y redacta con plantillas
// deterministas sobre lo ya generado (prompt seccion 1).
import { claimsFromChangeItem, claimFromTrend, claimFromComparison } from './claims.js';
import { createSnapshot, createReport } from './store.js';
import { sourceIdsOf, signalIdsOf, intelligenceIdsOf, decisionIdsOf, recommendationIdsOf } from './select.js';
import { buildRadar } from '../radar/build.js';
import { knowledge } from '../knowledge/loader.js';

import { selectScope as selectSectorial } from './sectorial/index.js';
import { selectScope as selectMarket } from './markets/index.js';
import { selectScope as selectRisks } from './risks/index.js';
import { selectScope as selectOpportunities } from './opportunities/index.js';
import { selectScope as selectPersonalized } from './personalized/index.js';
import { selectScope as selectExecutive } from './executive/index.js';
import { selectScope as selectPeriodic } from './periodic/index.js';

export const RULES_VERSION = '1.0.0';

const SELECTORS = {
  sectorial: selectSectorial,
  market: selectMarket,
  risk: selectRisks,
  opportunity: selectOpportunities,
  personalized: selectPersonalized,
  executive: selectExecutive,
};

const IMPORTANCE_ORDER = ['none', 'low', 'medium', 'high', 'critical'];

function groupBySection(claims, section) {
  return claims.filter((c) => c.section === section);
}

function emptyMarker(section) {
  const markers = {
    changes: 'no_relevant_changes', trends: 'insufficient_evidence', impacts: 'no_relevant_information',
    risks: 'no_relevant_information', opportunities: 'no_relevant_information', decisions: 'no_relevant_information',
    recommendations: 'no_recommendation', uncertainty: 'no_relevant_information', comparisons: 'no_relevant_information',
  };
  return markers[section] ?? 'no_relevant_information';
}

// Una misma recomendación vigente puede alcanzarse desde varios 'items'
// (p. ej. dos señales distintas del mismo indicador a lo largo del tiempo
// resuelven a la MISMA recomendación activa por actividad - ver
// core/profile/personalize.js: decisionsAndRecommendations busca por
// activity_id, no por señal). El reporte la muestra una sola vez.
function dedupeRecommendationClaims(claims) {
  const seen = new Set();
  return claims.filter((c) => {
    if (c.type !== 'recommendation' && c.type !== 'uncertainty') return true;
    const key = `${c.type}::${c.references.recommendation_id}`;
    if (!c.references.recommendation_id) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sectionBody(claims, section) {
  const items = groupBySection(claims, section);
  if (!items.length) return { [emptyMarker(section)]: true, claims: [] };
  return { claims: items };
}

function buildBodyFromClaims({ title, scope, claims, sourceIds, cutoffAt, situations = null, comparisonBody = null }) {
  const highImportance = claims
    .filter((c) => IMPORTANCE_ORDER.indexOf(c.importance) >= IMPORTANCE_ORDER.indexOf('high'))
    .sort((a, b) => IMPORTANCE_ORDER.indexOf(b.importance) - IMPORTANCE_ORDER.indexOf(a.importance));

  const uncertaintyClaims = groupBySection(claims, 'uncertainty');
  const byEvidenceLevel = {};
  for (const c of claims) {
    if (!c.evidence_level) continue;
    byEvidenceLevel[c.evidence_level] = (byEvidenceLevel[c.evidence_level] ?? 0) + 1;
  }

  return {
    metadata: { title, cutoff_at: cutoffAt },
    scope,
    executive_summary: highImportance.length ? { claims: highImportance.slice(0, 10) } : { no_relevant_information: true, claims: [] },
    current_situation: situations ? { situations } : { not_applicable: true, note: 'ver secciones changes/risks/opportunities' },
    changes: sectionBody(claims, 'changes'),
    trends: sectionBody(claims, 'trends'),
    impacts: sectionBody(claims, 'impacts'),
    risks: sectionBody(claims, 'risks'),
    opportunities: sectionBody(claims, 'opportunities'),
    decisions: sectionBody(claims, 'decisions'),
    recommendations: sectionBody(claims, 'recommendations'),
    uncertainty: uncertaintyClaims.length ? { claims: uncertaintyClaims } : { no_relevant_information: true, claims: [] },
    evidence: { by_level: byEvidenceLevel, uncertain_claims: uncertaintyClaims.length },
    sources: sourceIds.map((sid) => knowledge.sourceById(sid)).filter(Boolean).map((s) => ({ id: s.id, name: s.name, institution: s.institution, type: s.type })),
    comparisons: comparisonBody ?? { not_applicable: true },
    traceability: { claim_count: claims.length, note: 'ver GET /reports/:id/traceability para la cadena completa por claim' },
  };
}

function generateStandardReport(db, type, params) {
  const selector = SELECTORS[type];
  const { items, title, scope } = selector(db, params);
  const cutoffAt = new Date().toISOString();

  let claims = items.flatMap(claimsFromChangeItem);
  claims = dedupeRecommendationClaims(claims);

  let situations = null;
  if (params.profileId) {
    const radar = buildRadar(db, params.profileId);
    situations = radar.situations.no_active_situations ? [] : radar.situations.items;
    for (const sit of situations) {
      const trendClaim = claimFromTrend(sit);
      if (trendClaim) claims.push(trendClaim);
    }
  }

  const snapshotId = createSnapshot(db, {
    cutoffAt,
    situationIds: situations ? situations.map((s) => s.id) : [],
    intelligenceIds: intelligenceIdsOf(items),
    decisionIds: decisionIdsOf(items),
    recommendationIds: recommendationIdsOf(items),
    signalIds: signalIdsOf(items),
  });

  const sourceIds = sourceIdsOf(items);
  const body = buildBodyFromClaims({ title, scope, claims, sourceIds, cutoffAt, situations });

  return createReport(db, {
    type, title, scope, profileId: params.profileId ?? null, cutoffAt,
    rulesVersion: RULES_VERSION, snapshotId, body, claims, sourceIds,
  });
}

function generatePeriodicReport(db, params) {
  const { currentChange, previousChange, activityId, topicId, title, scope } = selectPeriodic(db, params);
  const cutoffAt = new Date().toISOString();
  const claims = [];
  let comparisonBody;
  if (currentChange && previousChange) {
    const claim = claimFromComparison({
      activityId, topicId, previousChange, currentChange,
      periodStart: scope.period_start, periodEnd: scope.period_end,
    });
    claims.push(claim);
    comparisonBody = { claims: [claim] };
  } else {
    comparisonBody = { insufficient_evidence: true, claims: [], reason: 'no hay observación en uno o ambos períodos comparados' };
  }

  const snapshotId = createSnapshot(db, {
    cutoffAt,
    signalIds: [],
    intelligenceIds: [], decisionIds: [], recommendationIds: [], situationIds: [],
  });

  const body = buildBodyFromClaims({ title, scope, claims: [], sourceIds: [], cutoffAt, situations: null, comparisonBody });
  body.comparisons = comparisonBody; // el reporte periódico se define por su sección comparisons, no por claims genéricos

  return createReport(db, {
    type: 'periodic', title, scope, profileId: null, cutoffAt,
    periodStart: scope.period_start, periodEnd: scope.period_end,
    rulesVersion: RULES_VERSION, snapshotId, body, claims, sourceIds: [],
  });
}

export function generateReport(db, type, params = {}) {
  if (type === 'periodic') return generatePeriodicReport(db, params);
  if (!SELECTORS[type]) throw new Error(`generateReport: tipo de reporte desconocido '${type}'`);
  return generateStandardReport(db, type, params);
}
