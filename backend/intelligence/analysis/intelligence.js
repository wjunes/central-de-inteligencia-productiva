// generateIntelligence(): interpreta knowledge/intelligence/rules.json
// (direction_by_subject + risk_opportunity_criteria) contra un
// relevance_result real. Traduce a JS las mismas tablas curadas que
// knowledge/intelligence/_build/generate.py define en Python - no se
// inventa una clasificacion nueva, se reimplementa la misma.
import { randomUUID } from 'node:crypto';

const COST_SIDE_CATEGORIES = new Set(['cost_factors', 'inputs', 'labor_factors', 'financial_factors', 'resources', 'suppliers', 'services', 'logistics']);
const REVENUE_SIDE_CATEGORIES = new Set(['products', 'markets', 'demand_factors', 'customers']);
const FLIP_RELATIONS = new Set(['supplier', 'customer']);

function baseSense(category) {
  if (COST_SIDE_CATEGORIES.has(category)) return 'cost_side';
  if (REVENUE_SIDE_CATEGORIES.has(category)) return 'revenue_side';
  return 'uncertain';
}

function combineDirection(sense, direction) {
  if (sense === 'uncertain' || (direction !== 'increase' && direction !== 'decrease')) return 'uncertain';
  if (sense === 'revenue_side') return direction === 'increase' ? 'positive' : 'negative';
  return direction === 'increase' ? 'negative' : 'positive'; // cost_side
}

// devuelve {impact_direction, evidence_level}
function computeDirection(relevanceResult, signal) {
  if (relevanceResult.factor === 'direct_dependency') {
    const category = (relevanceResult.evidence?.[0] && relevanceResult.evidence[0].category) ?? null;
    // direct_dependency de relevance-engine.js no guarda category explicitamente en evidence
    // salvo que se haya resuelto el nodo - se recalcula aqui si esta disponible via reason.
    return { sense: relevanceResult._category ? baseSense(relevanceResult._category) : 'uncertain' };
  }
  // value_chain_relation: 1 salto exacto (relevance-engine.js no encadena mas de un salto).
  const edge = relevanceResult.evidence?.[0];
  if (!edge) return { sense: 'uncertain' };
  const originSense = baseSense(edge.category);
  if (originSense === 'uncertain') return { sense: 'uncertain' };
  if (FLIP_RELATIONS.has(edge.relation)) {
    return { sense: originSense === 'cost_side' ? 'revenue_side' : 'cost_side' };
  }
  return { sense: 'uncertain' }; // infrastructure/competitor/related_activity/complement
}

function relevanceConfidence(relevanceResult) {
  if (relevanceResult.factor === 'direct_dependency') return 'high';
  const propagated = relevanceResult.evidence?.some((e) => e.propagated_via);
  return propagated ? 'medium' : 'high';
}

function changeDetectionConfidence(monitor) {
  const table = { value_comparison: 'high', record_diff: 'high', structural_diff: 'high', new_item_detection: 'medium', new_document_detection: 'medium', hash_comparison: 'low' };
  return table[monitor.change_detection.method] ?? 'medium';
}

// isOriginCategoryRisksOrOpportunities: solo aplica a direct_dependency, y
// requiere que quien llama haya resuelto el nodo de origen (ver pipeline).
export function generateIntelligenceUnit(db, runId, relevanceResult, signal, monitor, source, { originCategory = null } = {}) {
  let sense;
  if (relevanceResult.factor === 'direct_dependency') {
    sense = baseSense(originCategory);
  } else {
    sense = computeDirection(relevanceResult, signal).sense;
  }
  const impactDirection = combineDirection(sense, signal.direction);

  let type = 'impact';
  if (relevanceResult.factor === 'direct_dependency' && originCategory === 'risks') type = 'risk';
  else if (relevanceResult.factor === 'direct_dependency' && originCategory === 'opportunities') type = 'opportunity';
  else if (impactDirection === 'negative') type = 'risk';
  else if (impactDirection === 'positive') type = 'opportunity';

  const evidenceLevel = relevanceResult.factor === 'direct_dependency'
    ? (originCategory === 'risks' || originCategory === 'opportunities' ? 'structural_relationship' : 'structural_relationship')
    : 'structural_relationship';

  const confidence = {
    source_quality: source.quality?.reliability ?? 'unknown',
    change_detection_confidence: changeDetectionConfidence(monitor),
    relevance_confidence: relevanceConfidence(relevanceResult),
    analysis_confidence: impactDirection === 'uncertain' ? 'low' : 'medium',
  };

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const rationale = `${relevanceResult.activity_id}: ${relevanceResult.reason ?? 'relación estructural'} (dirección=${impactDirection})`;

  db.prepare(
    `INSERT INTO intelligence (id, run_id, based_on_signal_ids, activity_id, type, topic_id, impact_direction, evidence_level, confidence, horizon, scope, status, rationale, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, runId, JSON.stringify([signal.id]), relevanceResult.activity_id, type, signal.topic_id ?? null,
    impactDirection, evidenceLevel, JSON.stringify(confidence), 'current', 'operational', 'detected', rationale, createdAt
  );

  return { id, run_id: runId, based_on_signal_ids: [signal.id], activity_id: relevanceResult.activity_id, type, topic_id: signal.topic_id ?? null, impact_direction: impactDirection, evidence_level: evidenceLevel, confidence, horizon: 'current', scope: 'operational', status: 'detected', rationale, created_at: createdAt };
}
