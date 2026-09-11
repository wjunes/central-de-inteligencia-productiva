// generateRecommendations(): interpreta knowledge/recommendations/criteria.json
// (strength_ladder) y rules.json (lenguaje regulado, ciclo de vida). Nunca
// genera texto libre: el statement sale siempre de una plantilla aprobada.
import { randomUUID } from 'node:crypto';

const LANGUAGE_BY_STRENGTH = {
  strong: (subject) => `Se recomienda evaluar ${subject}.`,
  conditional: (subject, condition) => `Si ${condition ?? 'se confirma la condición asociada'}, resulta conveniente evaluar ${subject}.`,
  preventive: (subject) => `Conviene prepararse para ${subject}.`,
  monitoring_only: (subject) => `Se recomienda monitorear ${subject}.`,
  none: () => 'No existe evidencia suficiente para recomendar una acción.',
};

// evidence_level operativo (recommendations/evidence.json.evidence_level.mapping,
// version simplificada y determinista para este motor). hasMagnitude=true
// cuando el signal_type es 'cambio-significativo' (hubo un umbral numerico
// superado, no solo la aparicion de un documento) - una senal con magnitud
// real sostiene mas evidencia que un factor estructural sin confirmacion.
export function computeEvidenceLevel(intel, { conflicting = false, hasMagnitude = false } = {}) {
  if (conflicting) return 'conflicting';
  if (intel.type === 'risk' || intel.type === 'opportunity') {
    // originado por category=risks/opportunities de ramifications/, o por
    // impact_direction economico via direction_by_subject.
    if (hasMagnitude) return 'moderate';
    if (intel.evidence_level === 'structural_relationship') return 'limited';
    return 'insufficient';
  }
  if (intel.impact_direction === 'uncertain') return 'insufficient';
  if (hasMagnitude) return 'moderate';
  return 'insufficient';
}

function strengthFor(evidenceLevel, intel, hasMonitoringResource) {
  if (evidenceLevel === 'conflicting') return 'none';
  if (evidenceLevel === 'insufficient') return hasMonitoringResource ? 'monitoring_only' : 'none';
  if (evidenceLevel === 'limited') return 'preventive';
  if (evidenceLevel === 'moderate') return 'conditional';
  return 'strong'; // evidenceLevel === 'strong', no alcanzado por computeEvidenceLevel() en este motor
}

function typeFor(strength, intel, hasMonitoringResource) {
  if (strength === 'monitoring_only') return 'monitor';
  if (strength === 'none') return hasMonitoringResource ? 'monitor' : 'seek_information';
  if (strength === 'preventive') return 'prepare';
  if (strength === 'conditional') {
    if (intel.type === 'opportunity') return 'pursue_opportunity';
    if (intel.type === 'risk') return 'mitigate';
    return 'adjust';
  }
  return 'evaluate'; // strong
}

function subjectPhrase(intel) {
  const topic = intel.topic_id ? `(${intel.topic_id}) ` : '';
  return `la situación ${topic}detectada para ${intel.activity_id}`;
}

function priorityFor(intel, evidenceLevel) {
  if (evidenceLevel === 'insufficient' || evidenceLevel === 'conflicting') return 'low';
  if (intel.type === 'risk' && evidenceLevel !== 'limited') return 'high';
  if (intel.type === 'opportunity' && evidenceLevel !== 'limited') return 'medium';
  return 'medium';
}

// La recomendación activa previa se busca por actividad, no por tipo de
// decisión: una reevaluación puede cambiar de decision_type (p. ej. de
// opportunity_pursuit a risk_response si el precio se revierte) y aun así
// debe suceder a la anterior, no coexistir con ella (prompt seccion 40).
function findActiveRecommendation(db, activityId) {
  return db
    .prepare("SELECT * FROM recommendations WHERE activity_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1")
    .get(activityId);
}

export function generateRecommendation(db, runId, decision, intel, { hasMonitoringResource = false, conflicting = false, conditionText = null, hasMagnitude = false } = {}) {
  const evidenceLevel = computeEvidenceLevel(intel, { conflicting, hasMagnitude });
  const strength = strengthFor(evidenceLevel, intel, hasMonitoringResource);
  const type = typeFor(strength, intel, hasMonitoringResource);
  const statement = LANGUAGE_BY_STRENGTH[strength](subjectPhrase(intel), conditionText);
  const priority = priorityFor(intel, evidenceLevel);

  const previous = findActiveRecommendation(db, decision.activity_id);
  let previousVersionId = null;
  if (previous && (previous.strength !== strength || previous.type !== type)) {
    db.prepare("UPDATE recommendations SET status = 'superseded' WHERE id = ?").run(previous.id);
    previousVersionId = previous.id;
  } else if (previous) {
    // misma recomendación, misma evidencia: no se duplica (recommendations/rules.json.efficiency)
    return { created: false, reused: previous };
  }

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO recommendations (id, run_id, decision_id, type, strength, evidence_level, statement, rationale, conditions, priority, activity_id, status, valid_from, valid_until, previous_version_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, runId, decision.id, type, strength, evidenceLevel, statement, intel.rationale,
    JSON.stringify(conditionText ? [{ description: conditionText, status: 'unknown' }] : []),
    priority, decision.activity_id, 'active', createdAt, null, previousVersionId, createdAt
  );

  return {
    created: true,
    recommendation: { id, run_id: runId, decision_id: decision.id, type, strength, evidence_level: evidenceLevel, statement, rationale: intel.rationale, priority, activity_id: decision.activity_id, status: 'active', valid_from: createdAt, previous_version_id: previousVersionId, created_at: createdAt },
  };
}
