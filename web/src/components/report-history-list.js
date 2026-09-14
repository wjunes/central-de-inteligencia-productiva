// report-history-list (Paso 2E-2): "Mis informes" - lista real de
// listReports() (contrato §5/§24: id, type, title, profile_id, status,
// version, created_at). Sin filtro por estado ni paginación (GAP 25.1,
// no soportado por el backend - no se inventa aquí). Orden: el que ya trae
// el backend (created_at DESC), nunca reordenado en frontend.
import { el } from '../utils/dom.js';
import { reportTypeById } from '../utils/reports.js';

function row(report, onOpen) {
  const date = new Date(report.created_at).toLocaleString('es-UY');
  const typeInfo = reportTypeById(report.type);
  const statusBadge = el('span', { class: `badge${report.status === 'superseded' ? '' : ' badge--status'}` }, report.status === 'superseded' ? 'Superada' : 'Vigente');
  return el('li', { class: 'report-history-list__row' }, [
    el('div', { class: 'intelligence-item__badges' }, [statusBadge, el('span', { class: 'badge' }, `v${report.version}`)]),
    el('button', { type: 'button', class: 'button--tab report-history-list__open', onClick: () => onOpen(report.id) }, `${report.title} — ${typeInfo?.name ?? report.type} · ${date}`),
  ]);
}

export function renderReportHistoryList(reports, onOpen) {
  if (!reports.length) return el('p', { class: 'text-secondary' }, 'Todavía no generaste ningún informe.');
  return el('ul', { class: 'intelligence-list' }, reports.map((r) => row(r, onOpen)));
}
