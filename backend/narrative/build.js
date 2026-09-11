// generateNarrative(): punto de entrada único. Dos modos (prompt seccion 4):
// 'deterministic' (por defecto, 0 llamadas externas) y 'ai' (una sola
// llamada al proveedor resuelto - DeepSeek primario, OpenRouter fallback,
// misma abstracción de la etapa del Motor Operativo, sin modificarla).
import { generateDeterministicNarrative } from './deterministic.js';
import { generateAINarrative } from './ai.js';
import { validateNarrative } from './validator.js';
import { createNarrative } from './store.js';
import { getReport } from '../reports/store.js';

export async function generateNarrative(db, reportId, { mode = 'deterministic', provider = null } = {}) {
  const report = getReport(db, reportId);
  if (!report) return null;

  let body;
  let providerName = null;
  let model = null;

  if (mode === 'deterministic') {
    body = generateDeterministicNarrative(report);
  } else if (mode === 'ai') {
    if (!provider) throw new Error("generateNarrative: mode='ai' requiere una instancia de AIProvider (ver services/ai/)");
    body = await generateAINarrative(report, provider);
    providerName = provider.constructor.name.replace('Provider', '').toLowerCase();
    model = provider.model ?? null;
  } else {
    throw new Error(`generateNarrative: modo desconocido '${mode}' (usar 'deterministic' o 'ai')`);
  }

  const validation = validateNarrative(body, report);
  const status = validation.valid ? 'validated' : 'rejected';

  return createNarrative(db, {
    reportId, mode, provider: providerName, model, status,
    claimsUsed: body.claims_used, validation, body,
  });
}
