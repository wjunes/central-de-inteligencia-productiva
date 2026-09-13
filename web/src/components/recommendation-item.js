// recommendation-item (Paso 2D-2): presenta UNA recomendación real, tal como
// llega en radar.recommendations o anidada en intelligence[].decisions[].recommendation
// (mismo shape en ambos casos, contrato §15). El `statement` se muestra
// SIEMPRE verbatim - nunca reformulado como una orden ("hacé...", "debés...")
// - y el tipo se etiqueta de forma neutra (utils/labels.js#RECOMMENDATION_TYPE_LABEL),
// sin limitar la interfaz a monitor/seek_information (prompt seccion 10).
import { el } from '../utils/dom.js';
import { renderActivityBadge } from './activity-badge.js';
import { RECOMMENDATION_TYPE_LABEL, EVIDENCE_LABEL, PRIORITY_LABEL } from '../utils/labels.js';

function badge(kind, text) {
  return el('span', { class: `badge${kind ? ` badge--${kind}` : ''}` }, text);
}

export function renderRecommendationItem(recommendation) {
  const badges = [
    badge(null, RECOMMENDATION_TYPE_LABEL[recommendation.type] ?? recommendation.type),
    renderActivityBadge(recommendation.activity_id),
  ];
  if (recommendation.priority) badges.push(badge(null, PRIORITY_LABEL[recommendation.priority] ?? recommendation.priority));
  if (recommendation.evidence_level) badges.push(badge(null, EVIDENCE_LABEL[recommendation.evidence_level] ?? recommendation.evidence_level));

  return el('li', { class: 'recommendation-item' }, [
    el('div', { class: 'intelligence-item__badges' }, badges),
    el('p', { class: 'recommendation-item__statement' }, recommendation.statement),
  ]);
}
