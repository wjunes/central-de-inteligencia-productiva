// situation-card (Paso 2D-2): presenta una situación agrupada
// (radar.situations.items) - una agregación de >=2 unidades de inteligencia
// relacionadas (contrato §5.2), nunca una unidad de inteligencia nueva por sí
// misma. Reusa renderIntelligenceItem tal cual para la cabecera (mismo
// componente que ya usa Situación en "Inteligencia destacada", Paso 2C-1) y
// agrega la expansión de miembros, propia de Radar.
import { el } from '../utils/dom.js';
import { renderIntelligenceItem } from './intelligence-item.js';
import { renderActivityBadge } from './activity-badge.js';
import { DIRECTION_LABEL } from '../utils/labels.js';
import { resolveMemberDirection, situationKey } from '../utils/radar.js';

function renderMember(member, changesItems) {
  const direction = resolveMemberDirection(member, changesItems);
  const directionText = direction ? DIRECTION_LABEL[direction] ?? direction : 'Dirección no disponible en los cambios vigentes';
  return el('li', { class: 'situation-card__member' }, [renderActivityBadge(member.activity_id), el('span', {}, ` — ${directionText}`)]);
}

export function renderSituationCard(situation, changesItems) {
  const header = renderIntelligenceItem({
    kind: situation.type,
    activityId: situation.activity_ids.join(', '),
    topicId: situation.topic_id,
    confidence: situation.confidence,
    relevanceLevel: situation.personalized_relevance.level,
    situationStatus: situation.status,
    trend: situation.trend,
  });

  // GAP 17.3 (contrato §5.2 / arquitectura-radar-ux.md §6): situation.confidence
  // es la confianza del PRIMER intelligence unit del PRIMER miembro, no una
  // agregación real de toda la situación - nunca se presenta aquí como
  // "certeza global".
  const confidenceCaveat = el('p', { class: 'text-caption' }, 'La confianza mostrada corresponde al primer elemento analizado del grupo, no es un promedio de toda la situación.');

  // data-key: permite a pages/radar.js preservar si esta situación estaba
  // expandida a través de un cambio de filtro (QA Paso 2D-3) - ver
  // utils/radar.js#situationKey.
  const membersDetails = el('details', { 'data-key': situationKey(situation) }, [
    el('summary', {}, `Ver miembros (${situation.members.length})`),
    el('ul', { class: 'situation-card__members' }, situation.members.map((m) => renderMember(m, changesItems))),
  ]);

  return el('li', { class: 'situation-card' }, [header, confidenceCaveat, membersDetails]);
}
