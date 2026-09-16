// decision-recommendation-link (Paso 2F-2, Fase 6): única responsabilidad -
// presentar el texto de relación decisión/recomendación usando
// EXCLUSIVAMENTE utils/decision-recommendation.js#isDirectRelation/
// relationLabel. No realiza llamadas API, no infiere por texto/actividad/
// topic/situación/proximidad temporal - la igualdad de ids es la única
// comprobación. Reusado igual en Radar (change-item, sección plana de
// Recomendaciones) e Informes.
import { el } from '../utils/dom.js';
import { isDirectRelation, relationLabel } from '../utils/decision-recommendation.js';

export function renderDecisionRecommendationLink({ decisionId = null, recommendation, onViewDecision = null }) {
  const direct = isDirectRelation(decisionId, recommendation);
  const children = [el('p', { class: 'text-caption decision-recommendation-link__label' }, relationLabel(direct))];
  if (direct && typeof onViewDecision === 'function') {
    children.push(el('button', { class: 'button button--link', type: 'button', onClick: onViewDecision }, 'Ver decisión relacionada'));
  }
  return el('div', { class: 'decision-recommendation-link' }, children);
}
