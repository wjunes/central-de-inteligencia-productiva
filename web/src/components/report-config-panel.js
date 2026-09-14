// report-config-panel (Paso 2E-2, arquitectura-informes-ux.md §8): configura
// SOLO con catálogos reales (GET /profile/catalogs, mercados de
// profile_markets, perfil activo del dispositivo) - nunca un campo de texto
// libre para un identificador interno (evita disparar el defecto 500-vs-400
// documentado en contrato §21). `periodic` no tiene panel: queda deshabilitado
// en el catálogo (GAP-UX-1, ver report-catalog-card.js).
import { el } from '../utils/dom.js';
import { renderMultiSelect } from './multi-select.js';
import { buildActivityOptions, humanizeSlug } from '../utils/profile-form.js';
import { validateConfig } from '../utils/reports.js';

function activitySelect({ catalogs, value, onChange, labelText, filterKey }) {
  const options = buildActivityOptions(catalogs);
  return el('div', { class: 'field' }, [
    el('label', {}, labelText),
    el(
      'select',
      { 'data-filter-key': filterKey, onChange: (e) => onChange(e.target.value || null) },
      [el('option', { value: '' }, 'Seleccionar…'), ...options.map((o) => el('option', { value: o.id, selected: value === o.id }, o.label))]
    ),
  ]);
}

function optionalActivitiesMultiSelect(catalogs, form, onFormChange) {
  return renderMultiSelect({
    label: 'Actividades a incluir (opcional - todas por defecto)',
    options: buildActivityOptions(catalogs),
    selectedIds: form.activityIds ?? [],
    onChange: (ids) => onFormChange({ activityIds: ids }),
  });
}

export function renderReportConfigPanel({ typeId, catalogs, activeProfileId, form, onFormChange, onGenerate }) {
  const fields = [];

  if (typeId === 'sectorial') {
    fields.push(activitySelect({ catalogs, value: form.activityId, onChange: (v) => onFormChange({ activityId: v }), labelText: 'Actividad', filterKey: 'sectorial:activity' }));
  } else if (typeId === 'market') {
    const marketOptions = catalogs.markets.market_dimensions.map((id) => ({ id, label: humanizeSlug(id) }));
    fields.push(
      el('div', { class: 'field' }, [
        el('label', {}, 'Mercado'),
        el(
          'select',
          { 'data-filter-key': 'market:market', onChange: (e) => onFormChange({ marketId: e.target.value || null }) },
          [el('option', { value: '' }, 'Seleccionar…'), ...marketOptions.map((o) => el('option', { value: o.id, selected: form.marketId === o.id }, o.label))]
        ),
      ])
    );
    fields.push(optionalActivitiesMultiSelect(catalogs, form, onFormChange));
  } else if (typeId === 'risk' || typeId === 'opportunity') {
    fields.push(optionalActivitiesMultiSelect(catalogs, form, onFormChange));
  } else if (typeId === 'personalized') {
    fields.push(
      el('p', { class: 'text-secondary' }, activeProfileId ? 'Se usará tu perfil activo en este dispositivo.' : 'Necesitás un perfil activo en este dispositivo para generar este informe.')
    );
  } else if (typeId === 'executive') {
    fields.push(
      el('div', { class: 'activity-switcher', role: 'group', 'aria-label': 'Alcance del informe ejecutivo' }, [
        el('button', { type: 'button', class: 'button--tab', 'data-filter-key': 'executive:general', 'aria-pressed': String(!form.useProfile), onClick: () => onFormChange({ useProfile: false }) }, 'Síntesis general'),
        el('button', { type: 'button', class: 'button--tab', 'data-filter-key': 'executive:profile', 'aria-pressed': String(Boolean(form.useProfile)), onClick: () => onFormChange({ useProfile: true }) }, 'Con mi perfil'),
      ])
    );
    if (form.useProfile && !activeProfileId) fields.push(el('p', { class: 'text-caption' }, 'Necesitás un perfil activo para esta opción.'));
  }

  // profileId nunca lo elige el usuario en un select: sale directamente del
  // perfil activo del dispositivo (state/active-profile.js), igual criterio
  // que ya usan Situación/Radar - nunca un id tipeado a mano.
  const effectiveForm = typeId === 'personalized' || typeId === 'executive' ? { ...form, profileId: activeProfileId } : form;
  const validation = validateConfig(typeId, effectiveForm);

  fields.push(
    el('button', { type: 'button', class: 'button', disabled: !validation.valid, onClick: () => onGenerate(effectiveForm) }, 'Generar informe')
  );

  return el('div', { class: 'report-config-panel stack' }, fields);
}
