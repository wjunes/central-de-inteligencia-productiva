// Construcción de 'claims' (prompt seccion 16) a partir de estructuras YA
// EXISTENTES (radar situations, changes personalizados, intelligence,
// decisions, recommendations). Nunca calcula relevancia/inteligencia nueva:
// solo selecciona y redacta con plantillas deterministas (nunca texto libre
// ni IA - prompt seccion 17).
import { randomUUID } from 'node:crypto';

function activityLabel(activityId) {
  return activityId; // los reportes referencian ids reales de knowledge/activities/; el nombre legible es responsabilidad de una capa de presentación futura.
}

// --- plantillas deterministas (una por tipo de claim) -----------------------
const TEMPLATES = {
  fact: (c) => `${activityLabel(c.activity_id)}: se detectó un cambio (${c.change_class}) en ${c.topic_id ?? 'un indicador sin tema asociado'}.`,
  change: (c) => `${activityLabel(c.activity_id)}: ${c.topic_id ?? 'indicador'} ${c.direction === 'increase' ? 'aumentó' : c.direction === 'decrease' ? 'disminuyó' : `cambió (${c.direction})`}${c.magnitude_pct != null ? ` ${c.magnitude_pct.toFixed(1)}%` : ''}.`,
  trend: (c) => `${activityLabel(c.activity_id)}: tendencia ${c.direction} confirmada en ${c.topic_id ?? 'el indicador observado'} (${c.observations} observaciones consecutivas, sin reversión).`,
  impact: (c) => `${activityLabel(c.activity_id)}: impacto ${c.impact_direction} potencial relacionado con ${c.topic_id ?? 'la señal detectada'}.`,
  risk: (c) => `${activityLabel(c.activity_id)}: riesgo identificado - ${c.rationale}.`,
  opportunity: (c) => `${activityLabel(c.activity_id)}: oportunidad identificada - ${c.rationale}.`,
  decision: (c) => `${activityLabel(c.activity_id)}: se evaluaron ${c.alternative_count} alternativa(s) (${c.decision_type}) frente a ${c.rationale}.`,
  recommendation: (c) => c.statement,
  uncertainty: (c) => `${activityLabel(c.activity_id)}: evidencia ${c.evidence_level ?? 'no determinada'}${c.conflicting ? ' y contradictoria' : ''} - no se presenta como hecho confirmado.`,
  comparison: (c) => `${activityLabel(c.activity_id)}: ${c.topic_id ?? 'el indicador'} pasó de ${c.previous_value} a ${c.new_value} (${c.direction}) entre ${c.period_start} y ${c.period_end}. Diferencia entre dos observaciones - no implica una tendencia confirmada.`,
};

function makeClaim({ section, type, activity_id, importance, evidence_level, confidence, references, data }) {
  return {
    id: randomUUID(),
    section,
    type,
    activity_id: activity_id ?? null,
    text: TEMPLATES[type](data),
    importance: importance ?? 'none',
    evidence_level: evidence_level ?? null,
    confidence: confidence ?? null,
    references: references ?? {},
  };
}

