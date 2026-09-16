// Radar Productivo (Paso 2F-2), sobre el diseño congelado en
// docs/producto/arquitectura-radar-ux.md y docs/producto/arquitectura-
// decisiones-recomendaciones-ux.md. Fuente única: GET /profiles/:id/radar
// (una sola llamada, igual que Situación) - nunca se recalcula relevancia/
// inteligencia/riesgo/oportunidad/decisión/recomendación en frontend.
//
// Decisión de arquitectura ya congelada (arquitectura-radar-ux.md §4): los
// mismos `changes.items` se filtran por pertenencia YA CALCULADA por el
// backend (radar.risks/opportunities/monitor son el mismo tipo de objeto
// que changes.items) - itemsForTab() solo elige cuál array ya recibido
// mostrar, nunca reclasifica un item.
import { el } from '../utils/dom.js';
import { renderStatusMessage } from '../components/status-message.js';
import { renderProfileSection } from '../components/profile-section.js';
import { renderSituationSummary } from '../components/situation-summary.js';
import { renderNoProfileState } from '../components/no-profile-state.js';
import { renderActivityBadge } from '../components/activity-badge.js';
import { renderDecisionDetail } from '../components/decision-detail.js';
import { renderRecommendationItem } from '../components/recommendation-item.js';
import { renderDecisionRecommendationLink } from '../components/decision-recommendation-link.js';
import { renderEvidencePanel } from '../components/evidence-panel.js';
import * as api from '../services/api.js';
import { loadActiveProfileId } from '../state/active-profile.js';
import { describeApiError, isNotFoundError } from '../utils/profile-form.js';
import { resolveMemberDirection, findDecisionForRecommendation } from '../utils/decision-recommendation.js';
import { TYPE_LABEL, RELEVANCE_LABEL, CONFIDENCE_LABEL, SITUATION_STATUS_LABEL, TREND_STATUS_LABEL, DIRECTION_LABEL } from '../utils/labels.js';

// Límite real de trazabilidad de Radar (contrato-radar.md §16): la cadena se
// detiene en la señal, sin change_id/capture_id ni endpoint dedicado - a
// diferencia de Informes. Se lo dice explícito en vez de insinuar más.
const RADAR_EVIDENCE_LIMIT = 'Esta evidencia llega hasta la señal detectada (fuente, monitor, fecha). Para ver la cadena completa hasta la fuente original, generá un Informe.';

const TABS = [
  { key: 'todos', label: 'Todos' },
  { key: 'riesgos', label: 'Riesgos' },
  { key: 'oportunidades', label: 'Oportunidades' },
  { key: 'observar', label: 'Para observar' },
];

function itemsForTab(radar, tabKey) {
  if (tabKey === 'riesgos') return radar.risks;
  if (tabKey === 'oportunidades') return radar.opportunities;
  if (tabKey === 'observar') return radar.monitor;
  return radar.changes.items;
}

function renderChangeSummary(item) {
  const types = [...new Set(item.intelligence.map((i) => i.type))];
  const badges = [renderActivityBadge(item.activity_id, { primary: item.is_primary_activity })];
  for (const t of types) badges.push(el('span', { class: `badge badge--${t}` }, TYPE_LABEL[t] ?? t));
  badges.push(el('span', {}, RELEVANCE_LABEL[item.personalized_relevance.level] ?? item.personalized_relevance.level));
  const titleParts = [item.signal.topic_id ?? 'indicador'];
  if (item.signal.direction) titleParts.push(DIRECTION_LABEL[item.signal.direction] ?? item.signal.direction);
  return el('summary', { class: 'change-item__summary' }, [
    el('div', { class: 'intelligence-item__badges' }, badges),
    el('span', { class: 'intelligence-item__title' }, titleParts.join(' — ')),
  ]);
}

function renderChangeItemDetail(item) {
  const blocks = [];
  for (const intel of item.intelligence) {
    blocks.push(
      renderEvidencePanel({ evidenceLevel: intel.evidence_level, confidence: intel.confidence, signal: item.signal, limitNote: RADAR_EVIDENCE_LIMIT })
    );
    for (const decision of intel.decisions) {
      blocks.push(renderDecisionDetail({ decisionType: decision.type, alternatives: decision.alternatives }));
      if (decision.recommendation) {
        const rec = decision.recommendation;
        const link = renderDecisionRecommendationLink({ decisionId: decision.id, recommendation: rec });
        blocks.push(
          el('ul', { class: 'intelligence-list' }, [
            renderRecommendationItem({ statement: rec.statement, type: rec.type, priority: rec.priority, evidenceLevel: rec.evidence_level, status: rec.status, linkNode: link }),
          ])
        );
      }
    }
  }
  return el('div', { class: 'change-item__detail stack' }, blocks);
}

function renderChangeItem(item) {
  return el('details', { class: 'change-item' }, [renderChangeSummary(item), renderChangeItemDetail(item)]);
}

function renderChangesSection(radar, tabKey, onTabChange) {
  const tabs = el(
    'div',
    { class: 'activity-switcher', role: 'tablist' },
    TABS.map((t) => el('button', { class: 'button--tab', type: 'button', 'aria-pressed': String(t.key === tabKey), onClick: () => onTabChange(t.key) }, t.label))
  );
  const items = itemsForTab(radar, tabKey);
  const content = items.length
    ? el('div', { class: 'stack' }, items.map(renderChangeItem))
    : renderStatusMessage({ kind: 'empty', title: 'Sin elementos para este filtro' });
  return renderProfileSection({ title: 'Cambios', content: el('div', { class: 'stack' }, [tabs, content]) });
}

