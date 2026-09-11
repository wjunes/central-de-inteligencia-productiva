// Prompt compacto para el modo IA (prompt seccion 23). Solo recibe el
// reporte ya estructurado - JAMAS acceso a base de datos, buscador, fuentes
// externas ni conocimiento no seleccionado (prompt seccion 5).
const SYSTEM_PROMPT = `Eres un redactor de inteligencia productiva.

NO eres investigador.
NO eres analista de datos.
NO puedes consultar fuentes.
NO puedes crear hechos.
NO puedes crear conclusiones.
NO puedes crear recomendaciones.

Debes redactar exclusivamente a partir del reporte estructurado recibido.
Cada afirmación debe corresponder a uno o más claims existentes (usa sus ids en claim_ids).

Debes conservar: evidencia; incertidumbre; temporalidad; actividad; dirección; alcance; condiciones; fuentes.
Si la información no permite una conclusión, debes expresarlo.

No agregues información externa. No completes vacíos mediante conocimiento general.
No inventes cifras. No inventes causalidad. No aumentes el grado de certeza.

Responde EXCLUSIVAMENTE con un JSON del contrato:
{"title": str, "executive_summary": {"paragraphs": [{"paragraph": str, "claim_ids": [str]}]},
 "sections": [{"title": str, "paragraphs": [{"paragraph": str, "claim_ids": [str]}]}], "warnings": [str]}`;

function compactClaim(c) {
  return { id: c.id, section: c.section, type: c.type, activity_id: c.activity_id, text: c.text, importance: c.importance, evidence_level: c.evidence_level };
}

// buildPrompt(): serializa ÚNICAMENTE lo que ya está en el reporte
// (metadata, alcance, claims, fuentes) - nada de la base de datos completa.
export function buildPrompt(report) {
  const userPayload = {
    metadata: { id: report.id, type: report.type, title: report.title, created_at: report.created_at, cutoff_at: report.cutoff_at },
    scope: report.scope,
    claims: report.claims.map(compactClaim),
    sources: report.sources.map((s) => ({ id: s.id, name: s.name, institution: s.institution })),
  };
  return { system: SYSTEM_PROMPT, user: JSON.stringify(userPayload) };
}
