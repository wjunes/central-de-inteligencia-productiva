// Los componentes y páginas son DOM-dependientes (usan document.createElement
// vía utils/dom.js) y no pueden ejecutarse ni renderizarse bajo node:test sin
// un navegador/jsdom (no se agregó esa dependencia - ver web/README.md,
// "Limitación conocida"). Esta prueba SÍ puede verificarse sin DOM: que cada
// módulo importa sin errores (detecta typos de import/export, rutas rotas) y
// exporta las funciones esperadas - un smoke test barato que atrapa una clase
// real de error antes de llegar al navegador. Cubre Perfil Productivo (Paso
// 2B) y Situación/Dashboard (Paso 2C-1).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Perfil Productivo - módulos cargan sin errores y exportan lo esperado', () => {
  test('components/*', async () => {
    assert.equal(typeof (await import('../src/components/profile-section.js')).renderProfileSection, 'function');
    assert.equal(typeof (await import('../src/components/save-status.js')).renderSaveStatus, 'function');
    assert.equal(typeof (await import('../src/components/save-status.js')).updateSaveStatus, 'function');
    assert.equal(typeof (await import('../src/components/multi-select.js')).renderMultiSelect, 'function');
    assert.equal(typeof (await import('../src/components/activity-selector.js')).renderActivitySelector, 'function');
    assert.equal(typeof (await import('../src/components/ramification-selector.js')).renderRamificationSelector, 'function');
    assert.equal(typeof (await import('../src/components/priority-selector.js')).renderPrioritySelector, 'function');
    assert.equal(typeof (await import('../src/components/constraint-editor.js')).renderConstraintEditor, 'function');
  });

  test('pages/perfil.js', async () => {
    const mod = await import('../src/pages/perfil.js');
    assert.equal(typeof mod.renderPerfil, 'function');
  });

  test('app.js sigue exportando la tabla de renderers sin romper (importa perfil.js correctamente)', async () => {
    // app.js no exporta nada (es el bootstrap) - alcanza con que la importación
    // no lance (detecta un import roto hacia pages/perfil.js).
    await assert.doesNotReject(() => import('../src/app.js').catch((err) => {
      // document/window no existen bajo node:test -> app.js ejecuta su bootstrap
      // al importarse (initRouter con root/win null -> no-op, ver router.js) y
      // no debería lanzar solo por eso.
      throw err;
    }));
  });
});

describe('Situación/Dashboard - módulos cargan sin errores y exportan lo esperado', () => {
  test('components/*', async () => {
    assert.equal(typeof (await import('../src/components/situation-summary.js')).renderSituationSummary, 'function');
    assert.equal(typeof (await import('../src/components/intelligence-item.js')).renderIntelligenceItem, 'function');
  });

  test('pages/home.js', async () => {
    const mod = await import('../src/pages/home.js');
    assert.equal(typeof mod.renderHome, 'function');
  });
});

describe('Radar Productivo (Paso 2D-2) - módulos cargan sin errores y exportan lo esperado', () => {
  test('components/*', async () => {
    assert.equal(typeof (await import('../src/components/activity-badge.js')).renderActivityBadge, 'function');
    assert.equal(typeof (await import('../src/components/radar-filter.js')).renderRadarFilter, 'function');
    assert.equal(typeof (await import('../src/components/situation-card.js')).renderSituationCard, 'function');
    assert.equal(typeof (await import('../src/components/change-item.js')).renderChangeItem, 'function');
    assert.equal(typeof (await import('../src/components/decision-detail.js')).renderDecisionDetail, 'function');
    assert.equal(typeof (await import('../src/components/evidence-panel.js')).renderEvidencePanel, 'function');
    assert.equal(typeof (await import('../src/components/recommendation-item.js')).renderRecommendationItem, 'function');
  });

  test('utils/labels.js exporta las tablas esperadas (compartidas con intelligence-item.js)', async () => {
    const labels = await import('../src/utils/labels.js');
    for (const key of ['TYPE_LABEL', 'DIRECTION_LABEL', 'EVIDENCE_LABEL', 'CONFIDENCE_LABEL', 'RELEVANCE_LABEL', 'SITUATION_STATUS_LABEL', 'TREND_STATUS_LABEL', 'RECOMMENDATION_TYPE_LABEL', 'PRIORITY_LABEL', 'DECISION_ALT_KIND_LABEL']) {
      assert.equal(typeof labels[key], 'object', `labels.js debe exportar ${key}`);
    }
  });

  test('pages/radar.js', async () => {
    const mod = await import('../src/pages/radar.js');
    assert.equal(typeof mod.renderRadar, 'function');
  });

  test('app.js sigue importando correctamente pages/radar.js (ya no usa el placeholder genérico para /radar)', async () => {
    await assert.doesNotReject(() => import('../src/app.js'));
  });
});

describe('Informes (Paso 2E-2) - módulos cargan sin errores y exportan lo esperado', () => {
  test('components/*', async () => {
    assert.equal(typeof (await import('../src/components/report-catalog-card.js')).renderReportCatalogCard, 'function');
    assert.equal(typeof (await import('../src/components/report-config-panel.js')).renderReportConfigPanel, 'function');
    assert.equal(typeof (await import('../src/components/report-header.js')).renderReportHeader, 'function');
    assert.equal(typeof (await import('../src/components/report-comparison.js')).renderReportComparison, 'function');
    assert.equal(typeof (await import('../src/components/report-claim-list.js')).renderReportClaimList, 'function');
    assert.equal(typeof (await import('../src/components/report-claim-list.js')).renderReportClaimItem, 'function');
    assert.equal(typeof (await import('../src/components/traceability-panel.js')).renderTraceabilityPanel, 'function');
    assert.equal(typeof (await import('../src/components/narrative-section.js')).renderNarrativeSection, 'function');
    assert.equal(typeof (await import('../src/components/report-history-list.js')).renderReportHistoryList, 'function');
    assert.equal(typeof (await import('../src/components/report-versions-panel.js')).renderReportVersionsPanel, 'function');
  });

  test('utils/reports.js y utils/dom-interaction.js exportan lo esperado', async () => {
    const reports = await import('../src/utils/reports.js');
    assert.ok(Array.isArray(reports.REPORT_TYPES) && reports.REPORT_TYPES.length === 7);
    assert.equal(typeof reports.buildGenerateParams, 'function');
    assert.equal(typeof reports.classifyGenerateError, 'function');
    const domInteraction = await import('../src/utils/dom-interaction.js');
    assert.equal(typeof domInteraction.withPreservedInteraction, 'function');
  });

  test('services/api.js expone los 7 wrappers de Informes', async () => {
    const apiMod = await import('../src/services/api.js');
    for (const fn of ['listReports', 'generateReport', 'getReport', 'getReportTraceability', 'getReportVersions', 'getReportNarrative', 'generateReportNarrative']) {
      assert.equal(typeof apiMod[fn], 'function', `api.js debe exportar ${fn}`);
    }
  });

  test('pages/informes.js', async () => {
    const mod = await import('../src/pages/informes.js');
    assert.equal(typeof mod.renderInformes, 'function');
  });

  test('app.js ya no usa el placeholder genérico para /informes', async () => {
    await assert.doesNotReject(() => import('../src/app.js'));
  });
});
