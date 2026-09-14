// report-comparison (Paso 2E-2): renderer específico de `periodic`
// (arquitectura-informes-ux.md §11/§15 - "estructuralmente distinto": todas
// las secciones estándar del body quedan vacías por diseño del backend,
// backend/reports/build.js#generatePeriodicReport, el contenido real vive
// únicamente en `body.comparisons`). Nunca se muestran las secciones
// estándar vacías junto a esto - pages/informes.js elige esta plantilla en
// vez de la estándar cuando `report.type === 'periodic'`.
import { el } from '../utils/dom.js';
import { renderStatusMessage } from './status-message.js';
import { renderReportClaimList } from './report-claim-list.js';

export function renderReportComparison(body) {
  const comparisons = body.comparisons;
  if (comparisons?.insufficient_evidence) {
    return renderStatusMessage({
      kind: 'empty',
      title: 'Sin observación en uno o ambos períodos comparados',
      text: comparisons.reason ?? 'No hay evidencia suficiente para esta comparación.',
    });
  }
  return renderReportClaimList(comparisons?.claims ?? [], 'Sin comparación disponible.');
}
