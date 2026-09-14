// report-versions-panel (Paso 2E-2): cadena real de getVersions()
// (contrato §5/§24: id, version, status, created_at, encadenada por
// previous_version_id). Sin comparación campo-a-campo (el backend no la
// provee - nunca se fabrica un diff). Componente "tonto", igual criterio que
// traceability-panel: la página gestiona la carga lazy + cache.
import { el } from '../utils/dom.js';
import { renderStatusMessage } from './status-message.js';

function row(version, currentId, onOpen) {
  const date = new Date(version.created_at).toLocaleString('es-UY');
  const isCurrent = version.id === currentId;
  const statusBadge = el('span', { class: `badge${version.status === 'superseded' ? '' : ' badge--status'}` }, version.status === 'superseded' ? 'Superada' : 'Vigente');
  const label = `v${version.version} · ${date}${isCurrent ? ' (viendo esta)' : ''}`;
  return el('li', { class: 'report-history-list__row' }, [
    el('div', { class: 'intelligence-item__badges' }, [statusBadge]),
    isCurrent ? el('span', {}, label) : el('button', { type: 'button', class: 'button--tab', onClick: () => onOpen(version.id) }, label),
  ]);
}

export function renderReportVersionsPanel({ status, versions = [], error = null, currentId = null, onLoad, onOpen }) {
  if (status === 'idle') {
    return el('button', { type: 'button', class: 'button button--secondary', onClick: onLoad }, 'Ver versiones');
  }
  if (status === 'loading') return renderStatusMessage({ kind: 'loading', title: 'Cargando versiones…' });
  if (status === 'error') return renderStatusMessage({ kind: 'error', title: 'No se pudieron cargar las versiones', text: error ?? undefined });
  if (versions.length <= 1) return el('p', { class: 'text-secondary' }, 'Esta es la única versión generada con este alcance.');
  return el('ul', { class: 'intelligence-list' }, versions.map((v) => row(v, currentId, onOpen)));
}
