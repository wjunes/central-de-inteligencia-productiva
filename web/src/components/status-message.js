// StatusMessage (prompt seccion 21/22): unico componente para
// loading/empty/error/warning/success/info. La etiqueta de texto es
// obligatoria - el color es solo un refuerzo (prompt seccion 18).
import { el } from '../utils/dom.js';

const LABELS = {
  loading: 'Cargando',
  empty: 'Sin datos',
  error: 'Error',
  warning: 'Advertencia',
  success: 'Correcto',
  info: 'Información',
};

export function renderStatusMessage({ kind = 'info', title = null, text = null }) {
  const role = kind === 'error' ? 'alert' : 'status';
  const children = [el('strong', { class: 'status-message__label' }, LABELS[kind] ?? LABELS.info)];
  if (title) children.push(el('p', { class: 'status-message__title' }, title));
  if (text) children.push(el('p', { class: 'status-message__text' }, text));
  return el('div', { class: `status-message status-message--${kind}`, role }, children);
}
