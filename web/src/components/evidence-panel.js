// evidence-panel (Paso 2F-2, Fase 9): niveles 1-2 de evidencia - siempre
// datos YA presentes en el payload cargado (0 llamadas). Nivel 3
// (trazabilidad completa hasta la fuente) es responsabilidad de
// traceability-panel.js, exclusivo de Informes (Radar no tiene endpoint de
// trazabilidad propio - docs/producto/arquitectura-decisiones-
// recomendaciones-ux.md §15). `limitNote`, cuando se pasa, deja explícito el
// límite real de la cadena en vez de insinuar más profundidad de la que el
// contrato permite.
import { el } from '../utils/dom.js';
import { EVIDENCE_LABEL, CONFIDENCE_LABEL } from '../utils/labels.js';

const CONFIDENCE_DIMENSION_LABEL = {
  source_quality: 'Calidad de la fuente',
  change_detection_confidence: 'Confianza en la detección del cambio',
  relevance_confidence: 'Confianza en la relevancia',
  analysis_confidence: 'Confianza del análisis',
};

export function renderEvidencePanel({ evidenceLevel = null, confidence = null, signal = null, limitNote = null }) {
  const children = [];

  if (evidenceLevel) children.push(el('p', {}, EVIDENCE_LABEL[evidenceLevel] ?? evidenceLevel));

  if (confidence && typeof confidence === 'object') {
    const items = Object.entries(confidence)
      .filter(([, v]) => v)
      .map(([dim, level]) => el('li', {}, `${CONFIDENCE_DIMENSION_LABEL[dim] ?? dim}: ${CONFIDENCE_LABEL[level] ?? level}`));
    if (items.length) children.push(el('ul', { class: 'evidence-panel__confidence' }, items));
  }

  if (signal) {
    const parts = [];
    if (signal.source_id) parts.push(`fuente: ${signal.source_id}`);
    if (signal.monitor_id) parts.push(`monitor: ${signal.monitor_id}`);
    if (signal.detected_at) parts.push(`detectado: ${signal.detected_at}`);
    if (parts.length) children.push(el('p', { class: 'text-caption' }, parts.join(' · ')));
  }

  if (limitNote) children.push(el('p', { class: 'text-caption evidence-panel__limit' }, limitNote));

  return el('details', { class: 'evidence-panel' }, [el('summary', {}, 'Ver evidencia'), el('div', { class: 'evidence-panel__body' }, children)]);
}
