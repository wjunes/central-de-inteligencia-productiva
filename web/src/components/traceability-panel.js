// traceability-panel (Paso 2E-2): trazabilidad completa de un informe
// (GET /reports/:id/traceability, contrato §15) - llega hasta capture/source
// real, más profundo que evidence-panel de Radar (que se detiene en la
// señal). Componente "tonto": no llama a la API (esa disciplina vive en
// pages/informes.js, arquitectura-informes-ux.md §27 - 1 sola llamada lazy
// por informe abierto, cacheada) - solo presenta el estado que la página le
// pasa.
import { el } from '../utils/dom.js';
import { renderStatusMessage } from './status-message.js';

function row(entry) {
  const parts = [];
  if (entry.source_id) parts.push(`Fuente: ${entry.institution ?? entry.source_id}`);
  if (entry.signal_id) parts.push(`Señal: ${entry.signal_id}`);
  if (entry.intelligence_id) parts.push(`Inteligencia: ${entry.intelligence_id}`);
  if (entry.decision_id) parts.push(`Decisión: ${entry.decision_id}`);
  if (entry.recommendation_id) parts.push(`Recomendación: ${entry.recommendation_id}`);
  if (!parts.length) parts.push('Sin trazabilidad adicional disponible para este claim.');
  return el('li', { class: 'traceability-panel__row' }, [el('p', { class: 'text-caption' }, `${entry.section}/${entry.type}`), el('p', {}, parts.join(' · '))]);
}

export function renderTraceabilityPanel({ status, entries = [], error = null, onLoad }) {
  if (status === 'idle') {
    return el('button', { type: 'button', class: 'button button--secondary', onClick: onLoad }, 'Ver trazabilidad completa');
  }
  if (status === 'loading') {
    return renderStatusMessage({ kind: 'loading', title: 'Cargando trazabilidad…' });
  }
  if (status === 'error') {
    return renderStatusMessage({ kind: 'error', title: 'No se pudo cargar la trazabilidad', text: error ?? undefined });
  }
  if (!entries.length) return renderStatusMessage({ kind: 'empty', title: 'Sin trazabilidad disponible para este informe' });
  return el('ul', { class: 'traceability-panel' }, entries.map(row));
}
