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

describe('Radar / Informes / Decisiones y Recomendaciones (Paso 2F-2) - módulos cargan sin errores y exportan lo esperado', () => {
  test('utils/*', async () => {
    const labels = await import('../src/utils/labels.js');
    assert.equal(typeof labels.TYPE_LABEL, 'object');
    assert.equal(typeof labels.RECOMMENDATION_TYPE_LABEL, 'object');
    assert.equal(typeof labels.alternativeLabel, 'function');

    const dr = await import('../src/utils/decision-recommendation.js');
    assert.equal(typeof dr.isDirectRelation, 'function');
    assert.equal(typeof dr.relationLabel, 'function');
    assert.equal(typeof dr.findDecisionForRecommendation, 'function');
    assert.equal(typeof dr.resolveMemberDirection, 'function');
  });

  test('components/*', async () => {
    assert.equal(typeof (await import('../src/components/activity-badge.js')).renderActivityBadge, 'function');
    assert.equal(typeof (await import('../src/components/decision-detail.js')).renderDecisionDetail, 'function');
    assert.equal(typeof (await import('../src/components/recommendation-item.js')).renderRecommendationItem, 'function');
    assert.equal(typeof (await import('../src/components/decision-recommendation-link.js')).renderDecisionRecommendationLink, 'function');
    assert.equal(typeof (await import('../src/components/evidence-panel.js')).renderEvidencePanel, 'function');
    assert.equal(typeof (await import('../src/components/traceability-panel.js')).renderTraceabilityPanel, 'function');
    assert.equal(typeof (await import('../src/components/no-profile-state.js')).renderNoProfileState, 'function');
  });

  test('pages/radar.js', async () => {
    const mod = await import('../src/pages/radar.js');
    assert.equal(typeof mod.renderRadarPage, 'function');
  });

  test('pages/informes.js', async () => {
    const mod = await import('../src/pages/informes.js');
    assert.equal(typeof mod.renderInformesPage, 'function');
  });

  test('services/api.js expone getReport/getReportTraceability (únicos 2 endpoints nuevos consumidos en esta etapa - ambos ya existentes en backend)', async () => {
    const api = await import('../src/services/api.js');
    assert.equal(typeof api.getReport, 'function');
    assert.equal(typeof api.getReportTraceability, 'function');
  });

  test('app.js sigue exportando la tabla de renderers sin romper (Radar/Informes ya no son placeholders)', async () => {
    await assert.doesNotReject(() => import('../src/app.js'));
  });
});
