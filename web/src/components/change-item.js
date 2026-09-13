// change-item (Paso 2D-2): presenta un item de radar.changes.items en 2
// niveles (resumen colapsado / detalle expandido vía <details> nativo, sin
// JS de accordion - docs/producto/arquitectura-radar-ux.md §7/§18). El mismo
// objeto puede venir de radar.changes.items, radar.risks, radar.opportunities
// o radar.monitor (mismo shape, contrato §5.3) - este componente no sabe ni
// necesita saber de cuál array vino.
//
// No se muestra previous_value/new_value (no llegan al payload - GAP 12.1,
// contrato §7) ni se calculan aquí.
import { el } from '../utils/dom.js';
import { renderActivityBadge } from './activity-badge.js';
import { renderIntelligenceItem } from './intelligence-item.js';
import { renderDecisionDetail } from './decision-detail.js';
import { renderEvidencePanel } from './evidence-panel.js';
import { TYPE_LABEL, RELEVANCE_LABEL, DIRECTION_LABEL } from '../utils/labels.js';
import { changeItemKey } from '../utils/radar.js';

function badge(kind, text) {
  return el('span', { class: `badge${kind ? ` badge--${kind}` : ''}` }, text);
}

function renderSummary(item) {
  const types = [...new Set(item.intelligence.map((i) => i.type))];
  const badges = [
    renderActivityBadge(item.activity_id),
    badge(null, RELEVANCE_LABEL[item.personalized_relevance.level] ?? item.personalized_relevance.level),
    ...types.map((t) => badge(t, TYPE_LABEL[t] ?? t)),
  ];
  const date = item.signal?.detected_at ? new Date(item.signal.detected_at).toLocaleDateString('es-UY') : null;
  const directionText = item.signal?.direction ? ` — ${DIRECTION_LABEL[item.signal.direction] ?? item.signal.direction}` : '';

  return el('summary', {}, [
    el('div', { class: 'intelligence-item__badges' }, badges),
    el('span', { class: 'change-item__summary-text' }, `${item.signal?.topic_id ?? ''}${directionText}${date ? ` · ${date}` : ''}`),
  ]);
}

function renderIntelligenceUnit(item, intel) {
  const blocks = [
    renderIntelligenceItem({
      kind: intel.type,
      activityId: item.activity_id,
      topicId: item.signal?.topic_id,
      direction: item.signal?.direction,
      evidenceLevel: intel.evidence_level,
      confidence: intel.confidence?.analysis_confidence,
      relevanceLevel: item.personalized_relevance.level,
    }),
  ];

  for (const decision of intel.decisions ?? []) {
    blocks.push(el('div', { class: 'change-item__decision' }, [renderDecisionDetail(decision)]));
    blocks.push(
      renderEvidencePanel({
        signal: item.signal,
        intelligenceId: intel.id,
        decisionId: decision.id,
        recommendationId: decision.recommendation?.id ?? null,
      })
    );
  }

  return el('div', { class: 'change-item__intelligence-unit stack' }, blocks);
}

export function renderChangeItem(item) {
  return el('li', { class: 'change-item' }, [
    // data-key: permite a pages/radar.js preservar si este item estaba
    // expandido a través de un cambio de filtro (QA Paso 2D-3) - ver
    // utils/radar.js#changeItemKey.
    el('details', { 'data-key': changeItemKey(item) }, [
      renderSummary(item),
      el('div', { class: 'change-item__body stack' }, item.intelligence.map((intel) => renderIntelligenceUnit(item, intel))),
    ]),
  ]);
}
