// Los componentes y la página de Perfil Productivo son DOM-dependientes
// (usan document.createElement vía utils/dom.js) y no pueden ejecutarse ni
// renderizarse bajo node:test sin un navegador/jsdom (no se agregó esa
// dependencia - ver web/README.md, "Limitación conocida"). Esta prueba SÍ
// puede verificarse sin DOM: que cada módulo importa sin errores (detecta
// typos de import/export, rutas rotas) y exporta las funciones esperadas -
// un smoke test barato que atrapa una clase real de error antes de llegar al
// navegador.
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
