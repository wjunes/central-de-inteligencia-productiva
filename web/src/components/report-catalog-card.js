// report-catalog-card (Paso 2E-2): presenta 1 de los 7 tipos con su ficha
// descriptiva en lenguaje llano (arquitectura-informes-ux.md §6/§29) - nunca
// `activityId`/`scope`/`selectScope` visibles. Expande su configuración con
// <details> nativo (mismo criterio de progressive disclosure ya usado en
// Radar) - `periodic` no expande nada, muestra su GAP-UX-1 tal cual.
import { el } from '../utils/dom.js';

export function renderReportCatalogCard(typeInfo, configPanelNode = null) {
  const description = [el('h3', {}, typeInfo.name), el('p', { class: 'text-secondary' }, typeInfo.purpose)];

  if (typeInfo.disabled) {
    return el('li', { class: 'report-catalog-card report-catalog-card--disabled' }, [
      ...description,
      el('p', { class: 'text-caption' }, typeInfo.disabledReason),
    ]);
  }

  return el('li', { class: 'report-catalog-card' }, [
    // data-key: preserva si esta tarjeta estaba expandida a través de un
    // re-render (mismo mecanismo que Radar, ver utils/dom-interaction.js).
    el('details', { 'data-key': `catalog::${typeInfo.id}` }, [
      el('summary', {}, [...description, el('p', { class: 'text-caption' }, `Necesita: ${typeInfo.needs}`)]),
      configPanelNode,
    ]),
  ]);
}
