// Radar Productivo (Paso 2D-2), sobre el contrato congelado en
// docs/arquitectura/contrato-radar.md y la arquitectura UX congelada en
// docs/producto/arquitectura-radar-ux.md. Fuente única: GET /profiles/:id/radar
// (una sola llamada por carga - prompt seccion 2/21). Los filtros de esta
// página (utils/radar.js) SOLO reducen la presentación de datos ya recibidos
// - nunca recalculan relevancia/inteligencia/riesgo/oportunidad/prioridad ni
// disparan una nueva petición (prompt seccion 12).
import { el } from '../utils/dom.js';
import { renderStatusMessage } from '../components/status-message.js';
import { renderProfileSection } from '../components/profile-section.js';
import { renderSituationSummary } from '../components/situation-summary.js';
import { renderRadarFilter } from '../components/radar-filter.js';
import { renderSituationCard } from '../components/situation-card.js';
import { renderChangeItem } from '../components/change-item.js';
import { renderRecommendationItem } from '../components/recommendation-item.js';
import { renderDecisionDetail } from '../components/decision-detail.js';
import * as api from '../services/api.js';
import { loadActiveProfileId } from '../state/active-profile.js';
import { describeApiError, isNotFoundError } from '../utils/profile-form.js';
import { withPreservedInteraction } from '../utils/dom-interaction.js';
import {
  uniqueActivityIds,
  uniqueRelevanceLevels,
  applyChangeFilters,
  changesForType,
  filterSituations,
  filterRecommendations,
  findDecisionForRecommendation,
} from '../utils/radar.js';

function renderNoProfileState(reason = null) {
  return el('div', { class: 'stack' }, [
    renderStatusMessage({
      kind: 'info',
      title: 'Todavía no configuraste un perfil productivo',
      text: reason ?? 'Configurá tu actividad, mercados y prioridades para explorar tu Radar.',
    }),
    el('a', { class: 'button', href: '/perfil', 'data-nav-link': 'perfil' }, 'Configurar Perfil Productivo'),
  ]);
}

// Mensajes de "sin datos reales" por pestaña de Tipo - mismo texto que ya usa
// Situación para las mismas categorías (consistencia entre ambas pantallas,
// que consumen el mismo contrato).
const CHANGE_EMPTY_TEXT = {
  all: 'Sin cambios para mostrar.',
  risk: 'Sin riesgos detectados con la evidencia actual.',
  opportunity: 'Sin oportunidades detectadas con la evidencia actual.',
  monitor: 'Nada pendiente de observación especial.',
};

function renderFilteredEmptyMessage() {
  // Distinto de "sin datos reales": el conjunto real no está vacío, solo el
  // filtro actual no coincide con nada (prompt seccion 17: los estados vacíos
  // deben ser honestos - no confundir "no hay evidencia" con "el filtro no
  // encontró nada").
  return renderStatusMessage({ kind: 'empty', title: 'Ningún elemento coincide con los filtros seleccionados', text: 'Probá ampliar la actividad o la relevancia seleccionadas.' });
}

function renderSituationsSection(radar, filters) {
  const total = radar.situations.items.length;
  const filtered = filterSituations(radar.situations.items, filters);
  let content;
  if (total === 0) {
    content = renderStatusMessage({
      kind: 'empty',
      title: 'Sin situaciones seguidas por ahora',
      text: 'Una situación requiere evidencia de más de un elemento relacionado - todavía no hay ninguna así para tu perfil.',
    });
  } else if (filtered.length === 0) {
    content = renderFilteredEmptyMessage();
  } else {
    content = el('ul', { class: 'intelligence-list' }, filtered.map((s) => renderSituationCard(s, radar.changes.items)));
  }
  return renderProfileSection({ title: 'Situaciones', description: 'Agrupaciones de elementos relacionados a través del tiempo - distinto de un cambio individual.', content });
}

function renderChangesSection(radar, filters) {
  const typeTotal = changesForType(radar, filters.type).length;
  const filtered = applyChangeFilters(radar, filters);
  let content;
  if (typeTotal === 0) {
    content = renderStatusMessage({ kind: 'empty', title: CHANGE_EMPTY_TEXT[filters.type] ?? CHANGE_EMPTY_TEXT.all });
  } else if (filtered.length === 0) {
    content = renderFilteredEmptyMessage();
  } else {
    content = el('ul', { class: 'intelligence-list' }, filtered.map(renderChangeItem));
  }
  return renderProfileSection({ title: 'Cambios', description: 'Riesgos, oportunidades y elementos para observar son vistas filtradas de este mismo conjunto, no sistemas independientes.', content });
}

