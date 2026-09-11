// evaluateDecisions(): interpreta knowledge/decision/rules.json.decision_problem_schema.
// Genera SIEMPRE al menos una alternativa de la familia no_action (prompt de
// decision/, seccion 7) y nunca asigna best_option (no existe metodologia de
// scoring - knowledge/decision/criteria.json.no_scoring).
import { randomUUID } from 'node:crypto';

// Simplificacion deliberada de esta version del motor: knowledge/decision/
// rules.json.trigger_condition tambien admite un type=impact con
// intelligence_importance>=high, campo que este motor no calcula todavia
// (ver gaps.json). En su lugar, TODA unidad de inteligencia que llego hasta
// aqui (ya paso el filtro de relevance/signals) dispara un decision_problem
// - la proporcionalidad real a la evidencia queda en la escalera de
// recommendations/criteria.json (monitoring_only/none para lo debil), no en
// un segundo filtro redundante aqui. Esto es necesario para que el Caso 39
// (informacion insuficiente -> monitor/seek_information) sea alcanzable.
export function shouldTriggerDecision(_intel) {
  return true;
}

function decisionType(intel) {
  if (intel.type === 'risk') return 'risk_response';
  if (intel.type === 'opportunity') return 'opportunity_pursuit';
  return intel.impact_direction === 'negative' ? 'production' : 'commercial';
}

function buildAlternatives(intel, { reversibility = 'unknown' } = {}) {
  const alts = [
    {
      id: 'monitorear',
      kind: 'no_action',
      description: 'No modificar el manejo/operación actual; mantener el monitoreo habitual del indicador.',
      is_contingent: false,
      factors_for: ['ausencia de confirmación adicional más allá de la señal detectada'],
      factors_against: [`la inteligencia de origen ya clasifica esto como ${intel.type}`],
      constraints: [],
      uncertainty: { status: intel.evidence_level === 'structural_relationship' ? 'known' : 'inferred' },
      reversibility: 'reversible',
      relative_cost: 'unknown',
      status: 'candidate',
    },
  ];

  if (intel.type === 'risk') {
    alts.push({
      id: 'preparar_respuesta',
      kind: 'action',
      description: 'Evaluar medidas preventivas específicas, condicionadas a que se confirme el riesgo con evidencia adicional.',
      is_contingent: true,
      trigger_condition: `confirmación adicional del riesgo sobre ${intel.activity_id}`,
      factors_for: [intel.rationale],
      factors_against: ['evidencia aún estructural, no observacional directa'],
      constraints: [{ category: 'data_availability', severity: 'soft_constraint' }],
      uncertainty: { status: 'estimated' },
      reversibility,
      relative_cost: 'unknown',
      status: 'candidate',
    });
  }

  if (intel.type === 'opportunity') {
    alts.push({
      id: 'evaluar_aprovechamiento',
      kind: 'action',
      description: 'Evaluar el aprovechamiento de la oportunidad, condicionado a confirmar capacidad y condiciones de mercado vigentes.',
      is_contingent: true,
      trigger_condition: `confirmación de condiciones de mercado para ${intel.activity_id}`,
      factors_for: [intel.rationale],
      factors_against: ['capacidad/recursos no evaluados en esta etapa (unknown_constraint)'],
      constraints: [{ category: 'resource', severity: 'unknown_constraint' }],
      uncertainty: { status: 'estimated' },
      reversibility,
      relative_cost: 'unknown',
      status: 'candidate',
    });
  }

  if (intel.type === 'impact') {
    alts.push({
      id: 'ajustar_operacion',
      kind: 'action',
      description: 'Analizar un ajuste operativo acotado en respuesta al impacto detectado.',
      is_contingent: false,
      factors_for: [intel.rationale],
      factors_against: ['impacto de 2do orden o vínculo débil, evidencia moderada'],
      constraints: [],
      uncertainty: { status: intel.impact_direction === 'uncertain' ? 'unknown' : 'estimated' },
      reversibility,
      relative_cost: 'unknown',
      status: intel.impact_direction === 'uncertain' ? 'not_comparable' : 'candidate',
    });
  }

  return alts;
}

export function evaluateDecision(db, runId, intel, { reversibility } = {}) {
  if (!shouldTriggerDecision(intel)) return { created: false, reason: 'trigger_condition no cumplida (decision/rules.json.trigger_condition)' };

  const alternatives = buildAlternatives(intel, { reversibility });
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO decisions (id, run_id, triggered_by_intelligence_id, type, scope, activity_id, alternatives, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, runId, intel.id, decisionType(intel), intel.scope ?? 'operational', intel.activity_id, JSON.stringify(alternatives), 'open', createdAt);

  return { created: true, decision: { id, run_id: runId, triggered_by_intelligence_id: intel.id, type: decisionType(intel), scope: intel.scope ?? 'operational', activity_id: intel.activity_id, alternatives, status: 'open', created_at: createdAt } };
}
