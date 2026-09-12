// ActivitySelector: cascada real SECTOR -> ACTIVIDAD -> SUBACTIVIDAD (prompt
// seccion 5) sobre catalog.activities (GET /profile/catalogs). Nunca envia
// nombres como identificador - onChange siempre recibe un `id` real del
// catalogo (o null). La subactividad es opcional ("cuando corresponda"): si
// la actividad elegida no tiene subactividades, o el usuario no elige una,
// el valor final es el id de la actividad misma.
import { el } from '../utils/dom.js';

export function renderActivitySelector({ catalog, selectedId = null, onChange, excludeIds = [] }) {
  const { sectors, items } = catalog.activities;
  const itemById = new Map(items.map((i) => [i.id, i]));

  const selectedItem = selectedId ? itemById.get(selectedId) : null;
  const initialActivity = selectedItem?.level === 'subactivity' ? itemById.get(selectedItem.parent_id) : selectedItem;

  let currentSectorId = initialActivity?.sector_id ?? '';
  let currentActivityId = initialActivity?.id ?? '';

  const sectorSelect = el('select', { 'aria-label': 'Sector' });
  const activitySelect = el('select', { 'aria-label': 'Actividad' });
  const subSelect = el('select', { 'aria-label': 'Subactividad (si corresponde)' });

  function fillSectors() {
    sectorSelect.replaceChildren(el('option', { value: '' }, 'Seleccionar sector…'));
    for (const sector of [...sectors].sort((a, b) => a.order - b.order)) {
      sectorSelect.append(el('option', { value: sector.id, selected: sector.id === currentSectorId || undefined }, sector.name));
    }
  }

  function fillActivities() {
    const options = items.filter((i) => i.level === 'activity' && i.sector_id === currentSectorId && !excludeIds.includes(i.id));
    activitySelect.replaceChildren(el('option', { value: '' }, 'Seleccionar actividad…'));
    for (const activity of options) {
      activitySelect.append(el('option', { value: activity.id, selected: activity.id === currentActivityId || undefined }, activity.name));
    }
    activitySelect.disabled = !currentSectorId;
  }

  function fillSubactivities() {
    const activity = itemById.get(currentActivityId);
    const subIds = (activity?.subactivities ?? []).filter((id) => !excludeIds.includes(id));
    subSelect.replaceChildren(el('option', { value: '' }, activity ? `(usar "${activity.name}" en general)` : 'Seleccionar actividad primero…'));
    for (const subId of subIds) {
      const sub = itemById.get(subId);
      if (sub) subSelect.append(el('option', { value: sub.id, selected: sub.id === selectedId || undefined }, sub.name));
    }
    subSelect.disabled = !currentActivityId || subIds.length === 0;
  }

  sectorSelect.addEventListener('change', () => {
    currentSectorId = sectorSelect.value;
    currentActivityId = '';
    fillActivities();
    fillSubactivities();
    onChange(null);
  });
  activitySelect.addEventListener('change', () => {
    currentActivityId = activitySelect.value;
    fillSubactivities();
    onChange(currentActivityId || null);
  });
  subSelect.addEventListener('change', () => {
    onChange(subSelect.value || currentActivityId || null);
  });

  fillSectors();
  fillActivities();
  fillSubactivities();

  return el('div', { class: 'activity-selector' }, [
    el('label', { class: 'activity-selector__row' }, ['Sector', sectorSelect]),
    el('label', { class: 'activity-selector__row' }, ['Actividad', activitySelect]),
    el('label', { class: 'activity-selector__row' }, ['Subactividad (si corresponde)', subSelect]),
  ]);
}
