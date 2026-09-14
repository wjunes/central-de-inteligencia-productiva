// report-header (Paso 2E-2, arquitectura-informes-ux.md §29): título, tipo,
// fecha, alcance en lenguaje llano y estado (generated/superseded) de un
// informe ya generado. Un informe es un DOCUMENTO cerrado (contrato §3/§29 -
// "reproducibilidad": GET /reports/:id nunca recalcula), a diferencia del
// radar-header de Radar, que resume un estado vigente - por eso es un
// componente propio, no una reutilización.
import { el } from '../utils/dom.js';
import { reportTypeById } from '../utils/reports.js';

export function renderReportHeader(report) {
  const typeInfo = reportTypeById(report.type);
  const date = new Date(report.created_at).toLocaleString('es-UY');
  const statusLabel = report.status === 'superseded' ? 'Versión anterior (superada)' : 'Vigente';

  return el('div', { class: 'report-header stack' }, [
    el('h1', {}, report.title),
    el('p', { class: 'text-secondary' }, `${typeInfo?.name ?? report.type} · generado el ${date} · versión ${report.version}`),
    el('span', { class: `badge${report.status === 'superseded' ? '' : ' badge--status'}` }, statusLabel),
  ]);
}
