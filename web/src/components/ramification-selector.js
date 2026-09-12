// RamificationSelector (prompt seccion 7): checklist de productos e insumos
// REALES de una actividad, a partir de GET /profile/ramifications/:activityId.
// Tolera que la actividad tenga otras categorias (resources, risks, etc.) -
// simplemente no las muestra aqui, sin romper si faltan 'products'/'inputs'.
import { el } from '../utils/dom.js';

function renderChecklist({ legend, nodes, selectedIds, onToggle, emptyText }) {
  const fieldset = el('fieldset', { class: 'ramification-checklist' });
  fieldset.append(el('legend', {}, legend));
  if (!nodes || nodes.length === 0) {
    fieldset.append(el('p', { class: 'text-secondary' }, emptyText));
    return fieldset;
  }
  const list = el('ul', { class: 'checklist' });
  for (const node of nodes) {
    const checkbox = el('input', {
      type: 'checkbox',
      checked: selectedIds.includes(node.id) || undefined,
      onChange: (event) => onToggle(node.id, event.target.checked),
    });
    list.append(el('li', {}, [el('label', {}, [checkbox, ' ', node.name])]));
  }
  fieldset.append(list);
  return fieldset;
}

export function renderRamificationSelector({ ramifications, selectedProductIds, selectedInputIds, onToggleProduct, onToggleInput }) {
  return el('div', { class: 'ramification-selector stack' }, [
    renderChecklist({
      legend: 'Productos',
      nodes: ramifications.products,
      selectedIds: selectedProductIds,
      onToggle: onToggleProduct,
      emptyText: 'Esta actividad no tiene productos registrados en el conocimiento.',
    }),
    renderChecklist({
      legend: 'Insumos',
      nodes: ramifications.inputs,
      selectedIds: selectedInputIds,
      onToggle: onToggleInput,
      emptyText: 'Esta actividad no tiene insumos registrados en el conocimiento.',
    }),
  ]);
}