function renderSituationCard(sit, changeItems) {
  const badges = sit.activity_ids.map((id) => renderActivityBadge(id));
  badges.push(el('span', { class: `badge badge--${sit.type}` }, TYPE_LABEL[sit.type] ?? sit.type));
  badges.push(el('span', { class: 'badge badge--status' }, SITUATION_STATUS_LABEL[sit.status] ?? sit.status));

  const summary = el('summary', { class: 'situation-card__summary' }, [
    el('div', { class: 'intelligence-item__badges' }, badges),
    el('span', { class: 'intelligence-item__title' }, sit.topic_id ?? 'situación'),
  ]);

  const trendText =
    sit.trend?.status === 'confirmed'
      ? `${TREND_STATUS_LABEL.confirmed} — ${DIRECTION_LABEL[sit.trend.direction] ?? sit.trend.direction}, ${sit.trend.observations} observaciones`
      : TREND_STATUS_LABEL.insufficient_evidence;

  const members = el(
    'ul',
    { class: 'intelligence-list' },
    sit.members.map((m) => {
      const direction = resolveMemberDirection(m, changeItems);
      return el('li', { class: 'intelligence-item' }, [
        renderActivityBadge(m.activity_id),
        el('span', { class: 'text-caption' }, direction ? ` ${DIRECTION_LABEL[direction] ?? direction}` : ' dirección no resuelta en este payload'),
      ]);
    })
  );

  const body = el('div', { class: 'stack' }, [
    el('p', { class: 'text-caption' }, `Relevancia: ${RELEVANCE_LABEL[sit.personalized_relevance.level] ?? sit.personalized_relevance.level}`),
    el('p', { class: 'text-caption' }, `Confianza del primer elemento analizado (no un promedio de la situación, ver GAP 17.3): ${CONFIDENCE_LABEL[sit.confidence] ?? sit.confidence}`),
    el('p', { class: 'text-caption' }, trendText),
    members,
  ]);

  return el('details', { class: 'situation-card' }, [summary, body]);
}

function renderSituationsSection(radar) {
  const items = radar.situations.items;
  const content = items.length
    ? el('div', { class: 'stack' }, items.map((sit) => renderSituationCard(sit, radar.changes.items)))
    : renderStatusMessage({ kind: 'empty', title: 'Sin situaciones seguidas por ahora', text: 'Una situación requiere evidencia de más de un elemento relacionado.' });
  return renderProfileSection({ title: 'Situaciones', content });
}

function renderRecommendationsSection(radar) {
  const items = radar.recommendations;
  const content = items.length
    ? el(
        'ul',
        { class: 'intelligence-list' },
        items.map((rec) => {
          const decision = findDecisionForRecommendation(rec, radar.changes.items);
          const link = renderDecisionRecommendationLink({ decisionId: decision?.id ?? null, recommendation: rec });
          return renderRecommendationItem({ statement: rec.statement, activityId: rec.activity_id, type: rec.type, priority: rec.priority, evidenceLevel: rec.evidence_level, status: rec.status, linkNode: link });
        })
      )
    : renderStatusMessage({ kind: 'empty', title: 'Sin recomendaciones activas' });
  return renderProfileSection({ title: 'Recomendaciones', content });
}

function renderRadar(radar, state, rerender) {
  if (radar.changes.no_relevant_changes) {
    // Mismo GAP de contrato ya documentado en pages/home.js (buildRadar() no
    // propaga el `reason` de getChanges()) - mensaje único y honesto.
    return renderStatusMessage({
      kind: 'info',
      title: 'Sin cambios relevantes por ahora',
      text: 'No se identificaron cambios relevantes para tu perfil en este momento. Puede deberse a que todavía no declaraste actividades en tu perfil, o a que no hay señales relacionadas detectadas.',
    });
  }

  const sections = [
    renderProfileSection({
      title: 'Resumen',
      content: renderSituationSummary({
        situationsCount: radar.situations.items.length,
        risksCount: radar.risks.length,
        opportunitiesCount: radar.opportunities.length,
        monitorCount: radar.monitor.length,
        recommendationsCount: radar.recommendations.length,
      }),
    }),
    renderSituationsSection(radar),
    renderChangesSection(radar, state.tab, (tab) => {
      state.tab = tab;
      rerender();
    }),
    renderRecommendationsSection(radar),
  ];

  return el('div', { class: 'stack' }, sections);
}

export function renderRadarPage() {
  const root = el('div', { class: 'stack' }, [el('h1', {}, 'Radar Productivo')]);
  const body = el('div', { class: 'stack' });
  root.append(body);

  const state = { tab: 'todos', radar: null };

  function rerender() {
    if (state.radar) body.replaceChildren(renderRadar(state.radar, state, rerender));
  }

  async function boot() {
    const activeId = loadActiveProfileId();
    if (!activeId) {
      body.replaceChildren(renderNoProfileState('Configurá tu actividad, mercados y prioridades para explorar tu Radar Productivo.'));
      return;
    }

    body.replaceChildren(renderStatusMessage({ kind: 'loading', title: 'Cargando tu Radar…' }));
    try {
      state.radar = await api.getProfileRadar(activeId);
    } catch (err) {
      console.error(err);
      if (isNotFoundError(err)) {
        body.replaceChildren(renderNoProfileState('El perfil configurado en este dispositivo ya no existe.'));
      } else {
        body.replaceChildren(renderStatusMessage({ kind: 'error', title: 'No se pudo cargar tu Radar', text: describeApiError(err) }));
      }
      return;
    }

    rerender();
  }

  boot();
  return root;
}
