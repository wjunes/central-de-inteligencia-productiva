// report-claim-list (Paso 2E-2): renderiza los `claims` de UNA sección del
// body de un informe (contrato §5/§7). Hallazgo de esta etapa: un `claim` de
// informe es MÁS PLANO que un item de Radar - no trae intelligence[]/
// decisions[] anidados, solo {id, type, activity_id, text, importance,
// evidence_level, confidence, references} (backend/reports/claims.js -
// `data` nunca se preserva en el claim final, solo se usa para redactar
// `text`). Por eso `intelligence-item.js`/`recommendation-item.js`/
// `decision-detail.js` (diseñados para el shape de Radar) NO son compatibles
// aquí (arquitectura-informes-ux.md §28 pedía reutilizarlos "si el shape es
// compatible" - verificado que no lo es) - este es el renderer genérico que
// SÍ corresponde a la forma real de un claim, válido para las 8 secciones
// planas del body (changes/trends/impacts/risks/opportunities/decisions/
// recommendations/uncertainty). El `statement` de una recomendación se
// muestra tal cual (`claim.text` ya es el texto regulado, nunca reformulado).
import { el } from '../utils/dom.js';
import { renderActivityBadge } from './activity-badge.js';
import { CLAIM_TYPE_LABEL, EVIDENCE_LABEL, RELEVANCE_LABEL, PRIORITY_LABEL, CONFIDENCE_LABEL } from '../utils/labels.js';

function badge(kind, text) {
  return el('span', { class: `badge${kind ? ` badge--${kind}` : ''}` }, text);
}

// importanceLabel(): `claim.importance` es `personalized_relevance.level`
// para la mayoría de los tipos, pero `recommendation.priority` para claims
// de recomendación (backend/reports/claims.js - dos vocabularios reales
// distintos que comparten palabras). Se prueba ambas tablas, nunca se
// inventa una escala nueva.
function importanceLabel(value) {
  return RELEVANCE_LABEL[value] ?? PRIORITY_LABEL[value] ?? value;
}

function badgeKindFor(type) {
  if (type === 'risk' || type === 'opportunity' || type === 'impact' || type === 'trend') return type;
  return null; // decision/recommendation/uncertainty/change/comparison/fact: badge neutro, sin color semántico propio
}

export function renderReportClaimItem(claim) {
  const badges = [badge(badgeKindFor(claim.type), CLAIM_TYPE_LABEL[claim.type] ?? claim.type)];
  if (claim.activity_id) badges.push(renderActivityBadge(claim.activity_id));
  if (claim.importance && claim.importance !== 'none') badges.push(badge(null, importanceLabel(claim.importance)));
  if (claim.evidence_level) badges.push(badge(null, EVIDENCE_LABEL[claim.evidence_level] ?? claim.evidence_level));

  const children = [el('div', { class: 'intelligence-item__badges' }, badges), el('p', { class: 'report-claim-item__text' }, claim.text)];

  if (claim.confidence && typeof claim.confidence === 'object') {
    const dims = Object.values(claim.confidence).map((v) => CONFIDENCE_LABEL[v] ?? v).filter(Boolean);
    if (dims.length) children.push(el('p', { class: 'text-caption' }, dims.join(' · ')));
  }

  return el('li', { class: 'report-claim-item' }, children);
}

export function renderReportClaimList(claims, emptyText) {
  if (!claims.length) return el('p', { class: 'text-secondary' }, emptyText);
  return el('ul', { class: 'intelligence-list' }, claims.map(renderReportClaimItem));
}
