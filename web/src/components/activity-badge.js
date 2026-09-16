// activity-badge (Paso 2F-2): identificación consistente de un activity_id.
// No existe un catálogo de nombres legibles accesible en esta etapa (GET
// /profile/catalogs no es uno de los 3 endpoints habilitados para 2F-2) -
// se usa humanizeSlug(), el mismo formateo puramente tipográfico ya usado en
// Perfil Productivo (nunca traduce ni inventa un nombre, solo mejora la
// legibilidad de un id real). `primary` es solo una etiqueta informativa
// adicional, nunca un estilo que privilegie visualmente la actividad
// principal (docs/arquitectura/contrato-radar.md §21: sin privilegio
// automático) - mismo tamaño/color que cualquier otro activity-badge.
import { el } from '../utils/dom.js';
import { humanizeSlug } from '../utils/profile-form.js';

export function renderActivityBadge(activityId, { primary = false } = {}) {
  const text = humanizeSlug(activityId) + (primary ? ' (principal)' : '');
  return el('span', { class: 'badge activity-badge' }, text);
}
