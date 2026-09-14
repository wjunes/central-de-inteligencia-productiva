// Preserva <details data-key> abiertos y el foco de un control
// [data-filter-key] a través de un re-render que reconstruye TODO el árbol
// (patrón sin virtual-DOM de esta app - cada cambio de estado hace
// container.replaceChildren(renderTodoDeNuevo())). Sin esto, cualquier
// interacción (cambiar un filtro, un select de configuración, etc.)
// colapsaría lo ya expandido y perdería el foco del control recién usado -
// defecto real encontrado y corregido en QA Paso 2D-3 (pages/radar.js).
// Extraído aquí en el Paso 2E-2 para que pages/informes.js lo reutilice sin
// duplicar la lógica (ahora 2 páginas comparten exactamente el mismo patrón
// de reconstrucción total del árbol).
//
// No es DOM-testable bajo node:test sin navegador (mismo límite conocido que
// utils/dom.js#el) - se verifica por lectura/uso real, igual que el resto de
// la capa de componentes.
export function capturedOpenKeys(container) {
  return new Set([...container.querySelectorAll('details[data-key]')].filter((d) => d.open).map((d) => d.dataset.key));
}

export function restoreOpenKeys(container, keys) {
  for (const d of container.querySelectorAll('details[data-key]')) {
    if (keys.has(d.dataset.key)) d.open = true;
  }
}

export function capturedFocusKey() {
  return typeof document !== 'undefined' ? document.activeElement?.dataset?.filterKey ?? null : null;
}

export function restoreFocusKey(container, key) {
  if (key) container.querySelector(`[data-filter-key="${key}"]`)?.focus();
}

// withPreservedInteraction(container, replaceFn): ejecuta `replaceFn` (que
// debe hacer el replaceChildren) capturando el estado antes y restaurándolo
// después - un solo punto de uso por página, ver pages/radar.js y
// pages/informes.js.
export function withPreservedInteraction(container, replaceFn) {
  const openKeys = capturedOpenKeys(container);
  const focusKey = capturedFocusKey();
  replaceFn();
  restoreOpenKeys(container, openKeys);
  restoreFocusKey(container, focusKey);
}