// claimsFromChangeItem(): un item de getChanges() (una relevancia
// personalizada + su(s) intelligence unit(s) + decision/recomendación).
export function claimsFromChangeItem(item) {
  const claims = [];
  const importance = item.personalized_relevance.level;

  claims.push(
    makeClaim({
      section: 'changes',
      type: 'change',
      activity_id: item.activity_id,
      importance,
      evidence_level: item.intelligence[0]?.evidence_level,
      references: { signal_id: item.signal.id, activity_id: item.activity_id },
      data: { activity_id: item.activity_id, topic_id: item.signal.topic_id, direction: item.signal.direction, magnitude_pct: null },
    })
  );

  for (const intel of item.intelligence) {
    if (intel.type === 'risk' || intel.type === 'opportunity') {
      claims.push(
        makeClaim({
          section: intel.type === 'risk' ? 'risks' : 'opportunities',
          type: intel.type,
          activity_id: item.activity_id,
          importance,
          evidence_level: intel.evidence_level,
          confidence: intel.confidence,
          references: { intelligence_id: intel.id, signal_id: item.signal.id, activity_id: item.activity_id },
          data: { activity_id: item.activity_id, rationale: intel.rationale },
        })
      );
    } else {
      claims.push(
        makeClaim({
          section: 'impacts',
          type: 'impact',
          activity_id: item.activity_id,
          importance,
          evidence_level: intel.evidence_level,
          confidence: intel.confidence,
          references: { intelligence_id: intel.id, signal_id: item.signal.id, activity_id: item.activity_id },
          data: { activity_id: item.activity_id, impact_direction: intel.impact_direction, topic_id: item.signal.topic_id },
        })
      );
    }

    for (const decision of intel.decisions) {
      claims.push(
        makeClaim({
          section: 'decisions',
          type: 'decision',
          activity_id: item.activity_id,
          importance,
          references: { decision_id: decision.id, intelligence_id: intel.id, activity_id: item.activity_id },
          data: { activity_id: item.activity_id, alternative_count: decision.alternatives.length, decision_type: decision.type, rationale: intel.rationale },
        })
      );

      if (decision.recommendation) {
        const rec = decision.recommendation;
        claims.push(
          makeClaim({
            section: 'recommendations',
            type: 'recommendation',
            activity_id: item.activity_id,
            importance: rec.priority,
            evidence_level: rec.evidence_level,
            references: { recommendation_id: rec.id, decision_id: decision.id, intelligence_id: intel.id, activity_id: item.activity_id },
            data: rec,
          })
        );
        if (rec.evidence_level && ['limited', 'insufficient', 'conflicting'].includes(rec.evidence_level)) {
          claims.push(
            makeClaim({
              section: 'uncertainty',
              type: 'uncertainty',
              activity_id: item.activity_id,
              importance: 'low',
              evidence_level: rec.evidence_level,
              references: { recommendation_id: rec.id, intelligence_id: intel.id, activity_id: item.activity_id },
              data: { activity_id: item.activity_id, evidence_level: rec.evidence_level, conflicting: rec.evidence_level === 'conflicting' },
            })
          );
        }
      }
    }
  }

  return claims;
}

// claimsFromTrend(): solo si la situación tiene una tendencia CONFIRMADA
// (radar/trend.js) - nunca se fabrica un claim de tendencia con evidencia insuficiente.
export function claimFromTrend(situation) {
  if (situation.trend.status !== 'confirmed') return null;
  return makeClaim({
    section: 'trends',
    type: 'trend',
    activity_id: situation.activity_ids[0] ?? null,
    importance: situation.personalized_relevance.level,
    references: { situation_id: situation.id, signal_ids: situation.trend.evidence },
    data: { activity_id: situation.activity_ids.join(', '), topic_id: situation.topic_id, direction: situation.trend.direction, observations: situation.trend.observations },
  });
}

// claimFromComparison(): reporte periódico - diferencia entre dos changes del
// MISMO indicador en periodos distintos. Nunca usa la palabra 'tendencia'.
export function claimFromComparison({ activityId, topicId, previousChange, currentChange, periodStart, periodEnd }) {
  return makeClaim({
    section: 'comparisons',
    type: 'comparison',
    activity_id: activityId,
    importance: 'none',
    references: { change_id_previous: previousChange.id, change_id_current: currentChange.id, activity_id: activityId },
    data: {
      activity_id: activityId,
      topic_id: topicId,
      previous_value: previousChange.new_value,
      new_value: currentChange.new_value,
      direction: currentChange.new_value > previousChange.new_value ? 'increase' : currentChange.new_value < previousChange.new_value ? 'decrease' : 'stable',
      period_start: periodStart,
      period_end: periodEnd,
    },
  });
}
