// Modo IA (prompt seccion 4.2): la IA es un REDACTOR, no el motor de
// inteligencia. Nunca se le entrega acceso a la base de datos ni a fuentes -
// solo el prompt ya serializado por narrative/prompt.js.
import { buildPrompt } from './prompt.js';

function parseNarrativeJSON(raw) {
  if (raw && typeof raw === 'object') return raw; // permite que un proveedor de prueba devuelva el objeto directamente
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`narrative/ai: el proveedor devolvió contenido no-JSON o inválido: ${err.message}`);
  }
}

// generateAINarrative(report, provider): UNA sola llamada al proveedor
// (prompt seccion 29: "la generación IA debe realizar únicamente la llamada
// al proveedor seleccionado"). El resultado NUNCA se acepta como verdad sin
// pasar por narrative/validator.js (prompt seccion 6-8).
export async function generateAINarrative(report, provider) {
  const { system, user } = buildPrompt(report);
  const raw = await provider.generate(`${system}\n\n${user}`, { maxTokens: 1200 });
  const parsed = parseNarrativeJSON(raw);

  const sections = (parsed.sections ?? []).map((s) => ({ title: s.title, paragraphs: s.paragraphs ?? [] }));
  const executiveSummary = parsed.executive_summary ?? { paragraphs: [] };
  const allParagraphs = [...(executiveSummary.paragraphs ?? []), ...sections.flatMap((s) => s.paragraphs)];
  const claimsUsed = [...new Set(allParagraphs.flatMap((p) => p.claim_ids ?? []))];

  return {
    title: parsed.title ?? report.title,
    executive_summary: executiveSummary,
    sections,
    paragraphs: allParagraphs,
    claims_used: claimsUsed,
    warnings: parsed.warnings ?? [],
  };
}
