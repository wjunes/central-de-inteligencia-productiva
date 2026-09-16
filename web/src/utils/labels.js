// Etiquetas centralizadas (extraído de intelligence-item.js, Paso 2F-2) -
// única fuente de verdad para traducir valores catalogados del backend a
// texto legible. Reutilizado por intelligence-item.js, decision-detail.js y
// recommendation-item.js - evita que 3 componentes mantengan la misma tabla
// por separado (docs/producto/arquitectura-decisiones-recomendaciones-ux.md,
// "evitar duplicación de lógica"). Nunca traduce un valor inventado: si el
// valor real no está en la tabla, se devuelve tal cual (mismo criterio ya
// establecido antes de esta etapa).
export const TYPE_LABEL = { risk: 'Riesgo', opportunity: 'Oportunidad', impact: 'Impacto', trend: 'Tendencia' };
export const DIRECTION_LABEL = { increase: 'Aumentó', decrease: 'Disminuyó', stable: 'Sin cambios', mixed: 'Mixto', uncertain: 'Dirección incierta' };
export const EVIDENCE_LABEL = {
  structural_relationship: 'Relación estructural',
  strong: 'Evidencia fuerte',
  moderate: 'Evidencia moderada',
  limited: 'Evidencia limitada',
  insufficient: 'Evidencia insuficiente',
  conflicting: 'Evidencia contradictoria',
};
export const CONFIDENCE_LABEL = { very_high: 'Confianza muy alta', high: 'Confianza alta', medium: 'Confianza media', low: 'Confianza baja' };
export const RELEVANCE_LABEL = { critical: 'Relevancia crítica', high: 'Relevancia alta', medium: 'Relevancia media', low: 'Relevancia baja', none: 'Sin relevancia' };
export const SITUATION_STATUS_LABEL = { emerging: 'Emergente', active: 'Activa', persistent: 'Persistente', resolved: 'Resuelta' };
export const TREND_STATUS_LABEL = { confirmed: 'Tendencia confirmada', insufficient_evidence: 'Evidencia insuficiente para tendencia' };

// Tipos reales alcanzables por el motor (verificado en 2F-0/2F-1 contra
// backend/intelligence/recommendations/recommendations.js#typeFor -
// 7 de los 8 catalogados; 'defer' nunca se produce). NO incluye 'prioritize'
// ni 'exploit' - no existen en el motor real (ver arquitectura-decisiones-
// recomendaciones-ux.md, corrección explícita respecto del enunciado 2F-1).
export const RECOMMENDATION_TYPE_LABEL = {
  monitor: 'Monitorear',
  seek_information: 'Buscar información',
  prepare: 'Prepararse',
  mitigate: 'Mitigar',
  pursue_opportunity: 'Evaluar oportunidad',
  adjust: 'Ajustar',
  evaluate: 'Evaluar',
};

export const DECISION_TYPE_LABEL = {
  risk_response: 'Respuesta a riesgo',
  opportunity_pursuit: 'Evaluación de oportunidad',
  production: 'Ajuste de producción',
  commercial: 'Consideración comercial',
};

// alternativeLabel(): traduce el id real de una alternativa
// (backend/decision/decision.js#buildAlternatives - solo estos 4 ids existen
// hoy) a un texto de acción, sin inventar una quinta alternativa.
export function alternativeLabel(alternative) {
  if (alternative.kind === 'no_action') return 'No actuar / mantener monitoreo';
  const byId = {
    preparar_respuesta: 'Prepararse',
    evaluar_aprovechamiento: 'Evaluar aprovechamiento',
    ajustar_operacion: 'Ajustar operación',
  };
  return byId[alternative.id] ?? alternative.id;
}

const UNCERTAINTY_LABEL = { known: 'Conocida', inferred: 'Inferida', estimated: 'Estimada', unknown: 'Desconocida' };
export function uncertaintyLabel(status) {
  return UNCERTAINTY_LABEL[status] ?? status;
}

const REVERSIBILITY_LABEL = { reversible: 'Reversible', unknown: 'Desconocida' };
export function reversibilityLabel(value) {
  return REVERSIBILITY_LABEL[value] ?? value;
}
