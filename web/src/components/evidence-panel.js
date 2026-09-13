// evidence-panel (Paso 2D-2, docs/producto/arquitectura-radar-ux.md §11):
// muestra EXACTAMENTE lo que el payload de GET /profiles/:id/radar contiene
// para una unidad de inteligencia - nunca más. El objeto `signal` que llega
// al frontend no incluye `change_id` ni `capture_id` (verificado en
// contrato-radar.md §16): la cadena SIGNAL→CHANGE→CAPTURE→SOURCE no es
// reconstruible desde aquí sin un endpoint nuevo (fuera de alcance de esta
// etapa - prompt seccion 20: "no implementar búsqueda adicional de fuentes/
// capturas para completar visualmente la cadena"). El panel se detiene
// honestamente en el nivel de señal y lo dice explícitamente, para no
// prometer una trazabilidad más profunda de la disponible.
import { el } from '../utils/dom.js';

function row(label, value) {
  if (value == null || value === '') return null;
  return el('p', { class: 'evidence-panel__row' }, [el('strong', {}, `${label}: `), String(value)]);
}

export function renderEvidencePanel({ signal, intelligenceId = null, decisionId = null, recommendationId = null }) {
  const rows = [
    row('Señal', signal?.id),
    row('Fuente', signal?.source_id),
    row('Monitor', signal?.monitor_id),
    row('Tema', signal?.topic_id),
    row('Detectada', signal?.detected_at),
    row('Inteligencia', intelligenceId),
    row('Decisión', decisionId),
    row('Recomendación', recommendationId),
  ].filter(Boolean);

  return el('details', { class: 'evidence-panel' }, [
    el('summary', {}, 'Ver evidencia'),
    el('div', { class: 'evidence-panel__body stack' }, [
      ...rows,
      el('p', { class: 'text-caption' }, 'Esta es toda la evidencia que expone el Radar hoy: identifica la señal, su fuente y monitor de origen, y la inteligencia/decisión/recomendación derivadas. No es posible, con el contrato actual, llegar hasta la captura o el documento fuente original desde esta pantalla (no existe un endpoint de trazabilidad para Radar, a diferencia de Informes).'),
    ]),
  ]);
}
