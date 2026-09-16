// recommendation-item (Paso 2F-2, Fase 5): `statement` siempre verbatim,
// nunca resumido/reinterpretado. `type` puede estar ausente (claims de
// Informes no lo exponen - ver decision-detail.js) - cuando falta, no se
// muestra badge de tipo en vez de inventarlo. `linkNode` es opcional: lo
// provee quien arma la vista, ya renderizado por decision-recommendation-
// link.js (única responsabilidad de esa regla, Fase 6) - este componente no
// decide la relación, solo reserva el lugar donde mostrarla.
import { el } from '../utils/dom.js';
import { RECOMMENDATION_TYPE_LABEL, RELEVANCE_LABEL, EVIDENCE_LABEL } from '../utils/labels.js';
import { renderActivityBadge } from './activity-badge.js';

function badge(kind, text) {
  return el('span', { class: `badge${kind ? ` badge--${kind}` : ''}` }, text);
}

// Reusa el mismo token semántico ya asociado al tipo de inteligencia
// relacionada (mitigate hereda el tono de riesgo, pursue_opportunity el de
// oportunidad) - sin introducir una paleta nueva para recomendaciones.
const TONE_BY_TYPE = { mitigate: 'risk', pursue_opportunity: 'opportunity' };

export function renderRecommendationItem({
  statement,
  activityId = null,
  type = null,
  priority = null,
  evidenceLevel = null,
  status = null,
  linkNode = null,
}) {
  const badges = [];
  if (activityId) badges.push(renderActivityBadge(activityId));
  if (type) badges.push(badge(TONE_BY_TYPE[type] ?? null, RECOMMENDATION_TYPE_LABEL[type] ?? type));
  if (priority) badges.push(badge(null, RELEVANCE_LABEL[priority] ?? `Prioridad: ${priority}`));
  if (status === 'superseded') badges.push(badge('status', 'Versión anterior'));

  const children = [
    el('div', { class: 'intelligence-item__badges' }, badges),
    el('p', { class: 'recommendation-item__statement' }, statement),
  ];
  if (evidenceLevel) children.push(el('p', { class: 'text-caption' }, EVIDENCE_LABEL[evidenceLevel] ?? evidenceLevel));
  if (linkNode) children.push(linkNode);

  return el('li', { class: 'intelligence-item recommendation-item' }, children);
}
