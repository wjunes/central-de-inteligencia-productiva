// no-profile-state (Paso 2F-2): extraído de pages/home.js (Paso 2C-1), que
// definía esta misma función de forma local - reusado ahora también por
// Radar e Informes para no triplicar el mismo bloque (CTA a /perfil).
import { el } from '../utils/dom.js';
import { renderStatusMessage } from './status-message.js';

export function renderNoProfileState(reason = null) {
  return el('div', { class: 'stack' }, [
    renderStatusMessage({
      kind: 'info',
      title: 'Todavía no configuraste un perfil productivo',
      text: reason ?? 'Configurá tu actividad, mercados y prioridades para ver información personalizada.',
    }),
    el('a', { class: 'button', href: '/perfil', 'data-nav-link': 'perfil' }, 'Configurar Perfil Productivo'),
  ]);
}
