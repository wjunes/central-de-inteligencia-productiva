// decision-detail (Paso 2F-2, Fase 4): presenta una decisión real - siempre
// no_action + una alternativa accional (backend/decision/decision.js), sin
// best_option/score/ranking (no existen en el modelo, ver
// docs/arquitectura/contrato-decisiones-recomendaciones.md §2).
//
// Dos modos de datos reales, nunca uno inventado a partir del otro:
//  - Radar (`GET /profiles/:id/radar`): trae `alternatives[]` completo ->
//    se renderizan las 2 alternativas reales con sus campos.
//  - Informes (`GET /reports/:id`): el claim `type=decision` NO incluye
//    `alternatives[]` ni `decision_type` como campos propios (verificado en
//    backend/reports/claims.js - solo se usan para redactar `claim.text`,
//    nunca se propagan al objeto) -> se muestra el `text` ya redactado tal
//    cual, sin fabricar alternativas que el informe no expone. Ver GAP
//    nuevo documentado en el informe final de esta etapa.
import { el } from '../utils/dom.js';
import { DECISION_TYPE_LABEL, alternativeLabel, uncertaintyLabel, reversibilityLabel } from '../utils/labels.js';

function renderAlternative(alt) {
  const children = [el('p', { class: 'decision-alternative__label' }, alternativeLabel(alt))];
  if (alt.is_contingent && alt.trigger_condition) {
    children.push(el('p', { class: 'text-caption' }, `Condición: ${alt.trigger_condition}`));
  }
  if (alt.uncertainty?.status) {
    children.push(el('p', { class: 'text-caption' }, `Incertidumbre: ${uncertaintyLabel(alt.uncertainty.status)}`));
  }
  if (alt.reversibility) {
    children.push(el('p', { class: 'text-caption' }, `Reversibilidad: ${reversibilityLabel(alt.reversibility)}`));
  }
  if (alt.status === 'not_comparable') {
    children.push(el('p', { class: 'text-caption' }, 'No comparable con la evidencia actual.'));
  }
  return el('li', { class: `decision-alternative decision-alternative--${alt.kind}` }, children);
}

export function renderDecisionDetail({ decisionType = null, alternatives = null, text = null }) {
  const children = [];
  if (decisionType) children.push(el('p', { class: 'text-caption' }, DECISION_TYPE_LABEL[decisionType] ?? decisionType));

  if (alternatives?.length) {
    children.push(el('ul', { class: 'decision-alternatives' }, alternatives.map(renderAlternative)));
  } else if (text) {
    // Informes: sin alternatives[] en el claim (ver nota superior) - se
    // muestra la oración ya redactada, nunca se simulan las 2 alternativas.
    children.push(el('p', { class: 'decision-detail__text' }, text));
  }

  return el('div', { class: 'decision-detail' }, children);
}
