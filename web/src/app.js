// Bootstrap del AppShell. Une router + tema + paginas. No contiene logica de
// negocio (esa vive en backend/) - solo composicion de vistas y navegacion.
import { initRouter } from './router.js';
import { loadThemePreference, applyThemePreference } from './state/theme.js';
import { setActiveNavItem } from './components/navigation.js';
import { renderSectionPlaceholder } from './components/section-placeholder.js';
import { renderHome } from './pages/home.js';
import { renderConfiguracion } from './pages/configuracion.js';
import { renderPerfil } from './pages/perfil.js';
import { renderNotFound } from './pages/not-found.js';
import { currentEnvironment } from './utils/env.js';

const APP_NAME = 'Central de Inteligencia Productiva';

// Un placeholder por ruta todavia no implementada (prompt seccion 10) - no
// una pantalla por tipo de dato de backend (ver docs/producto/arquitectura-
// funcional-ux.md, seccion 3: Radar/Informes/Perfil son las pantallas reales
// de las siguientes etapas).
const RENDERERS = {
  inicio: renderHome,
  radar: () => renderSectionPlaceholder({ title: 'Radar Productivo' }),
  informes: () => renderSectionPlaceholder({ title: 'Informes' }),
  perfil: renderPerfil,
  configuracion: renderConfiguracion,
};

function mount(route) {
  const main = document.getElementById('main-content');
  main.replaceChildren();

  if (!route) {
    main.append(renderNotFound());
    setActiveNavItem(null);
    document.title = `Página no encontrada — ${APP_NAME}`;
  } else {
    main.append(RENDERERS[route.name]());
    setActiveNavItem(route.name);
    document.title = `${route.title} — ${APP_NAME}`;
  }

  // Mueve el foco al contenido principal tras navegar (accesibilidad para
  // lectores de pantalla), sin agregarlo al orden de tabulacion normal
  // (main tiene tabindex="-1" en index.html).
  main.focus({ preventScroll: true });
}

function initEnvironmentLabel() {
  if (typeof document === 'undefined') return; // p. ej. al importar este módulo bajo node:test, sin DOM
  const label = document.getElementById('env-label');
  if (label) label.textContent = currentEnvironment();
}

applyThemePreference(loadThemePreference());
initEnvironmentLabel();
initRouter({ onNavigate: mount });
