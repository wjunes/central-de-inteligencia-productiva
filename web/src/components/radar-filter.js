// radar-filter (Paso 2D-2): Tipo + Actividad + Relevancia, los 3 filtros de
// V1 definidos en docs/producto/arquitectura-radar-ux.md §13. Nunca calcula
// ni reordena - solo reporta la elección del usuario vía onChange(patch); la
// página (pages/radar.js) es quien aplica utils/radar.js#applyChangeFilters
// sobre los datos ya recibidos. Reusa el patrón .button--tab[aria-pressed]
// ya construido y auditado para el selector de actividad de Perfil
// (pages/perfil.js), sin introducir un widget nuevo.
import { el } from '../utils/dom.js';
import { RELEVANCE_LABEL } from '../utils/labels.js';

const TYPE_TABS = [
  { value: 'all', label: 'Todos' },
  { value: 'risk', label: 'Riesgos' },
  { value: 'opportunity', label: 'Oportunidades' },
  { value: 'monitor', label: 'Para observar' },
];

export function renderRadarFilter({ activities, relevanceLevels, current, onChange }) {
  const tabs = el('div', { class: 'activity-switcher', role: 'group', 'aria-label': 'Tipo de cambio a mostrar' });
  for (const tab of TYPE_TABS) {
    tabs.append(
      el(
        'button',
        {
          type: 'button',
          class: 'button--tab',
          'aria-pressed': String(current.type === tab.value),
          // data-filter-key: permite a pages/radar.js devolver el foco a este
          // MISMO control tras reconstruir el árbol al cambiar de filtro (QA
          // Paso 2D-3: sin esto, el foco se pierde por completo en cada
          // interacción con un filtro, porque el control original se destruye).
          'data-filter-key': `type:${tab.value}`,
          onClick: () => onChange({ type: tab.value }),
        },
        tab.label
      )
    );
  }

  const activitySelect = el(
    'select',
    {
      'aria-label': 'Filtrar por actividad',
      'data-filter-key': 'activity',
      onChange: (e) => onChange({ activityId: e.target.value || null }),
    },
    [el('option', { value: '' }, 'Todas las actividades'), ...activities.map((id) => el('option', { value: id, selected: current.activityId === id }, id))]
  );

  const relevanceSelect = el(
    'select',
    {
      'aria-label': 'Filtrar por relevancia',
      'data-filter-key': 'relevance',
      onChange: (e) => onChange({ relevanceLevel: e.target.value || null }),
    },
    [
      el('option', { value: '' }, 'Cualquier relevancia'),
      ...relevanceLevels.map((level) => el('option', { value: level, selected: current.relevanceLevel === level }, RELEVANCE_LABEL[level] ?? level)),
    ]
  );

  return el('div', { class: 'radar-filter stack' }, [tabs, el('div', { class: 'radar-filter__row' }, [activitySelect, relevanceSelect])]);
}
