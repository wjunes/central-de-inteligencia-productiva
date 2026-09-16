// traceability-panel (Paso 2F-2, Fase 9): nivel 3 de evidencia, exclusivo de
// Informes - GET /reports/:id/traceability llega hasta capture/source real
// (docs/arquitectura/contrato-informes.md §15), a diferencia de Radar que se
// detiene en la señal (sin endpoint propio). Presentación puramente
// presentacional: la carga (lazy, 1 sola vez por informe, cacheada por la
// página) la decide pages/informes.js vía el callback `onLoad`, nunca este
// componente. Se muestra como lista simple de pasos (claim -> señal ->
// cambio -> captura -> fuente), nunca como grafo interactivo (fuera de
// alcance, arquitectura-informes-ux.md §18).
import { el } from '../utils/dom.js';

function renderEntry(entry) {
  const parts = [];
  if (entry.signal_id) parts.push(`señal ${entry.signal_id}`);
  if (entry.change_id) parts.push(`cambio ${entry.change_id}`);
  if (entry.capture_id) parts.push(`captura ${entry.capture_id}`);
  if (entry.source_id) parts.push(`fuente ${entry.institution ? `${entry.institution} (${entry.source_id})` : entry.source_id}`);
  if (entry.decision_id) parts.push(`decisión ${entry.decision_id}`);
  if (entry.recommendation_id) parts.push(`recomendación ${entry.recommendation_id}`);
  const text = parts.length ? parts.join(' → ') : 'sin cadena reconstruible para este claim';
  return el('li', { class: 'traceability-panel__entry' }, `${entry.section}/${entry.type}: ${text}`);
}

export function renderTraceabilityPanel({ chain = null, loading = false, open = false, onLoad = null }) {
  const body = el('div', { class: 'traceability-panel__body' });
  if (loading) body.append(el('p', { class: 'text-caption', role: 'status' }, 'Cargando trazabilidad…'));
  else if (chain) body.append(chain.length ? el('ul', {}, chain.map(renderEntry)) : el('p', { class: 'text-caption' }, 'Sin trazabilidad disponible para este informe.'));
  else body.append(el('p', { class: 'text-caption' }, 'Se carga al abrir esta sección.'));

  const details = el('details', { class: 'traceability-panel' }, [el('summary', {}, 'Ver trazabilidad completa'), body]);
  if (open) details.setAttribute('open', '');
  if (typeof onLoad === 'function') {
    details.addEventListener('toggle', () => { if (details.open) onLoad(); }, { once: true });
  }
  return details;
}
