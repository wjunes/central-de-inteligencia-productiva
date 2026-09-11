// Validador posterior a la generación (prompt seccion 8). Nunca acepta
// contenido de IA como verdad sin pasar por aquí - detecta, con reglas
// deterministas (no NLP/IA), las categorías de alucinación de la seccion 30.
import { knowledge } from '../knowledge/loader.js';

const WEAK_EVIDENCE = new Set(['insufficient', 'limited', 'conflicting']);

// \b de JS no reconoce vocales acentuadas como caracter de "palabra", asi que
// falla en los bordes de verbos como "provocará"/"garantizará". Se usa un
// lookaround explicito sobre el alfabeto español en su lugar.
const ES_WORD = 'A-Za-zÀ-ÿ';
// flags sin 'g' para uso con .test() (evita el estado de lastIndex de los
// regex globales al reutilizar la misma constante en un bucle); con 'g'
// solo para las que se recorren con matchAll().
function wb(alternatives, flags = 'i') {
  return new RegExp(`(?<![${ES_WORD}])(${alternatives})(?![${ES_WORD}])`, flags);
}

// \w excluye vocales acentuadas, asi que un sufijo tipo \w* dejaria "á" colgando
// justo antes del lookahead (que SI trata "á" como caracter de palabra) y el
// match fallaria entero (p. ej. "provocará"). Se usa una clase de sufijo
// explicita que incluye el alfabeto español, consistente con el lookaround.
const ES_SUFFIX = `[${ES_WORD}0-9]*`;
const CAUSAL_VERBS = wb(`provoca${ES_SUFFIX}|caus[oaá]${ES_SUFFIX}|generar[áa]${ES_SUFFIX}|garantiza${ES_SUFFIX}|asegura${ES_SUFFIX}`);
const ACTION_VERBS = wb('debe (hacer|comprar|vender|invertir|contratar|abandonar|ejecutar)|haga inmediatamente|venda|compre|comprar|vender|contrate|contratar|invierta|invertir|abandone|ejecute|ejecutar');
const CERTAINTY_WORDS = wb(`confirmad[oa]${ES_SUFFIX}|sin duda|garantizad[oa]${ES_SUFFIX}|definitivamente|con (toda )?certeza|es un hecho`, 'gi');
const NEGATION_WORD = wb('no|sin|nunca|jamás');
const TREND_WORDS = wb(`tendencia${ES_SUFFIX}`);
const NO_INFO_PATTERN = /no se identificó información|sin información relevante|no existe evidencia suficiente/i;

function extractNumbers(text) {
  return [...text.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => m[0]);
}

// hasUnnegatedCertaintyClaim(): evita el falso positivo de frases como
// "no se presenta como hecho confirmado" (una negación explícita, no una
// afirmación de certeza) - solo cuenta si la palabra de certeza NO está
// precedida por una negación cercana.
function hasUnnegatedCertaintyClaim(text) {
  for (const m of text.matchAll(CERTAINTY_WORDS)) {
    const preceding = text.slice(Math.max(0, m.index - 60), m.index);
    if (!NEGATION_WORD.test(preceding)) return true;
  }
  return false;
}

