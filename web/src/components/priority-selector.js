// PrioritySelector (prompt seccion 9): ordena temas del catálogo real
// (topics de GET /profile/catalogs). El rank es siempre la posición en la
// lista (1..N) - nunca un score inventado. Las prioridades solo ordenan
// preferencias; no alteran relevancia central (eso lo hace exclusivamente
// backend/core/profile/personalize.js, sin intervención del frontend).
import { el } from '../utils/dom.js';

export function renderPrioritySelector({ topics, selected, onChange }) {
  const ordered = [...selected].sort((a, b) => a.rank - b.rank);
  const selectedIds = ordered.map((p) => p.topic_id);
  const available = topics.filter((t) => !selectedIds.includes(t.id));

  const wrapper = el('div', { class: 'priority-selector stack' });

  if (available.length > 0) {
    const select = el('select', { 'aria-label': 'Tema a priorizar' });
    select.append(el('option', { value: '' }, 'Seleccionar tema…'));
    for (const topic of available) select.append(el('option', { value: topic.id }, topic.name));
    const addButton = el(
      'button',
      {
        type: 'button',
        class: 'button button--secondary',
        onClick: () => {
          if (!select.value) return;
          onChange(select.value);
        },
      },
      'Agregar prioridad'
    );
    wrapper.append(el('div', { class: 'priority-selector__control' }, [select, addButton]));
  }

  if (ordered.length === 0) {
    wrapper.append(el('p', { class: 'text-secondary' }, 'No hay prioridades definidas todavía.'));
    return wrapper;
  }

  const list = el('ol', { class: 'priority-list' });
  ordered.forEach((priority, index) => {
    const topic = topics.find((t) => t.id === priority.topic_id);
    const name = topic?.name ?? priority.topic_id;
    list.append(
      el('li', { class: 'priority-item' }, [
        el('span', { class: 'priority-item__rank', 'aria-hidden': 'true' }, String(priority.rank)),
        el('span', { class: 'priority-item__label' }, name),
        el('button', { type: 'button', class: 'button--icon', disabled: index === 0 || undefined, 'aria-label': `Subir prioridad de ${name}`, onClick: () => onChange({ move: index, direction: -1 }) }, '↑'),
        el('button', { type: 'button', class: 'button--icon', disabled: index === ordered.length - 1 || undefined, 'aria-label': `Bajar prioridad de ${name}`, onClick: () => onChange({ move: index, direction: 1 }) }, '↓'),
        el('button', { type: 'button', class: 'button--icon', 'aria-label': `Quitar ${name}`, onClick: () => onChange({ remove: priority.topic_id }) }, '×'),
      ])
    );
  });
  wrapper.append(list);
  return wrapper;
}
