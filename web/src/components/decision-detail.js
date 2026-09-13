// decision-detail (Paso 2D-2): presenta la decisión real recibida por
// backend - SIEMPRE exactamente 2 alternativas hoy (no_action + una
// accional, decision/decision.js#buildAlternatives, contrato §14). Nunca
// introduce un ranking, un score ni una alternativa marcada como "mejor
// opción" (el backend no produce `best_option` - prompt seccion 9/11).
import { el } from '../utils/dom.js';
import { renderRecommendationItem } from './recommendation-item.js';
import { DECISION_ALT_KIND_LABEL } from '../utils/labels.js';

function renderAlternative(alt) {
  const children = [
    el('p', { class: 'decision-alt__kind' }, DECISION_ALT_KIND_LABEL[alt.kind] ?? alt.kind),
    el('p', {}, alt.description),
  ];
  if (alt.uncertainty?.status) children.push(el('p', { class: 'text-caption' }, `Incertidumbre: ${alt.uncertainty.status}`));
  if (alt.reversibility) children.push(el('p', { class: 'text-caption' }, `Reversibilidad: ${alt.reversibility}`));
  if (alt.is_contingent && alt.trigger_condition) children.push(el('p', { class: 'text-caption' }, `Condicionada a: ${alt.trigger_condition}`));
  return el('li', { class: 'decision-alt' }, children);
}

export function renderDecisionDetail(decision, { showRecommendation = true } = {}) {
  const sections = [
    el('p', { class: 'text-secondary' }, `Tipo de decisión: ${decision.type} · estado: ${decision.status}`),
    el('ul', { class: 'decision-alt-list' }, decision.alternatives.map(renderAlternative)),
  ];

  if (decision.recommendation && showRecommendation) {
    sections.push(el('p', { class: 'text-caption' }, 'Recomendación vigente para esta decisión (ver docs/arquitectura/contrato-radar.md §14 sobre la resolución por actividad, no siempre por esta decisión exacta):'));
    sections.push(el('ul', { class: 'intelligence-list' }, [renderRecommendationItem(decision.recommendation)]));
  }
  if (decision.recommendation_history?.length) {
    sections.push(el('p', { class: 'text-caption' }, `Historial: ${decision.recommendation_history.length} recomendación(es) anterior(es) para esta actividad.`));
  }

  return el('div', { class: 'decision-detail stack' }, sections);
}
