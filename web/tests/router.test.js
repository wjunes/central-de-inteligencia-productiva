// Logica pura de router.js (sin DOM - node:test no tiene navegador).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ROUTES, matchRoute } from '../src/router.js';

describe('router - tabla de rutas', () => {
  test('respeta la jerarquia de navegacion documentada (5 items de primer nivel)', () => {
    assert.deepEqual(ROUTES.map((r) => r.name).sort(), ['configuracion', 'informes', 'inicio', 'perfil', 'radar']);
  });

  test('NO promueve a primer nivel elementos deliberadamente secundarios (Cambios, Inteligencia, Decisiones, Recomendaciones)', () => {
    const paths = ROUTES.map((r) => r.path);
    for (const forbidden of ['/cambios', '/inteligencia', '/decisiones', '/recomendaciones']) {
      assert.ok(!paths.includes(forbidden), `'${forbidden}' no debe ser una ruta de primer nivel (ver docs/producto/arquitectura-funcional-ux.md, seccion 2.1)`);
    }
  });

  test('cada ruta documentada resuelve a su propio nombre', () => {
    for (const route of ROUTES) {
      assert.equal(matchRoute(route.path)?.name, route.name);
    }
  });

  test('normaliza la barra final', () => {
    assert.equal(matchRoute('/radar/')?.name, 'radar');
  });

  test('ruta inexistente devuelve null (estado 404 honesto, no un error)', () => {
    assert.equal(matchRoute('/no-existe'), null);
    assert.equal(matchRoute('/intelligence/abc-123'), null); // deep-link individual, GAP abierto - no implementado aun
  });
});
