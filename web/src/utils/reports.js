// Lógica pura del módulo Informes (Paso 2E-2) - sin DOM, comprobable con
// node:test (mismo patrón que utils/radar.js). Ningún cálculo de
// relevancia/inteligencia/decisión/recomendación: solo cataloga los 7 tipos
// (dato estático, congelado en docs/arquitectura/contrato-informes.md §4),
// arma los params reales de POST /reports/generate, valida presencia (nunca
// reglas de negocio) y clasifica mensajes de error YA recibidos del backend
// (nunca revalida de antemano - docs/producto/arquitectura-informes-ux.md §24).

// REPORT_TYPES: catálogo estático - los 7 tipos son fijos y ya están
// congelados en el contrato, no requieren ninguna llamada para conocerse
// (arquitectura-informes-ux.md §6). `periodic` queda con `disabled:true`
// (GAP-UX-1, §8/§33 del mismo documento): no existe hoy un catálogo
// navegable de `monitorId`/`field`, así que su generación se deshabilita en
// V1 en vez de ofrecer un campo de texto libre para un id técnico interno.
export const REPORT_TYPES = [
  {
    id: 'sectorial', name: 'Informe sectorial',
    purpose: 'Analiza en profundidad una actividad productiva específica.',
    needs: 'Elegir una actividad.',
    personalized: false, temporal: false,
  },
  {
    id: 'market', name: 'Informe de mercado',
    purpose: 'Analiza un mercado destino y su relación con tus actividades.',
    needs: 'Elegir un mercado (y, opcionalmente, qué actividades incluir).',
    personalized: false, temporal: false,
  },
  {
    id: 'risk', name: 'Informe de riesgos',
    purpose: 'Concentra únicamente los riesgos identificados con evidencia real.',
    needs: 'Opcionalmente, elegir qué actividades incluir.',
    personalized: false, temporal: false,
  },
  {
    id: 'opportunity', name: 'Informe de oportunidades',
    purpose: 'Concentra únicamente las oportunidades identificadas con evidencia real.',
    needs: 'Opcionalmente, elegir qué actividades incluir.',
    personalized: false, temporal: false,
  },
  {
    id: 'personalized', name: 'Informe personalizado',
    purpose: '"¿Qué cambió para mí?" usando tu perfil productivo completo.',
    needs: 'Tu perfil activo en este dispositivo (sin configuración adicional).',
    personalized: true, temporal: false,
  },
  {
    id: 'executive', name: 'Informe ejecutivo',
    purpose: 'Síntesis compacta y de alta relevancia, con tu perfil o a nivel general.',
    needs: 'Elegir si usar tu perfil activo o una síntesis general del sistema.',
    personalized: 'optional', temporal: false,
  },
  {
    id: 'periodic', name: 'Informe periódico',
    purpose: 'Compara un mismo indicador entre dos períodos.',
    needs: 'Un indicador específico - no disponible todavía desde esta interfaz.',
    personalized: false, temporal: true,
    disabled: true,
    disabledReason: 'Este tipo de informe requiere un identificador de indicador (monitor + campo) que hoy no tiene un catálogo navegable desde la interfaz. Está disponible en la arquitectura del sistema, pero su generación queda deshabilitada hasta que exista ese catálogo (ver GAP-UX-1).',
  },
];

export function reportTypeById(id) {
  return REPORT_TYPES.find((t) => t.id === id) ?? null;
}

// buildGenerateParams(): arma EXACTAMENTE el shape real que espera
// POST /reports/generate para cada tipo (contrato §6) - nunca envía un
// parámetro que el tipo no use, nunca inventa uno nuevo.
export function buildGenerateParams(typeId, form = {}) {
  if (typeId === 'sectorial') return { type: 'sectorial', activityId: form.activityId };
  if (typeId === 'market') return { type: 'market', marketId: form.marketId, ...(form.activityIds?.length ? { activityIds: form.activityIds } : {}) };
  if (typeId === 'risk') return { type: 'risk', ...(form.activityIds?.length ? { activityIds: form.activityIds } : {}) };
  if (typeId === 'opportunity') return { type: 'opportunity', ...(form.activityIds?.length ? { activityIds: form.activityIds } : {}) };
  if (typeId === 'personalized') return { type: 'personalized', profileId: form.profileId };
  if (typeId === 'executive') return form.useProfile ? { type: 'executive', profileId: form.profileId } : { type: 'executive' };
  throw new Error(`buildGenerateParams: '${typeId}' no tiene generación soportada en esta interfaz (ver REPORT_TYPES.disabled)`);
}

