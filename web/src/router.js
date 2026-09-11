// Router de cliente minimo (History API, sin dependencias). La tabla de
// rutas respeta la jerarquia de navegacion ya validada en
// docs/producto/arquitectura-funcional-ux.md (seccion 2.1): solo 5 items de
// primer nivel. 'Cambios' e 'Inteligencia' NO son rutas propias - son vistas
// dentro del Radar (Cambios) o aparecen siempre ancladas al detalle de una
// situacion/informe (Inteligencia), nunca sueltas en el menu principal (esa
// etapa las implementara dentro de /radar, no aqui).
//
// Deep-links a intelligence/:id, decision/:id, recommendation/:id,
// situation/:id no se implementan todavia (prompt seccion 9) - esos
// endpoints individuales siguen siendo GAPs abiertos en el backend (ver
// docs/producto/arquitectura-funcional-ux.md, seccion 11.2).
export const ROUTES = [
  { path: '/', name: 'inicio', title: 'Inicio' },
  { path: '/radar', name: 'radar', title: 'Radar Productivo' },
  { path: '/informes', name: 'informes', title: 'Informes' },
  { path: '/perfil', name: 'perfil', title: 'Perfil Productivo' },
  { path: '/configuracion', name: 'configuracion', title: 'Configuración' },
];

// matchRoute(): logica pura, sin DOM - comprobable directamente con
// node:test (ver web/tests/router.test.js).
export function matchRoute(pathname, routes = ROUTES) {
  const normalized = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return routes.find((route) => route.path === normalized) ?? null;
}

// initRouter(): unico punto que toca window/document - intercepta clicks en
// enlaces [data-nav-link] para evitar recarga completa, mantiene el historial
// navegable (back/forward) y deep-linking real (recargar /radar funciona
// porque static-server.js sirve el mismo index.html - ver static-server.js).
export function initRouter({ routes = ROUTES, onNavigate, root = typeof document !== 'undefined' ? document : null, win = typeof window !== 'undefined' ? window : null } = {}) {
  if (!root || !win) return null;

  const handle = () => {
    const pathname = win.location.pathname;
    onNavigate(matchRoute(pathname, routes), pathname);
  };

  const onClick = (event) => {
    const link = event.target.closest?.('[data-nav-link]');
    if (!link) return;
    const url = new URL(link.href, win.location.href);
    if (url.origin !== win.location.origin) return;
    event.preventDefault();
    if (url.pathname === win.location.pathname) return;
    win.history.pushState({}, '', url.pathname);
    handle();
  };

  root.addEventListener('click', onClick);
  win.addEventListener('popstate', handle);
  handle();

  return () => {
    root.removeEventListener('click', onClick);
    win.removeEventListener('popstate', handle);
  };
}
