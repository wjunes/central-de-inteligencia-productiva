// Inicio (prompt seccion 11): en esta etapa NO es el dashboard real. Solo
// confirma que AppShell/navegacion/tema/responsive/estado inicial funcionan.
// Prohibido mostrar metricas, riesgos u oportunidades ficticias (seccion 29):
// el unico dato que se muestra es un chequeo real y honesto de conectividad
// con el backend (GET /health), no informacion productiva simulada.
import { el } from '../utils/dom.js';
import { apiGet, ApiError } from '../services/api.js';
import { renderStatusMessage } from '../components/status-message.js';

export function renderHome() {
  const container = el('div', { class: 'stack' }, [
    el('h1', {}, 'Inicio'),
    el('p', {}, 'Esta es la base del frontend (AppShell, navegación, tema y accesibilidad). El Radar Productivo, los informes y el resto de las pantallas de inteligencia se incorporan en etapas posteriores sobre esta misma estructura.'),
  ]);

  const statusSlot = el('div', {}, [renderStatusMessage({ kind: 'loading', title: 'Comprobando conexión con el backend…' })]);
  container.append(statusSlot);

  apiGet('/health')
    .then((body) => {
      statusSlot.replaceChildren(
        renderStatusMessage({ kind: 'success', title: 'Backend conectado', text: `Respuesta real de GET /health: estado "${body.status}".` })
      );
    })
    .catch((err) => {
      const message = err instanceof ApiError ? err.message : 'Error inesperado al contactar el backend.';
      statusSlot.replaceChildren(
        renderStatusMessage({ kind: 'error', title: 'Backend no disponible', text: message })
      );
    });

  return container;
}
