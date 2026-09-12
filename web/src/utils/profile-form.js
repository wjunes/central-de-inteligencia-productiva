// Logica pura del formulario de Perfil Productivo - sin DOM, comprobable con
// node:test directamente (mismo principio que state/theme.js y router.js en
// Step 1). pages/perfil.js es el unico consumidor de estas funciones; los
// componentes de UI solo reciben datos ya resueltos.
import { ApiError } from '../services/api.js';

// --- actividades -------------------------------------------------------

// buildActivityOptions(): aplana catalog.activities (sectores + items) en
// opciones {id,label} legibles para un selector de actividades secundarias,
// preservando la jerarquia SECTOR -> ACTIVIDAD -> SUBACTIVIDAD en el propio
// texto (nunca la convierte en tres conceptos independientes - prompt
// seccion 5). excludeId nunca aparece en el resultado (evita elegir la
// actividad principal tambien como secundaria).
export function buildActivityOptions(catalog, excludeId = null) {
  const sectorNameById = new Map(catalog.activities.sectors.map((s) => [s.id, s.name]));
  const itemById = new Map(catalog.activities.items.map((i) => [i.id, i]));

  return catalog.activities.items
    .filter((item) => item.id !== excludeId)
    .map((item) => {
      const sectorName = sectorNameById.get(item.sector_id) ?? item.sector_id;
      if (item.level === 'subactivity') {
        const parent = itemById.get(item.parent_id);
        return { id: item.id, label: `${sectorName} · ${parent ? `${parent.name} → ` : ''}${item.name}` };
      }
      return { id: item.id, label: `${sectorName} · ${item.name}` };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

// sanitizeSecondaryActivities(): la actividad principal nunca debe
// aparecer tambien como secundaria (prompt seccion 6). El backend ya lo
// tolera en silencio (setActivities descarta el duplicado) - esto es
// prevencion en UX, la autoridad sigue siendo el backend.
export function sanitizeSecondaryActivities(mainActivityId, secondaryIds) {
  return secondaryIds.filter((id) => id !== mainActivityId);
}

// --- ramificaciones (productos/insumos) ---------------------------------

// toggleRamificationSelection(): profile_products/profile_inputs se
// reemplazan COMPLETOS en cada PUT (setProducts/setInputs - ver
// backend/core/profile/store.js), no por actividad. Esta funcion calcula la
// lista COMPLETA nueva a partir de la actual, cambiando solo la entrada de
// (activityId, ramificationId) - preserva intactas las selecciones de
// cualquier OTRA actividad (prompt seccion 7: "no asumir que todos los
// productos/inputs pertenecen a la actividad principal").
export function toggleRamificationSelection(currentList, activityId, ramificationId, checked) {
  const withoutThis = currentList.filter((item) => !(item.activity_id === activityId && item.ramification_id === ramificationId));
  return checked ? [...withoutThis, { activity_id: activityId, ramification_id: ramificationId }] : withoutThis;
}

export function selectedRamificationIds(list, activityId) {
  return list.filter((item) => item.activity_id === activityId).map((item) => item.ramification_id);
}

// --- prioridades ---------------------------------------------------------

function withRecomputedRanks(list) {
  return list.map((item, index) => ({ topic_id: item.topic_id, rank: index + 1 }));
}

export function addPriority(list, topicId) {
  if (list.some((p) => p.topic_id === topicId)) return list; // ya priorizado, no duplicar
  return withRecomputedRanks([...[...list].sort((a, b) => a.rank - b.rank), { topic_id: topicId, rank: list.length + 1 }]);
}

export function removePriority(list, topicId) {
  return withRecomputedRanks([...list].sort((a, b) => a.rank - b.rank).filter((p) => p.topic_id !== topicId));
}

// movePriority(): intercambia la prioridad en `index` con la de
// `index + direction` (direction: -1 subir, +1 bajar) y recalcula el rank de
// toda la lista - el rank es siempre 1..N por posicion, nunca un puntaje
// inventado (prompt seccion 9).
export function movePriority(list, index, direction) {
  const ordered = [...list].sort((a, b) => a.rank - b.rank);
  const target = index + direction;
  if (target < 0 || target >= ordered.length) return withRecomputedRanks(ordered);
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  return withRecomputedRanks(ordered);
}

// --- restricciones ---------------------------------------------------------

export function addConstraint(list, { category, severity, description = null }) {
  return [...list, { category, severity, description: description || null }];
}

export function removeConstraintAt(list, index) {
  return list.filter((_, i) => i !== index);
}

// --- formato / errores -----------------------------------------------------

// humanizeSlug(): formateo puramente tipografico de un id ya existente en el
// catalogo (p. ej. 'reino-unido' -> 'Reino Unido') - nunca inventa ni
// traduce datos, solo mejora la legibilidad de un id que ya es un catalogo
// real (prompt seccion 8: mercados vienen tal como estan en el catalogo).
export function humanizeSlug(slug) {
  return slug
    .split('-')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
}

// isNotFoundError(): distingue "el perfil ya no existe" (404 real) de
// cualquier otro error (red, 500, etc.) - Paso 2B-1, auditoría de
// integración: pages/perfil.js trataba CUALQUIER error al recargar el
// perfil activo como "no tengo perfil, mostrar creación", incluido un error
// de conectividad o un 500 del backend. Eso ocultaba un error real
// (sección 4 del prompt de auditoría: "el frontend no debe ocultar
// silenciosamente errores reales") tras un mensaje que sugiere falsamente
// que el perfil se perdió.
export function isNotFoundError(err) {
  return err instanceof ApiError && err.status === 404;
}

// describeApiError(): nunca expone stack traces, JSON crudo ni rutas
// internas del servidor (prompt seccion 14) - el detalle tecnico completo
// sigue disponible via console.error en quien llame a esta funcion.
export function describeApiError(err) {
  if (err instanceof ApiError) {
    if (err.status === null) return 'No se pudo conectar con el servidor. Verificá tu conexión e intentá nuevamente.';
    if (err.status === 404) return 'El recurso solicitado no existe.';
    if (err.status === 400) return err.message; // ya es lenguaje humano (ValidationError del backend)
    return 'Ocurrió un error inesperado al comunicarse con el servidor.';
  }
  return 'Ocurrió un error inesperado.';
}