// mentionsActivityId(): coincidencia de id completo, no de un prefijo que
// forme parte de un id compuesto más largo (p. ej. 'ganaderia' no debe
// coincidir dentro de 'ganaderia-bovina-carne').
function mentionsActivityId(text, activityId) {
  const escaped = activityId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![a-z0-9-])${escaped}(?![a-z0-9-])`, 'i');
  return re.test(text);
}

function allParagraphs(narrative) {
  return [...(narrative.executive_summary?.paragraphs ?? []), ...narrative.sections.flatMap((s) => s.paragraphs)];
}

export function validateNarrative(narrative, report) {
  const errors = [];
  const warnings = [];

  const claimById = new Map(report.claims.map((c) => [c.id, c]));
  const reportActivityIds = new Set(report.claims.map((c) => c.activity_id).filter(Boolean));
  const reportSourceNames = new Set(report.sources.flatMap((s) => [s.name, s.institution]).filter(Boolean));
  const otherKnownSourceNames = knowledge
    .sources()
    .filter((s) => !report.sources.some((rs) => rs.id === s.id))
    .flatMap((s) => [s.name, s.institution])
    .filter((n) => n && n.length > 8 && !reportSourceNames.has(n));
  const otherKnownActivityIds = knowledge.activities().map((a) => a.id).filter((id) => !reportActivityIds.has(id));

  for (const p of allParagraphs(narrative)) {
    const text = p.paragraph ?? '';
    const ids = p.claim_ids ?? [];

    // 1) claim_ids desconocidos
    for (const id of ids) {
      if (!claimById.has(id)) errors.push({ code: 'UNKNOWN_CLAIM_ID', message: `claim_id inexistente en el reporte: ${id}`, paragraph: text });
    }

    // 2) afirmación sin respaldo (salvo declaración explícita de ausencia de información)
    if (ids.length === 0 && !NO_INFO_PATTERN.test(text)) {
      errors.push({ code: 'UNSUPPORTED_CLAIM', message: 'párrafo sin claim_ids que lo respalde', paragraph: text });
      continue; // el resto de checks depende de resolver claims válidos
    }

    const referencedClaims = ids.map((id) => claimById.get(id)).filter(Boolean);

    // 3) fuente no referenciada en el reporte - dos vías: (a) un nombre real
    // de knowledge/sources/ que existe pero no forma parte de ESTE reporte,
    // (b) un patrón de cita ("según X", "fuente: X") hacia un nombre que ni
    // siquiera está en report.sources - captura fuentes inventadas de cero
    // (p. ej. "según Reuters"), no solo fuentes reales fuera de alcance.
    for (const name of otherKnownSourceNames) {
      if (text.includes(name)) errors.push({ code: 'UNSUPPORTED_SOURCE', message: `menciona una fuente que no forma parte del reporte: '${name}'`, paragraph: text });
    }
    for (const m of text.matchAll(/\b(?:según|fuente:|de acuerdo con)\s+([A-ZÁÉÍÓÚÑ][\wÀ-ÿ]*(?:\s+[A-ZÁÉÍÓÚÑ][\wÀ-ÿ]*)*)/g)) {
      const cited = m[1];
      const isKnownReportSource = report.sources.some((s) => (s.name && s.name.includes(cited)) || (s.institution && s.institution.includes(cited)));
      if (!isKnownReportSource) errors.push({ code: 'UNSUPPORTED_SOURCE', message: `cita una fuente no identificable en el reporte: '${cited}'`, paragraph: text });
    }

    // 4) tendencia no respaldada por un claim type=trend
    if (TREND_WORDS.test(text) && !referencedClaims.some((c) => c.type === 'trend')) {
      errors.push({ code: 'UNSUPPORTED_TREND', message: 'menciona "tendencia" sin un claim type=trend que lo respalde', paragraph: text });
    }

    // 5) causalidad no permitida
    if (CAUSAL_VERBS.test(text)) {
      errors.push({ code: 'FORBIDDEN_CAUSAL_LANGUAGE', message: 'usa lenguaje causal no respaldado por evidencia causal', paragraph: text });
    }

    // 6) recomendación convertida en acción/orden
    if (ACTION_VERBS.test(text)) {
      errors.push({ code: 'RECOMMENDATION_AS_ACTION', message: 'usa lenguaje de acción/orden prohibido', paragraph: text });
    }

    // 7) certeza sobre evidencia débil
    if (hasUnnegatedCertaintyClaim(text) && referencedClaims.some((c) => WEAK_EVIDENCE.has(c.evidence_level))) {
      errors.push({ code: 'CERTAINTY_ESCALATION', message: 'afirma certeza sobre un claim de evidencia débil', paragraph: text });
    }

    // 8) cifra inexistente en los claims referenciados
    const claimsText = referencedClaims.map((c) => c.text).join(' ');
    for (const num of extractNumbers(text)) {
      if (!claimsText.includes(num)) errors.push({ code: 'FABRICATED_NUMBER', message: `cifra '${num}' no aparece en los claims referenciados`, paragraph: text });
    }

    // 9) actividad fuera del alcance del reporte (coincidencia de id completo,
    // no de un prefijo compartido con un id compuesto en alcance). Exento si
    // la mención YA estaba en el texto del claim referenciado (p. ej. una
    // razón estructural de relevance/ que nombra la actividad padre) - eso
    // no es una fabricación de la narrativa, es contenido ya citado (mismo
    // criterio que FABRICATED_NUMBER).
    for (const aid of otherKnownActivityIds) {
      if (mentionsActivityId(text, aid) && !mentionsActivityId(claimsText, aid)) {
        errors.push({ code: 'UNSUPPORTED_ACTIVITY', message: `menciona una actividad fuera del alcance del reporte: '${aid}'`, paragraph: text });
      }
    }
  }

  // 10) advertencias críticas que no deben desaparecer
  const criticalUncertainty = report.claims.filter((c) => c.type === 'uncertainty' && WEAK_EVIDENCE.has(c.evidence_level));
  const usedIds = new Set(narrative.claims_used ?? []);
  for (const c of criticalUncertainty) {
    if (!usedIds.has(c.id)) warnings.push({ code: 'MISSING_CRITICAL_WARNING', message: `incertidumbre crítica no reflejada en la narrativa: ${c.id}` });
  }

  return { valid: errors.length === 0, errors, warnings };
}
