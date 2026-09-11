// GAP "Paso 2A": expone las ramificaciones EFECTIVAS de una actividad (para
// que el Perfil Productivo pueda ofrecer productos/insumos reales sin
// duplicar conocimiento). Fuente exclusiva: knowledge.effectiveRamifications()
// - la misma funcion que core/profile/store.js ya usa para VALIDAR
// profile_products/profile_inputs (requireRamification -> findRamificationNode
// -> effectiveRamifications). Nunca activities.json.products/.inputs (esos
// campos son un resumen editorial de alto nivel en activities.json, no la
// fuente de verdad que valida el perfil).
import { knowledge } from '../../knowledge/loader.js';

export class ActivityNotFoundError extends Error {}

// groupRamificationsByCategory(): normalizacion MINIMA. Agrupa los nodos de
// NIVEL SUPERIOR por su propio campo `category` (products/inputs/resources/
// .../strategic_signals - 25 valores reales, verificados sobre todo
// knowledge/ramifications/, no adivinados). No inventa categorias, no
// reclasifica: cada nodo viaja tal cual lo devuelve el loader, con su arbol
// de `children` intacto.
//
// Nota importante descubierta en la inspeccion: un nodo hijo puede declarar
// una `category` distinta de la de su nodo padre (~7% de 2330 nodos
// verificados en todo knowledge/ramifications/). Esta funcion NO reclasifica
// hijos hacia otro grupo de nivel superior - eso seria una transformacion
// mayor de la jerarquia, no la "normalizacion minima" pedida. Los hijos
// quedan anidados donde effectiveRamifications() ya los coloca; el frontend
// puede leer su `category` propia si necesita distinguirlos visualmente.
//
// Solo se incluyen las categorias que la actividad efectivamente tiene (una
// actividad sin nodos de 'sanitary_factors', por ejemplo, no recibe esa
// clave con un array vacio) - mas fiel a la fuente que rellenar un esqueleto
// fijo de 25 claves que la mayoria de las actividades no usa.
export function groupRamificationsByCategory(nodes) {
  const grouped = {};
  for (const node of nodes) {
    const key = node.category ?? 'sin_categoria';
    (grouped[key] ??= []).push(node);
  }
  return grouped;
}

export function getActivityRamifications(activityId) {
  const activity = knowledge.activityById(activityId);
  if (!activity) {
    throw new ActivityNotFoundError(`activity_id desconocido: '${activityId}' (no existe en knowledge/activities/activities.json)`);
  }

  let nodes;
  try {
    nodes = knowledge.effectiveRamifications(activityId);
  } catch {
    // Actividad valida pero sin knowledge/ramifications/<id>.json propio.
    // Cobertura verificada 1:1 hoy (115 actividades, 115 archivos) - esto no
    // ocurre actualmente, pero una actividad futura sin archivo propio no
    // debe romper la API (prompt seccion 3: "actividad existente sin
    // ramificaciones -> arrays vacios, no error").
    nodes = [];
  }

  return { activity_id: activityId, ramifications: groupRamificationsByCategory(nodes) };
}
