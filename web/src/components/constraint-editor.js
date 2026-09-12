// ConstraintEditor (prompt seccion 10): categorías y severidades EXCLUSIVAMENTE
// del catálogo real (constraints.categories/severities de GET
// /profile/catalogs) - nunca inventadas aquí. Una restricción nunca se
// convierte en recomendación: solo se registra (categoría + severidad +
// detalle opcional).
import { el } from '../utils/dom.js';

const SEVERITY_LABEL = {
  hard_constraint: 'Restrictiva (excluye la alternativa si se viola)',
  soft_constraint: 'Moderada (reduce la fuerza de la alternativa)',
  unknown_constraint: 'Desconocida (a confirmar)',
};

export function renderConstraintEditor({ categories, severities, selected, onAdd, onRemove }) {
  const wrapper = el('div', { class: 'constraint-editor stack' });

  const categorySelect = el('select', { 'aria-label': 'Categoría de restricción' });
  for (const category of categories) categorySelect.append(el('option', { value: category.id }, category.name));
  const severitySelect = el('select', { 'aria-label': 'Severidad' });
  for (const severity of severities) severitySelect.append(el('option', { value: severity }, SEVERITY_LABEL[severity] ?? severity));
  const descriptionInput = el('input', { type: 'text', 'aria-label': 'Detalle (opcional)', placeholder: 'Detalle (opcional)' });

  const addButton = el(
    'button',
    {
      type: 'button',
      class: 'button button--secondary',
      onClick: () => onAdd({ category: categorySelect.value, severity: severitySelect.value, description: descriptionInput.value || null }),
    },
    'Agregar restricción'
  );

  wrapper.append(el('div', { class: 'constraint-editor__control stack' }, [categorySelect, severitySelect, descriptionInput, addButton]));

  if (selected.length === 0) {
    wrapper.append(el('p', { class: 'text-secondary' }, 'No hay restricciones registradas.'));
    return wrapper;
  }

  const list = el('ul', { class: 'constraint-list' });
  selected.forEach((constraint, index) => {
    const category = categories.find((c) => c.id === constraint.category);
    const label = category?.name ?? constraint.category;
    list.append(
      el('li', { class: 'constraint-item' }, [
        el('strong', {}, label),
        el('span', { class: 'text-secondary' }, ` · ${SEVERITY_LABEL[constraint.severity] ?? constraint.severity}`),
        constraint.description ? el('p', { class: 'text-small' }, constraint.description) : null,
        el('button', { type: 'button', class: 'button--icon', 'aria-label': `Quitar restricción ${label}`, onClick: () => onRemove(index) }, '×'),
      ])
    );
  });
  wrapper.append(list);
  return wrapper;
}
