// MultiSelect generico y reutilizable (prompt seccion 18): seleccionar cero
// o mas opciones de un catalogo real ({id,label}[]), mostrando los
// seleccionados como una lista con boton real de quitar (nunca un div con
// click). Usado por Actividades secundarias y Mercados - la fuente de
// `options` siempre viene del catalogo del backend, nunca hardcodeada aqui.
import { el } from '../utils/dom.js';

export function renderMultiSelect({ label, options, selectedIds, onChange, emptyText = 'No hay opciones disponibles.' }) {
  const available = options.filter((o) => !selectedIds.includes(o.id));
  const wrapper = el('div', { class: 'multi-select stack' });

  if (available.length === 0 && selectedIds.length === 0) {
    wrapper.append(el('p', { class: 'text-secondary' }, emptyText));
    return wrapper;
  }

  if (available.length > 0) {
    const select = el('select', { 'aria-label': label });
    select.append(el('option', { value: '' }, 'Seleccionar…'));
    for (const opt of available) select.append(el('option', { value: opt.id }, opt.label));
    const addButton = el(
      'button',
      {
        type: 'button',
        class: 'button button--secondary',
        onClick: () => {
          if (!select.value) return;
          onChange([...selectedIds, select.value]);
        },
      },
      'Agregar'
    );
    wrapper.append(el('div', { class: 'multi-select__control' }, [select, addButton]));
  }

  if (selectedIds.length > 0) {
    const list = el('ul', { class: 'chip-list' });
    for (const id of selectedIds) {
      const opt = options.find((o) => o.id === id);
      list.append(
        el('li', { class: 'chip' }, [
          el('span', {}, opt ? opt.label : id),
          el(
            'button',
            { type: 'button', class: 'chip__remove', 'aria-label': `Quitar ${opt ? opt.label : id}`, onClick: () => onChange(selectedIds.filter((s) => s !== id)) },
            '×'
          ),
        ])
      );
    }
    wrapper.append(list);
  }

  return wrapper;
}
