// Informes (Paso 2E-2), sobre el contrato congelado en
// docs/arquitectura/contrato-informes.md y la arquitectura UX congelada en
// docs/producto/arquitectura-informes-ux.md. Página única con estado interno
// (Catálogo/Mis informes/Detalle) - sin rutas nuevas (arquitectura-informes-
// ux.md §4/§5). El frontend NUNCA recalcula relevancia/inteligencia/decisión/
// recomendación: solo arma los params reales de generación y presenta el
// `body`/`claims` ya construidos por backend/reports/build.js.
import { el } from '../utils/dom.js';
import { renderStatusMessage } from '../components/status-message.js';
import { renderProfileSection } from '../components/profile-section.js';
import { renderReportCatalogCard } from '../components/report-catalog-card.js';
import { renderReportConfigPanel } from '../components/report-config-panel.js';
import { renderReportHeader } from '../components/report-header.js';
import { renderReportComparison } from '../components/report-comparison.js';
import { renderReportClaimList } from '../components/report-claim-list.js';
import { renderSituationCard } from '../components/situation-card.js';
import { renderTraceabilityPanel } from '../components/traceability-panel.js';
import { renderNarrativeSection } from '../components/narrative-section.js';
import { renderReportHistoryList } from '../components/report-history-list.js';
import { renderReportVersionsPanel } from '../components/report-versions-panel.js';
import * as api from '../services/api.js';
import { loadActiveProfileId } from '../state/active-profile.js';
import { describeApiError, isNotFoundError } from '../utils/profile-form.js';
import { withPreservedInteraction } from '../utils/dom-interaction.js';
import { REPORT_TYPES, buildGenerateParams, classifyGenerateError, sectionClaims, SECTION_KEYS, SECTION_LABEL, SECTION_EMPTY_TEXT } from '../utils/reports.js';

function renderCatalogsError(message) {
  return renderStatusMessage({ kind: 'error', title: 'No se pudo cargar el catálogo de Informes', text: message });
}

function renderStandardBody(report) {
  const body = report.body;
  const sections = [];

  const execClaims = body.executive_summary?.claims ?? [];
  sections.push(
    renderProfileSection({
      title: 'Resumen ejecutivo',
      content: execClaims.length ? renderReportClaimList(execClaims, '') : renderStatusMessage({ kind: 'empty', title: 'Sin información de alta relevancia para esta síntesis' }),
    })
  );

  if (body.current_situation?.situations) {
    const situations = body.current_situation.situations;
    sections.push(
      renderProfileSection({
        title: 'Situación actual',
        description: 'Agrupaciones de elementos relacionados a través del tiempo, ya resueltas por el Radar Productivo.',
        content: situations.length
          ? el('ul', { class: 'intelligence-list' }, situations.map((s) => renderSituationCard(s, [])))
          : renderStatusMessage({ kind: 'empty', title: 'Sin situaciones activas para este alcance' }),
      })
    );
  }

  for (const key of SECTION_KEYS) {
    sections.push(renderProfileSection({ title: SECTION_LABEL[key], content: renderReportClaimList(sectionClaims(body, key), SECTION_EMPTY_TEXT[key]) }));
  }

  sections.push(
    renderProfileSection({
      title: 'Fuentes',
      content: body.sources.length
        ? el('ul', { class: 'intelligence-list' }, body.sources.map((s) => el('li', { class: 'report-claim-item' }, `${s.name}${s.institution ? ` — ${s.institution}` : ''}`)))
        : renderStatusMessage({ kind: 'empty', title: 'Sin fuentes asociadas a este alcance' }),
    })
  );

  return el('div', { class: 'stack' }, sections);
}

