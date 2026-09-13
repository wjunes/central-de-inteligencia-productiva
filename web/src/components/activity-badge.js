// activity-badge: presentar un activity_id como elemento visual consistente.
// Extraído como componente propio (Paso 2D-2) porque, a diferencia de
// Situación (donde una sola actividad principal aparecía dentro del título de
// intelligence-item.js), Radar lo necesita en 3+ lugares independientes con
// más de una actividad por elemento: situation-card (N badges por situación),
// change-item, recommendation-item (docs/producto/arquitectura-radar-ux.md
// §21: "se extrae como sub-componente propio solo si más de 2 lugares lo
// necesitan de forma independiente"). Sin badge de "kind" (ni color nuevo):
// reusa el `.badge` neutro ya existente, sin inventar un token de color para
// actividades (prompt seccion 15/27: no introducir colores nuevos).
import { el } from '../utils/dom.js';

export function renderActivityBadge(activityId) {
  return el('span', { class: 'badge activity-badge' }, activityId);
}
