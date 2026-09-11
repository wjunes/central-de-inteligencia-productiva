// Narrativa determinística (prompt seccion 4.1): funciona SIN IA, sobre
// plantillas y vocabulario controlado. Debe ser suficiente por sí sola para
// pruebas, API, reportes internos y fallback (prompt seccion 25).
import { randomUUID } from 'node:crypto';

// Lenguaje proporcional a la evidencia (prompt seccion 9). 'structural_relationship'
// es el evidence_level que usa intelligence/ hoy (ver knowledge/intelligence/),
// distinto de la escala de 5 niveles de recommendations/ - se mapea al
// registro 'moderado' porque describe un vínculo estructural real, ni
// observación directa ni mera inferencia.
const EVIDENCE_PHRASE = {
  strong: 'Los datos muestran que',
  moderate: 'La evidencia disponible indica que',
  structural_relationship: 'La evidencia disponible indica que',
  limited: 'La información disponible sugiere que',
  insufficient: 'No existe evidencia suficiente para determinar si',
  conflicting: 'Las evidencias disponibles presentan resultados contradictorios sobre si',
};

function evidencePhrase(level) {
  return EVIDENCE_PHRASE[level] ?? 'Se registró que';
}

function lowerFirst(text) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

// Un párrafo por claim - conserva la actividad, la dirección y la evidencia
// explícitas (nunca funde varias actividades en una generalización, prompt
// seccion 13). El texto base ya viene de reports/claims.js (plantilla
// determinística); aquí solo se antepone el registro de evidencia.
function paragraphFor(claim) {
  const phrase = evidencePhrase(claim.evidence_level);
  const text = claim.type === 'recommendation'
    ? claim.text // las recomendaciones ya tienen su propio registro aprobado (recommendations/rules.json.language_rules) - no se reescriben.
    : `${phrase} ${lowerFirst(claim.text)}`;
  return { paragraph: text, claim_ids: [claim.id] };
}

const SECTION_TITLES = {
  current_situation: 'Situación actual',
  changes: 'Cambios relevantes',
  trends: 'Tendencias confirmadas',
  impacts: 'Impactos',
  risks: 'Riesgos',
  opportunities: 'Oportunidades',
  decisions: 'Decisiones consideradas',
  recommendations: 'Recomendaciones',
  uncertainty: 'Incertidumbres y limitaciones',
};

const SECTION_ORDER = ['changes', 'trends', 'impacts', 'risks', 'opportunities', 'decisions', 'recommendations', 'uncertainty'];

// generateDeterministicNarrative(report): 0 llamadas externas (prompt seccion 29).
export function generateDeterministicNarrative(report) {
  const sections = [];
  const claimsUsed = new Set();
  const warnings = [];

  for (const key of SECTION_ORDER) {
    const sectionData = report.body[key];
    if (!sectionData || !sectionData.claims || !sectionData.claims.length) {
      warnings.push(`${SECTION_TITLES[key]}: sin información relevante en el reporte.`);
      continue;
    }
    const paragraphs = sectionData.claims.map((claim) => {
      claimsUsed.add(claim.id);
      return paragraphFor(claim);
    });
    sections.push({ id: randomUUID(), title: SECTION_TITLES[key], paragraphs });
  }

  const execClaims = report.body.executive_summary?.claims ?? [];
  const executiveSummary = execClaims.length
    ? { paragraphs: execClaims.map((c) => { claimsUsed.add(c.id); return paragraphFor(c); }) }
    : { paragraphs: [{ paragraph: 'No se identificó información de alta relevancia para esta síntesis.', claim_ids: [] }] };

  return {
    title: report.title,
    executive_summary: executiveSummary,
    sections,
    paragraphs: sections.flatMap((s) => s.paragraphs).concat(executiveSummary.paragraphs),
    claims_used: [...claimsUsed],
    warnings,
  };
}