export function renderInformes() {
  const root = el('div', { class: 'stack' }, [el('h1', {}, 'Informes')]);
  const body = el('div', { class: 'stack' });
  root.append(body);

  const state = {
    view: 'catalog', // 'catalog' | 'history' | 'detail'
    cameFrom: 'catalog',
    catalogs: null,
    catalogsError: null,
    configForms: {},
    generating: null,
    generateError: null, // { typeId, kind, message }
    history: { status: 'idle', reports: [] },
    report: null,
    reportStatus: 'idle', // idle | loading | loaded | error | not_found
    reportError: null,
    traceability: { status: 'idle', entries: [], error: null },
    versions: { status: 'idle', versions: [], error: null },
    narrative: { status: 'idle', narrative: null, error: null, aiConfirmOpen: false },
  };

  function rerender() {
    withPreservedInteraction(body, () => body.replaceChildren(renderView()));
  }

  function formFor(typeId) {
    if (!state.configForms[typeId]) state.configForms[typeId] = {};
    return state.configForms[typeId];
  }

  function resetDetailState() {
    state.traceability = { status: 'idle', entries: [], error: null };
    state.versions = { status: 'idle', versions: [], error: null };
    state.narrative = { status: 'idle', narrative: null, error: null, aiConfirmOpen: false };
  }

  async function handleGenerate(typeId, params) {
    state.generating = typeId;
    state.generateError = null;
    rerender();
    try {
      state.report = await api.generateReport(params);
      resetDetailState();
      state.view = 'detail';
      state.cameFrom = 'catalog';
    } catch (err) {
      console.error(err);
      const kind = classifyGenerateError(err);
      state.generateError = { typeId, kind, message: kind === 'network' ? describeApiError(err) : err.message };
    }
    state.generating = null;
    rerender();
  }

  async function openReport(id, from) {
    state.cameFrom = from;
    state.view = 'detail';
    state.reportStatus = 'loading';
    rerender();
    try {
      state.report = await api.getReport(id);
      state.reportStatus = 'loaded';
    } catch (err) {
      console.error(err);
      state.reportStatus = isNotFoundError(err) ? 'not_found' : 'error';
      state.reportError = err;
    }
    resetDetailState();
    rerender();
  }

  async function loadHistory() {
    const activeId = loadActiveProfileId();
    if (!activeId) {
      state.history = { status: 'no-profile', reports: [] };
      rerender();
      return;
    }
    state.history = { status: 'loading', reports: [] };
    rerender();
    try {
      const res = await api.listReports({ profileId: activeId });
      state.history = { status: 'loaded', reports: res.reports };
    } catch (err) {
      console.error(err);
      state.history = { status: 'error', reports: [], error: describeApiError(err) };
    }
    rerender();
  }

  function switchTab(view) {
    state.view = view;
    if (view === 'history' && state.history.status === 'idle') loadHistory();
    else rerender();
  }

  async function loadTraceability() {
    if (state.traceability.status !== 'idle') return;
    state.traceability.status = 'loading';
    rerender();
    try {
      const res = await api.getReportTraceability(state.report.id);
      state.traceability = { status: 'loaded', entries: res.traceability, error: null };
    } catch (err) {
      console.error(err);
      state.traceability = { status: 'error', entries: [], error: describeApiError(err) };
    }
    rerender();
  }

  async function loadVersions() {
    if (state.versions.status !== 'idle') return;
    state.versions.status = 'loading';
    rerender();
    try {
      const res = await api.getReportVersions(state.report.id);
      state.versions = { status: 'loaded', versions: res.versions, error: null };
    } catch (err) {
      console.error(err);
      state.versions = { status: 'error', versions: [], error: describeApiError(err) };
    }
    rerender();
  }

  async function loadNarrative() {
    if (state.narrative.status !== 'idle') return;
    state.narrative.status = 'loading';
    rerender();
    try {
      state.narrative = { status: 'loaded', narrative: await api.getReportNarrative(state.report.id), error: null, aiConfirmOpen: false };
    } catch (err) {
      if (isNotFoundError(err)) state.narrative = { status: 'none', narrative: null, error: null, aiConfirmOpen: false };
      else {
        console.error(err);
        state.narrative = { status: 'error', narrative: null, error: describeApiError(err), aiConfirmOpen: false };
      }
    }
    rerender();
  }

  async function generateNarrative(mode) {
    state.narrative = { ...state.narrative, status: 'generating', aiConfirmOpen: false };
    rerender();
    try {
      state.narrative = { status: 'loaded', narrative: await api.generateReportNarrative(state.report.id, { mode }), error: null, aiConfirmOpen: false };
    } catch (err) {
      console.error(err);
      state.narrative = { status: 'error', narrative: null, error: describeApiError(err), aiConfirmOpen: false };
    }
    rerender();
  }

  function renderCatalogView() {
    if (state.catalogsError) return renderCatalogsError(state.catalogsError);
    if (!state.catalogs) return renderStatusMessage({ kind: 'loading', title: 'Cargando catálogo…' });

    const activeId = loadActiveProfileId();
    const cards = REPORT_TYPES.map((t) => {
      if (t.disabled) return renderReportCatalogCard(t);

      const err = state.generateError?.typeId === t.id ? state.generateError : null;
      const extra = [];
      if (state.generating === t.id) extra.push(renderStatusMessage({ kind: 'loading', title: 'Generando informe…' }));
      if (err) {
        extra.push(
          err.kind === 'validation'
            ? renderStatusMessage({ kind: 'warning', title: 'Revisá la configuración', text: err.message })
            : err.kind === 'network'
              ? renderStatusMessage({ kind: 'error', title: 'No se pudo conectar con el servidor', text: err.message })
              : renderStatusMessage({ kind: 'error', title: 'No se pudo generar el informe', text: 'Ocurrió un error inesperado. Intentá de nuevo más tarde.' })
        );
      }

      const configNode = el('div', { class: 'stack' }, [
        renderReportConfigPanel({
          typeId: t.id,
          catalogs: state.catalogs,
          activeProfileId: activeId,
          form: formFor(t.id),
          onFormChange: (patch) => { Object.assign(formFor(t.id), patch); rerender(); },
          onGenerate: (params) => handleGenerate(t.id, buildGenerateParams(t.id, params)),
        }),
        ...extra,
      ]);

      return renderReportCatalogCard(t, configNode);
    });

    return el('ul', { class: 'report-catalog stack' }, cards);
  }

  function renderHistoryView() {
    if (state.history.status === 'no-profile') {
      return renderStatusMessage({ kind: 'info', title: 'Necesitás un perfil activo para ver tu historial', text: 'Configurá o elegí un perfil en Perfil Productivo.' });
    }
    if (state.history.status === 'loading') return renderStatusMessage({ kind: 'loading', title: 'Cargando tu historial…' });
    if (state.history.status === 'error') return renderStatusMessage({ kind: 'error', title: 'No se pudo cargar tu historial', text: state.history.error });
    return renderReportHistoryList(state.history.reports, (id) => openReport(id, 'history'));
  }

  function renderDetailView() {
    const backLink = el('a', { href: '#', class: 'button--secondary button', onClick: (e) => { e.preventDefault(); state.view = state.cameFrom; rerender(); } }, `← Volver a ${state.cameFrom === 'history' ? 'Mis informes' : 'Generar'}`);

    if (state.reportStatus === 'loading') return el('div', { class: 'stack' }, [backLink, renderStatusMessage({ kind: 'loading', title: 'Cargando informe…' })]);
    if (state.reportStatus === 'not_found') return el('div', { class: 'stack' }, [backLink, renderStatusMessage({ kind: 'error', title: 'Este informe ya no existe' })]);
    if (state.reportStatus === 'error') return el('div', { class: 'stack' }, [backLink, renderStatusMessage({ kind: 'error', title: 'No se pudo cargar el informe', text: describeApiError(state.reportError) })]);

    const report = state.report;
    const content = report.type === 'periodic' ? renderReportComparison(report.body) : renderStandardBody(report);

    return el('div', { class: 'stack' }, [
      backLink,
      renderReportHeader(report),
      content,
      renderProfileSection({ title: 'Trazabilidad', content: renderTraceabilityPanel({ ...state.traceability, onLoad: loadTraceability }) }),
      renderNarrativeSection({
        ...state.narrative,
        onLoad: loadNarrative,
        onGenerateDeterministic: () => generateNarrative('deterministic'),
        onRequestAiConfirm: () => { state.narrative.aiConfirmOpen = true; rerender(); },
        onConfirmAi: () => generateNarrative('ai'),
        onCancelAiConfirm: () => { state.narrative.aiConfirmOpen = false; rerender(); },
      }),
      renderProfileSection({ title: 'Versiones', content: renderReportVersionsPanel({ ...state.versions, currentId: report.id, onLoad: loadVersions, onOpen: (id) => openReport(id, state.cameFrom) }) }),
    ]);
  }

  function renderView() {
    if (state.view === 'detail') return renderDetailView();
    const tabs = el('div', { class: 'activity-switcher', role: 'group', 'aria-label': 'Sección de Informes' }, [
      el('button', { type: 'button', class: 'button--tab', 'data-filter-key': 'tab:catalog', 'aria-pressed': String(state.view === 'catalog'), onClick: () => switchTab('catalog') }, 'Generar'),
      el('button', { type: 'button', class: 'button--tab', 'data-filter-key': 'tab:history', 'aria-pressed': String(state.view === 'history'), onClick: () => switchTab('history') }, 'Mis informes'),
    ]);
    return el('div', { class: 'stack' }, [tabs, state.view === 'history' ? renderHistoryView() : renderCatalogView()]);
  }

  async function boot() {
    body.replaceChildren(renderStatusMessage({ kind: 'loading', title: 'Cargando catálogo de Informes…' }));
    try {
      state.catalogs = await api.getProfileCatalogs();
    } catch (err) {
      console.error(err);
      state.catalogsError = describeApiError(err);
    }

    // Deep-link liviano ?report=<id> (arquitectura-informes-ux.md §5/§25),
    // leído una sola vez al montar - nunca genera, solo abre si existe.
    const deepLinkId = new URLSearchParams(window.location.search).get('report');
    if (deepLinkId) {
      await openReport(deepLinkId, 'catalog');
    } else {
      rerender();
    }
  }

  boot();
  return root;
}
