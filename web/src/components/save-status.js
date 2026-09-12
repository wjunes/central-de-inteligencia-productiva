// SaveStatus (prompt seccion 18/13): unico componente para
// idle/saving/saved/error de cada sección del Perfil. Se actualiza in-place
// (updateSaveStatus) para no reconstruir la sección entera solo por el
// estado de guardado. aria-live para que un lector de pantalla anuncie el
// resultado sin que el usuario deba buscarlo (prompt seccion 16).
import { el } from '../utils/dom.js';
import { renderStatusMessage } from './status-message.js';

export function renderSaveStatus() {
  return el('div', { class: 'save-status', 'aria-live': 'polite' });
}

export function updateSaveStatus(node, status, message = null) {
  if (status === 'idle') {
    node.replaceChildren();
    return;
  }
  const KIND = { saving: 'loading', saved: 'success', error: 'error' };
  const TITLE = { saving: 'Guardando…', saved: 'Guardado', error: 'No se pudo guardar' };
  node.replaceChildren(renderStatusMessage({ kind: KIND[status] ?? 'info', title: TITLE[status] ?? status, text: message }));
}