// validateConfig(): solo verifica PRESENCIA de lo que el usuario debe elegir
// (nunca una regla de negocio - esa la aplica el backend). Sirve para
// habilitar/deshabilitar el botón "Generar", nunca para decidir si el
// backend aceptará la solicitud.
export function validateConfig(typeId, form = {}) {
  const missing = [];
  if (typeId === 'sectorial' && !form.activityId) missing.push('activityId');
  if (typeId === 'market' && !form.marketId) missing.push('marketId');
  if (typeId === 'personalized' && !form.profileId) missing.push('profileId');
  if (typeId === 'executive' && form.useProfile && !form.profileId) missing.push('profileId');
  return { valid: missing.length === 0, missing };
}

// --- clasificación de errores de POST /reports/generate (contrato §21, GAP
// 21.1: type desconocido o parámetro obligatorio ausente responde 500 en vez
// de 400). Estrategia de PRESENTACIÓN (arquitectura-informes-ux.md §24): se
// reconoce el mensaje YA devuelto por el backend por su prefijo real y
// conocido - nunca se reimplementa la validación de antemano. ---
const KNOWN_VALIDATION_PREFIXES = [
  'reporte sectorial:',
  'reporte de mercado:',
  'reporte periódico:',
  'reporte personalizado:',
  'reporte ejecutivo:',
  'generateReport: tipo de reporte desconocido',
];

export function isKnownGenerateValidationMessage(message) {
  if (!message) return false;
  return KNOWN_VALIDATION_PREFIXES.some((prefix) => message.includes(prefix));
}

// classifyGenerateError(): dado el ApiError real de una llamada a
// /reports/generate, decide cómo presentarlo - 'validation' (config a
// corregir, aunque el status real haya sido 500), 'not_found', 'network' o
// 'server' (500 genuino, sin patrón reconocido). Nunca oculta un 500 real:
// solo reclasifica los que coinciden con un mensaje de validación conocido.
export function classifyGenerateError(err) {
  if (err.status === null) return 'network';
  if (err.status === 400) return 'validation';
  if (err.status === 500 && isKnownGenerateValidationMessage(err.message)) return 'validation';
  if (err.status === 500) return 'server';
  return 'server';
}

// --- lectura de body/claims (contrato §5/§7) ---------------------------

const SECTION_KEYS = ['changes', 'trends', 'impacts', 'risks', 'opportunities', 'decisions', 'recommendations', 'uncertainty'];

export function sectionClaims(body, key) {
  return body?.[key]?.claims ?? [];
}

export function isSectionEmpty(body, key) {
  const claims = sectionClaims(body, key);
  return claims.length === 0;
}

// SECTION_LABEL/SECTION_EMPTY_TEXT: título y mensaje honesto por sección
// estándar (contrato §5/§7 - cada sección vacía se muestra tal cual, nunca
// se omite ni se rellena con una conclusión artificial).
export const SECTION_LABEL = {
  changes: 'Cambios relevantes', trends: 'Tendencias', impacts: 'Impactos', risks: 'Riesgos',
  opportunities: 'Oportunidades', decisions: 'Decisiones consideradas', recommendations: 'Recomendaciones',
  uncertainty: 'Incertidumbre',
};

export const SECTION_EMPTY_TEXT = {
  changes: 'Sin cambios relevantes en este alcance.', trends: 'Sin tendencias confirmadas (se requieren al menos 3 observaciones consecutivas sin reversión).',
  impacts: 'Sin impactos registrados.', risks: 'Sin riesgos detectados con la evidencia actual.',
  opportunities: 'Sin oportunidades detectadas con la evidencia actual.', decisions: 'Sin decisiones consideradas.',
  recommendations: 'Sin recomendaciones activas.', uncertainty: 'Sin incertidumbre registrada para este alcance.',
};

export { SECTION_KEYS };
