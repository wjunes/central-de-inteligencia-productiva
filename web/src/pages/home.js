// Situación (Paso 2C-1): pantalla principal, sobre el contrato congelado en
// docs/arquitectura/contrato-situacion.md. Fuente única: GET /profiles/:id/radar
// (una sola llamada - prompt seccion 9). El frontend NUNCA recalcula
// relevancia/riesgo/oportunidad/confianza/prioridad - solo presenta lo que
// el Radar ya resolvió (prompt seccion 16).
import { el } from '../utils/dom.js';
import { renderStatusMessage } from '../components/status-message.js';
import { renderProfileSection } from '../components/profile-section.js';
import { renderSituationSummary } from '../components/situation-summary.js';
import { renderIntelligenceItem } from '../components/intelligence-item.js';
import { renderNoProfileState } from '../components/no-profile-state.js';
import * as api from '../services/api.js';
import { loadActiveProfileId } from '../state/active-profile.js';
import { describeApiError, isNotFoundError } from '../utils/profile-form.js';
import { itemsByIntelligenceType, monitorEntries, primaryActivityId } from '../utils/situation.js';

function renderTypedSection(title, items, type, emptyText, description = null) {
  const entries = itemsByIntelligenceType(items, type);
  const content = entries.length
    ? el(
        'ul',
        { class: 'intelligence-list' },
        entries.map(({ item, intel }) =>
          renderIntelligenceItem({
            kind: intel.type,
            activityId: item.activity_id,
            topicId: item.signal.topic_id,
            direction: item.signal.direction,
            evidenceLevel: intel.evidence_level,
            confidence: intel.confidence?.analysis_confidence,
            relevanceLevel: item.personalized_relevance.level,
          })
        )
      )
    : renderStatusMessage({ kind: 'empty', title: emptyText });
  return renderProfileSection({ title, description, content });
}

function renderHighlightedIntelligence(situations) {
  const content = situations.length
    ? el(
        'ul',
        { class: 'intelligence-list' },
        situations.map((sit) =>
          renderIntelligenceItem({
            kind: sit.type,
            activityId: sit.activity_ids.join(', '),
            topicId: sit.topic_id,
            evidenceLevel: null,
            confidence: sit.confidence,
            relevanceLevel: sit.personalized_relevance.level,
            situationStatus: sit.status,
            trend: sit.trend,
          })
        )
      )
    : renderStatusMessage({ kind: 'empty', title: 'Sin situaciones seguidas por ahora', text: 'Una situación requiere evidencia de más de un elemento relacionado - todavía no hay ninguna así para tu perfil.' });
  return renderProfileSection({ title: 'Inteligencia destacada', description: 'Situaciones seguidas a través del tiempo (distinto de los cambios individuales de arriba).', content });
}

function renderWatchSection(monitorItems) {
  const entries = monitorEntries(monitorItems);
  const content = entries.length
    ? el(
        'ul',
        { class: 'intelligence-list' },
        entries.map(({ item, intel, rec }) =>
          renderIntelligenceItem({
            kind: intel.type,
            activityId: item.activity_id,
            topicId: item.signal.topic_id,
            direction: item.signal.direction,
            relevanceLevel: item.personalized_relevance.level,
            recommendationText: rec.statement,
            recommendationEvidenceLevel: rec.evidence_level,
          })
        )
      )
    : renderStatusMessage({ kind: 'empty', title: 'Nada pendiente de observación especial' });
  return renderProfileSection({ title: 'Para observar', content });
}

function renderSituation(radar) {
  if (radar.changes.no_relevant_changes) {
    // GAP de contrato detectado en esta etapa (ver informe): GET /profiles/:id/radar
    // no propaga el "reason" que sí trae GET /profiles/:id/changes para distinguir
    // "sin actividades declaradas" de "sin señales relacionadas" - se usa un
    // mensaje único y honesto para ambos casos en vez de reconstruirlo en frontend.
    return renderStatusMessage({
      kind: 'info',
      title: 'Sin cambios relevantes por ahora',
      text: 'No se identificaron cambios relevantes para tu perfil en este momento. Puede deberse a que todavía no declaraste actividades en tu perfil, o a que no hay señales relacionadas detectadas.',
    });
  }

  const primary = primaryActivityId(radar.changes.items);
  const sections = [];

  if (primary) sections.push(el('p', { class: 'text-secondary' }, `Actividad principal: ${primary}`));

  sections.push(
    renderProfileSection({
      title: 'Resumen',
      content: renderSituationSummary({
        situationsCount: radar.situations.items.length,
        risksCount: radar.risks.length,
        opportunitiesCount: radar.opportunities.length,
        monitorCount: radar.monitor.length,
      }),
    })
  );

  sections.push(renderTypedSection('¿Qué cambió para mí?', radar.changes.items, null, 'Sin cambios para mostrar'));
  sections.push(renderTypedSection('Riesgos', radar.risks, 'risk', 'Sin riesgos detectados con la evidencia actual'));
  sections.push(renderTypedSection('Oportunidades', radar.opportunities, 'opportunity', 'Sin oportunidades detectadas con la evidencia actual'));
  sections.push(renderHighlightedIntelligence(radar.situations.items));
  sections.push(renderWatchSection(radar.monitor));

  return el('div', { class: 'stack' }, sections);
}

export function renderHome() {
  const root = el('div', { class: 'stack' }, [el('h1', {}, 'Situación')]);
  const body = el('div', { class: 'stack' });
  root.append(body);

  async function boot() {
    const activeId = loadActiveProfileId();
    if (!activeId) {
      body.replaceChildren(renderNoProfileState('Configurá tu actividad, mercados y prioridades para ver tu situación personalizada.'));
      return;
    }

    body.replaceChildren(renderStatusMessage({ kind: 'loading', title: 'Cargando tu situación…' }));
    let radar;
    try {
      radar = await api.getProfileRadar(activeId);
    } catch (err) {
      console.error(err);
      if (isNotFoundError(err)) {
        body.replaceChildren(renderNoProfileState('El perfil configurado en este dispositivo ya no existe.'));
      } else {
        body.replaceChildren(renderStatusMessage({ kind: 'error', title: 'No se pudo cargar tu situación', text: describeApiError(err) }));
      }
      return;
    }

    body.replaceChildren(renderSituation(radar));
  }

  boot();
  return root;
}
