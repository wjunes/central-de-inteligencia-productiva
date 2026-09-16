// Informes (Paso 2F-2) - alcance de esta etapa: visor de UN informe ya
// generado, accedido por deep-link (`?report=<id>`), leído una vez al
// montar (mismo mecanismo ya anticipado en arquitectura-informes-ux.md §5,
// no implementado hasta ahora). NO incluye catálogo/generación de informes:
// el enunciado de 2F-2 solo habilita GET /reports/:id y GET /reports/:id/
// traceability, no GET /reports (listado) ni POST /reports/generate - por
// lo tanto no hay forma de listar ni generar informes desde esta pantalla
// en esta etapa (decisión de alcance explícita, no una omisión).
import { el } from '../utils/dom.js';
import { renderStatusMessage } from '../components/status-message.js';
import { renderProfileSection } from '../components/profile-section.js';
import { renderActivityBadge } from '../components/activity-badge.js';
import { renderDecisionDetail } from '../components/decision-detail.js';
import { renderRecommendationItem } from '../components/recommendation-item.js';
import { renderDecisionRecommendationLink } from '../components/decision-recommendation-link.js';
import { renderTraceabilityPanel } from '../components/traceability-panel.js';
import * as api from '../services/api.js';
import { describeApiError, isNotFoundError } from '../utils/profile-form.js';
import { TYPE_LABEL, RELEVANCE_LABEL, EVIDENCE_LABEL } from '../utils/labels.js';

const SECTION_TITLES = {
  changes: '¿Qué cambió?',
  trends: 'Tendencias',
  impacts: 'Impactos',
  risks: 'Riesgos',
  opportunities: 'Oportunidades',
  decisions: 'Decisiones consideradas',
  recommendations: 'Recomendaciones',
  uncertainty: 'Incertidumbre',
};

function reportIdFromUrl() {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('report');
}

function renderViewerInstructions() {
  return renderStatusMessage({
    kind: 'info',
    title: 'Visor de informes',
    text: 'Esta vista muestra un informe ya generado a partir de un enlace (por ejemplo, ?report=<id> en la URL). Esta etapa no incluye el catálogo ni la generación de informes nuevos.',
  });
}

function renderGenericClaim(claim) {
  const badges = [renderActivityBadge(claim.activity_id)];
  if (['risk', 'opportunity', 'impact', 'trend'].includes(claim.type)) {
    badges.push(el('span', { class: `badge badge--${claim.type}` }, TYPE_LABEL[claim.type] ?? claim.type));
  }
  if (claim.importance && claim.importance !== 'none') {
    badges.push(el('span', {}, RELEVANCE_LABEL[claim.importance] ?? claim.importance));
  }
  const children = [el('div', { class: 'intelligence-item__badges' }, badges), el('p', { class: 'intelligence-item__title' }, claim.text)];
  if (claim.evidence_level) children.push(el('p', { class: 'text-caption' }, EVIDENCE_LABEL[claim.evidence_level] ?? claim.evidence_level));
  return el('li', { class: 'intelligence-item' }, children);
}

function renderDecisionClaim(claim) {
  // El claim de tipo 'decision' NO expone alternatives[]/decision_type como
  // campos propios (backend/reports/claims.js - solo se usan para redactar
  // claim.text, verificado en 2F-2/Fase 1) - se muestra el texto ya
  // redactado, sin fabricar las 2 alternativas que Radar sí puede mostrar.
  return el('li', { class: 'intelligence-item' }, [
    el('div', { class: 'intelligence-item__badges' }, [renderActivityBadge(claim.activity_id)]),
    renderDecisionDetail({ text: claim.text }),
  ]);
}

function renderRecommendationClaim(claim) {
  // El claim de recomendación tampoco expone `recommendation.type` ni el
  // `decision_id` REAL de la recomendación (solo `references.decision_id`,
  // que es la decisión bajo la que el backend la anidó al construir el
  // informe - no necesariamente su origen verificado, mismo GAP 17.7). Por
  // eso el vínculo siempre usa lenguaje contextual aquí, nunca directo -
  // afirmar lo contrario sin el campo real sería inventar la comprobación.
  const link = renderDecisionRecommendationLink({ decisionId: null, recommendation: { decision_id: null } });
  return renderRecommendationItem({ statement: claim.text, activityId: claim.activity_id, priority: claim.importance, evidenceLevel: claim.evidence_level, linkNode: link });
}

function renderClaim(claim) {
  if (claim.type === 'decision') return renderDecisionClaim(claim);
  if (claim.type === 'recommendation') return renderRecommendationClaim(claim);
  return renderGenericClaim(claim);
}

