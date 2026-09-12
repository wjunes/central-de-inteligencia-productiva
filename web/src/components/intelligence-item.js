// Renderizador reutilizable de UNA unidad de inteligencia/situación/
// recomendación-de-monitoreo (prompt seccion 14) - una sola responsabilidad,
// usado por Cambios/Riesgos/Oportunidades/Inteligencia destacada/Para
// observar. Cada dimensión (tipo, relevancia, confianza, evidencia) se
// muestra por separado, nunca combinada en un número (prompt seccion 16 -
// esas dimensiones ya vienen calculadas por backend, esto solo las etiqueta
// en español legible). El color nunca es el único portador: cada badge lleva
// siempre su texto (prompt seccion 13).
import { el } from '../utils/dom.js';

const TYPE_LABEL = { risk: 'Riesgo', opportunity: 'Oportunidad', impact: 'Impacto', trend: 'Tendencia' };
const DIRECTION_LABEL = { increase: 'Aumentó', decrease: 'Disminuyó', stable: 'Sin cambios', mixed: 'Mixto', uncertain: 'Dirección incierta' };
const EVIDENCE_LABEL = {
  structural_relationship: 'Relación estructural',
  strong: 'Evidencia fuerte',
  moderate: 'Evidencia moderada',
  limited: 'Evidencia limitada',
  insufficient: 'Evidencia insuficiente',
  conflicting: 'Evidencia contradictoria',
};
const CONFIDENCE_LABEL = { very_high: 'Confianza muy alta', high: 'Confianza alta', medium: 'Confianza media', low: 'Confianza baja' };
const RELEVANCE_LABEL = { critical: 'Relevancia crítica', high: 'Relevancia alta', medium: 'Relevancia media', low: 'Relevancia baja', none: 'Sin relevancia' };
const SITUATION_STATUS_LABEL = { emerging: 'Emergente', active: 'Activa', persistent: 'Persistente', resolved: 'Resuelta' };
const TREND_STATUS_LABEL = { confirmed: 'Tendencia confirmada', insufficient_evidence: 'Evidencia insuficiente para tendencia' };

function badge(kind, text) {
  return el('span', { class: `badge${kind ? ` badge--${kind}` : ''}` }, text);
}

export function renderIntelligenceItem({
  kind = null,
  activityId,
  topicId = null,
  direction = null,
  evidenceLevel = null,
  confidence = null,
  relevanceLevel = null,
  situationStatus = null,
  trend = null,
  recommendationText = null,
  recommendationEvidenceLevel = null,
}) {
  const badges = [];
  if (kind) badges.push(badge(kind, TYPE_LABEL[kind] ?? kind));
  if (situationStatus) badges.push(badge('status', SITUATION_STATUS_LABEL[situationStatus] ?? situationStatus));
  if (relevanceLevel) badges.push(badge(null, RELEVANCE_LABEL[relevanceLevel] ?? relevanceLevel));
  if (confidence) badges.push(badge(null, CONFIDENCE_LABEL[confidence] ?? confidence));

  const titleParts = [activityId];
  if (topicId) titleParts.push(topicId);
  const title = titleParts.join(' · ') + (direction ? ` — ${DIRECTION_LABEL[direction] ?? direction}` : '');

  const children = [el('div', { class: 'intelligence-item__badges' }, badges), el('p', { class: 'intelligence-item__title' }, title)];

  if (evidenceLevel) children.push(el('p', { class: 'text-caption' }, EVIDENCE_LABEL[evidenceLevel] ?? evidenceLevel));

  if (trend) {
    const trendText = trend.status === 'confirmed' ? `${TREND_STATUS_LABEL.confirmed} (${DIRECTION_LABEL[trend.direction] ?? trend.direction}, ${trend.observations} observaciones)` : TREND_STATUS_LABEL.insufficient_evidence;
    children.push(el('p', { class: 'text-caption' }, trendText));
  }

  if (recommendationText) {
    children.push(el('p', { class: 'intelligence-item__recommendation' }, recommendationText));
    if (recommendationEvidenceLevel) children.push(el('p', { class: 'text-caption' }, EVIDENCE_LABEL[recommendationEvidenceLevel] ?? recommendationEvidenceLevel));
  }

  return el('li', { class: 'intelligence-item' }, children);
}