function renderRecommendationsSection(radar, filters) {
  const total = radar.recommendations.length;
  const filtered = filterRecommendations(radar.recommendations, filters);
  let content;
  if (total === 0) {
    content = renderStatusMessage({ kind: 'empty', title: 'Sin recomendaciones activas para tu perfil' });
  } else if (filtered.length === 0) {
    content = renderFilteredEmptyMessage();
  } else {
    content = el(
      'ul',
      { class: 'intelligence-list' },
      filtered.map((rec) => {
        const li = renderRecommendationItem(rec);
        const related = findDecisionForRecommendation(rec, radar.changes.items);
        if (related) {
          li.append(
            el('details', {}, [
              el('summary', {}, 'Ver decisión relacionada'),
              el('p', { class: 'text-caption' }, 'Relacionada con esta actividad - el contrato no garantiza que esta decisión específica haya originado esta recomendación exacta (docs/arquitectura/contrato-radar.md §14).'),
              renderDecisionDetail(related.decision, { showRecommendation: false }),
            ])
          );
        }
        return li;
      })
    );
  }
  return renderProfileSection({
    title: 'Recomendaciones',
    description: 'Todas las recomendaciones activas del perfil, de cualquier tipo - no solo las de "Para observar".',
    content,
  });
}

function renderRadarContent(radar, filters, onFilterChange) {
  if (radar.changes.no_relevant_changes) {
    // GAP 12.6 (contrato-situacion.md/contrato-radar.md §18): mensaje único y
    // honesto, nunca se llama a /changes para reconstruir cuál de los 2 casos
    // reales ocurrió.
    return renderStatusMessage({
      kind: 'info',
      title: 'Sin información relevante por ahora',
      text: 'No se identificaron cambios relevantes para tu perfil en este momento. Puede deberse a que todavía no declaraste actividades en tu perfil, o a que no hay señales relacionadas detectadas.',
    });
  }

  const activities = uniqueActivityIds(radar.changes.items);
  const relevanceLevels = uniqueRelevanceLevels(radar.changes.items);

  return el('div', { class: 'stack' }, [
    renderProfileSection({
      title: 'Resumen',
      content: renderSituationSummary({
        situationsCount: radar.situations.items.length,
        risksCount: radar.risks.length,
        opportunitiesCount: radar.opportunities.length,
        monitorCount: radar.monitor.length,
      }),
    }),
    renderRadarFilter({ activities, relevanceLevels, current: filters, onChange: onFilterChange }),
    renderSituationsSection(radar, filters),
    renderChangesSection(radar, filters),
    renderRecommendationsSection(radar, filters),
  ]);
}

export function renderRadar() {
  const root = el('div', { class: 'stack' }, [el('h1', {}, 'Radar Productivo')]);
  const body = el('div', { class: 'stack' });
  root.append(body);

  let radarData = null;
  const filters = { type: 'all', activityId: null, relevanceLevel: null };

  // Cada cambio de filtro reconstruye body.replaceChildren(...) desde cero
  // (sin diffing - prompt seccion "sin dependencias"). Sin preservar estado,
  // eso colapsaría cualquier <details> ya expandido y perdería el foco del
  // control que el usuario acaba de usar (QA Paso 2D-3, defecto real
  // encontrado y corregido aquí). Mecanismo compartido con pages/informes.js
  // desde el Paso 2E-2 - ver utils/dom-interaction.js.
  function rerender() {
    withPreservedInteraction(body, () => {
      body.replaceChildren(
        renderRadarContent(radarData, filters, (patch) => {
          Object.assign(filters, patch);
          rerender();
        })
      );
    });
  }

  async function boot() {
    const activeId = loadActiveProfileId();
    if (!activeId) {
      body.replaceChildren(renderNoProfileState());
      return;
    }

    body.replaceChildren(renderStatusMessage({ kind: 'loading', title: 'Cargando tu Radar…' }));
    try {
      radarData = await api.getProfileRadar(activeId);
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