function renderClaimsSection(section, sectionBody) {
  const claims = sectionBody.claims ?? [];
  const content = claims.length
    ? el('ul', { class: 'intelligence-list' }, claims.map(renderClaim))
    : renderStatusMessage({ kind: 'empty', title: 'Sin información para esta sección' });
  return renderProfileSection({ title: SECTION_TITLES[section] ?? section, content });
}

function renderHeader(report) {
  const parts = [
    el('p', { class: 'text-secondary' }, `Tipo: ${report.type}`),
    el('p', { class: 'text-secondary' }, `Generado: ${report.created_at}`),
  ];
  if (report.status === 'superseded') parts.push(renderStatusMessage({ kind: 'warning', title: 'Versión anterior', text: 'Existe una versión más reciente con el mismo alcance.' }));
  return el('div', { class: 'stack' }, [el('h1', {}, report.title ?? 'Informe'), ...parts]);
}

function renderExecutiveSummary(report) {
  const claims = report.body.executive_summary?.claims ?? [];
  const content = claims.length
    ? el('ul', { class: 'intelligence-list' }, claims.map(renderClaim))
    : renderStatusMessage({ kind: 'empty', title: 'Sin claims de alta importancia' });
  return renderProfileSection({ title: 'Resumen ejecutivo', content });
}

function renderComparison(report) {
  const comparisons = report.body.comparisons;
  if (comparisons?.insufficient_evidence) {
    return renderStatusMessage({ kind: 'empty', title: 'Sin comparación disponible', text: comparisons.reason ?? 'No hay observación en uno o ambos períodos comparados.' });
  }
  const claims = comparisons?.claims ?? [];
  return claims.length
    ? el('ul', { class: 'intelligence-list' }, claims.map(renderGenericClaim))
    : renderStatusMessage({ kind: 'empty', title: 'Sin comparación disponible' });
}

function renderSources(report) {
  const sources = report.sources ?? [];
  const content = sources.length
    ? el('ul', {}, sources.map((s) => el('li', {}, `${s.name ?? s.id}${s.institution ? ` — ${s.institution}` : ''}`)))
    : renderStatusMessage({ kind: 'empty', title: 'Sin fuentes registradas' });
  return renderProfileSection({ title: 'Fuentes', content });
}

function renderReportBody(report, state, rerender) {
  const sections = [renderHeader(report)];

  if (report.type === 'periodic') {
    // periodic no pasa por intelligence/decisions (contrato-informes.md
    // §16) - plantilla propia y más corta, sin las secciones estándar
    // vacías (mismo criterio ya congelado en arquitectura-informes-ux.md §11).
    sections.push(renderProfileSection({ title: 'Comparación de período', content: renderComparison(report) }));
  } else {
    sections.push(renderExecutiveSummary(report));
    for (const section of ['changes', 'trends', 'impacts', 'risks', 'opportunities', 'decisions', 'recommendations', 'uncertainty']) {
      sections.push(renderClaimsSection(section, report.body[section]));
    }
  }

  sections.push(renderSources(report));

  sections.push(
    renderProfileSection({
      title: 'Trazabilidad',
      content: renderTraceabilityPanel({
        chain: state.traceability,
        loading: state.traceabilityLoading,
        open: state.traceabilityOpen,
        onLoad: async () => {
          if (state.traceability || state.traceabilityLoading) return;
          state.traceabilityOpen = true;
          state.traceabilityLoading = true;
          rerender();
          try {
            const res = await api.getReportTraceability(report.id);
            state.traceability = res.traceability;
          } catch (err) {
            console.error(err);
            state.traceability = [];
          }
          state.traceabilityLoading = false;
          rerender();
        },
      }),
    })
  );

  return el('div', { class: 'stack' }, sections);
}

export function renderInformesPage() {
  const root = el('div', { class: 'stack' }, [el('h1', {}, 'Informes')]);
  const body = el('div', { class: 'stack' });
  root.append(body);

  const state = { report: null, traceability: null, traceabilityLoading: false, traceabilityOpen: false };

  function rerender() {
    if (state.report) body.replaceChildren(renderReportBody(state.report, state, rerender));
  }

  async function boot() {
    const reportId = reportIdFromUrl();
    if (!reportId) {
      body.replaceChildren(renderViewerInstructions());
      return;
    }

    body.replaceChildren(renderStatusMessage({ kind: 'loading', title: 'Cargando informe…' }));
    try {
      state.report = await api.getReport(reportId);
    } catch (err) {
      console.error(err);
      if (isNotFoundError(err)) {
        body.replaceChildren(renderStatusMessage({ kind: 'error', title: 'Informe no encontrado', text: 'El informe solicitado no existe.' }));
      } else {
        body.replaceChildren(renderStatusMessage({ kind: 'error', title: 'No se pudo cargar el informe', text: describeApiError(err) }));
      }
      return;
    }

    rerender();
  }

  boot();
  return root;
}
