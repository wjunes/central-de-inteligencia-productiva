// validate(): verificacion minima antes de detectar cambios. Un dato invalido
// nunca debe convertirse silenciosamente en un cambio o una señal.
export function validate(normalized, { kind } = {}) {
  const errors = [];
  if (normalized == null) {
    errors.push('normalized_data vacio');
    return { valid: false, errors };
  }
  if (kind === 'indicator') {
    if (typeof normalized.value !== 'number' || Number.isNaN(normalized.value)) {
      errors.push('indicator.value ausente o no numerico');
    }
    if (!normalized.indicator) errors.push('indicator.indicator ausente');
  }
  if (kind === 'document') {
    if (!normalized.document_id) errors.push('document.document_id ausente');
  }
  if (kind === 'dataset_list') {
    if (!Array.isArray(normalized.datasets)) errors.push('dataset_list.datasets no es un array');
  }
  return { valid: errors.length === 0, errors };
}
