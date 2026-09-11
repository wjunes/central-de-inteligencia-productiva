// SectionPlaceholder (prompt seccion 10): vista minima y honesta para rutas
// todavia no implementadas. Nunca inventa datos de negocio.
import { el } from '../utils/dom.js';

export function renderSectionPlaceholder({ title, description = 'Esta sección todavía no está implementada. Se incorporará en una etapa posterior sobre esta misma base de navegación.' }) {
  return el('div', { class: 'placeholder', role: 'status' }, [
    el('h1', {}, title),
    el('p', { class: 'placeholder__text' }, description),
  ]);
}
