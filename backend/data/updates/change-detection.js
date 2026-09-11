// detectChanges(): interpreta knowledge/monitoring/change-detection.json -
// no reimplementa reglas de frecuencia (eso ya vive en capture.js/monitors.json),
// solo compara dos capturas normalizadas segun el metodo declarado en el monitor.
import { randomUUID } from 'node:crypto';

// Eventos tecnicos (prompt seccion 12): nunca se derivan comparando datos,
// vienen directo del status de la captura.
export function technicalChangeClass(captureStatus) {
  if (captureStatus === 'source_unavailable') return 'fuente_no_disponible';
  if (captureStatus === 'acquisition_error') return 'error_de_adquisicion';
  return null;
}

function valueComparison(prev, curr) {
  if (!prev) return { change_class: 'valor_modificado', field: curr.indicator, previous_value: null, new_value: curr.value };
  if (prev.value === curr.value) return { change_class: 'sin_cambio' };
  return { change_class: 'valor_modificado', field: curr.indicator, previous_value: prev.value, new_value: curr.value };
}

function recordDiff(prev, curr) {
  const prevRecords = new Map((prev?.records ?? []).map((r) => [r.key, r]));
  const currRecords = new Map((curr.records ?? []).map((r) => [r.key, r]));
  const newKeys = [...currRecords.keys()].filter((k) => !prevRecords.has(k));
  const removedKeys = [...prevRecords.keys()].filter((k) => !currRecords.has(k));
  const modified = [...currRecords.keys()].filter(
    (k) => prevRecords.has(k) && JSON.stringify(prevRecords.get(k)) !== JSON.stringify(currRecords.get(k))
  );
  if (newKeys.length) return { change_class: 'nuevo_registro', detail: { newKeys } };
  if (removedKeys.length) return { change_class: 'registro_eliminado', detail: { removedKeys } };
  if (modified.length) return { change_class: 'valor_modificado', detail: { modified } };
  return { change_class: 'sin_cambio' };
}

function newItemDetection(prev, curr) {
  const prevNames = new Set((prev?.datasets ?? []).map((d) => d.name));
  const currNames = (curr.datasets ?? []).map((d) => d.name);
  const newOnes = currNames.filter((n) => !prevNames.has(n));
  if (newOnes.length) return { change_class: 'nuevo_registro', detail: { newOnes } };
  return { change_class: 'sin_cambio' };
}

function hashComparison(prevHash, currHash) {
  if (!prevHash) return { change_class: 'cambio_de_contenido' };
  if (prevHash === currHash) return { change_class: 'sin_cambio' };
  return { change_class: 'cambio_de_contenido' };
}

function newDocumentDetection(prev, curr) {
  if (!prev) return { change_class: 'nuevo_registro', detail: { document_id: curr.document_id } };
  if (prev.document_id !== curr.document_id || prev.version !== curr.version) {
    return { change_class: 'nuevo_registro', detail: { document_id: curr.document_id, previous_document_id: prev.document_id } };
  }
  return { change_class: 'sin_cambio' };
}

function structuralDiff(prev, curr) {
  const prevKeys = prev ? Object.keys(prev).sort().join(',') : '';
  const currKeys = Object.keys(curr).sort().join(',');
  if (!prev) return { change_class: 'cambio_de_contenido' };
  if (prevKeys !== currKeys) return { change_class: 'estructura_modificada', detail: { prevKeys, currKeys } };
  if (JSON.stringify(prev) !== JSON.stringify(curr)) return { change_class: 'cambio_de_contenido' };
  return { change_class: 'sin_cambio' };
}

const METHODS = {
  value_comparison: valueComparison,
  record_diff: recordDiff,
  new_item_detection: newItemDetection,
  new_document_detection: newDocumentDetection,
  structural_diff: structuralDiff,
};

export function detectChanges(db, runId, monitor, capture, previousCapture) {
  const forcedClass = technicalChangeClass(capture.status);
  let outcome;
  if (forcedClass) {
    outcome = { change_class: forcedClass };
  } else if (monitor.change_detection.method === 'hash_comparison') {
    outcome = hashComparison(previousCapture?.response_hash, capture.hash);
  } else {
    const method = METHODS[monitor.change_detection.method];
    if (!method) throw new Error(`detectChanges: metodo desconocido '${monitor.change_detection.method}'`);
    const prevData = previousCapture?.normalized_data ? JSON.parse(previousCapture.normalized_data) : null;
    outcome = method(prevData, capture.normalized ?? capture.normalized_data);
  }

  const id = randomUUID();
  const detectedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO changes (id, run_id, capture_id, previous_capture_id, monitor_id, change_class, detected_at, field, previous_value, new_value, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    runId,
    capture.id,
    previousCapture?.id ?? null,
    monitor.id,
    outcome.change_class,
    detectedAt,
    outcome.field ?? null,
    outcome.previous_value != null ? String(outcome.previous_value) : null,
    outcome.new_value != null ? String(outcome.new_value) : null,
    outcome.detail ? JSON.stringify(outcome.detail) : null
  );

  return { id, run_id: runId, capture_id: capture.id, monitor_id: monitor.id, change_class: outcome.change_class, detected_at: detectedAt, ...outcome };
}
