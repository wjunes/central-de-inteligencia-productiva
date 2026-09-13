// Renderizador reutilizable de UNA unidad de inteligencia/situación/
// recomendación-de-monitoreo (prompt seccion 14) - una sola responsabilidad,
// usado por Cambios/Riesgos/Oportunidades/Inteligencia destacada/Para
// observar. Cada dimensión (tipo, relevancia, confianza, evidencia) se
// muestra por separado, nunca combinada en un número (prompt seccion 16 -
// esas dimensiones ya vienen calculadas por backend, esto solo las etiqueta
// en español legible). El color nunca es el único portador: cada badge lleva
// siempre su texto (prompt seccion 13).
import { el } from '../utils/dom.js';
// Paso 2D-2: las tablas de etiquetas se centralizaron en utils/labels.js
// (reutilizadas también por los componentes de Radar) - mismo contenido
// exacto de antes, solo movidas para no duplicar la taxonomía en 2 archivos.
import { TYPE_LABEL, DIRECTION_LABEL, EVIDENCE_LABEL, CONFIDENCE_LABEL, RELEVANCE_LABEL, SITUATION_STATUS_LABEL, TREND_STATUS_LABEL } from '../utils/labels.js';

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
