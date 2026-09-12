// Resumen de situación (prompt seccion 5.B): solo CONTEOS reales (longitud
// de arrays ya devueltos por el backend) - nunca un score sintético. Solo se
// invoca cuando radar.changes.no_relevant_changes es false (cero real, no
// "sin evaluar" - ver pages/home.js).
import { el } from '../utils/dom.js';

export function renderSituationSummary({ situationsCount, risksCount, opportunitiesCount, monitorCount }) {
  const items = [
    { label: 'Situaciones activas', value: situationsCount },
    { label: 'Riesgos', value: risksCount },
    { label: 'Oportunidades', value: opportunitiesCount },
    { label: 'Para observar', value: monitorCount },
  ];
  const list = el('ul', { class: 'summary-strip' });
  for (const it of items) {
    list.append(
      el('li', { class: 'summary-strip__item' }, [
        el('span', { class: 'summary-strip__value' }, String(it.value)),
        el('span', { class: 'summary-strip__label' }, it.label),
      ])
    );
  }
  return list;
}
