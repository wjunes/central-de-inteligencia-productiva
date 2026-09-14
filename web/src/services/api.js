// Capa unica de acceso al backend (prompt seccion 26/20) - centraliza fetch,
// JSON, estados HTTP y manejo de errores, y concentra el conocimiento de
// TODOS los endpoints que el frontend consume (ninguna vista llama fetch()
// directamente). baseUrl/fetchImpl son inyectables en toda funcion para
// poder probar 2xx/4xx/5xx/error de red y para las pruebas de integracion
// contra un backend real en un puerto de prueba (ver tests/api.test.js y
// tests/profile-integration.test.js).
import { apiBaseUrl } from '../utils/env.js';

export class ApiError extends Error {
  constructor(message, { status = null, body = null, cause = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.cause = cause;
  }
}

async function request(method, path, { baseUrl = apiBaseUrl(), fetchImpl = fetch, body } = {}) {
  const init = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetchImpl(`${baseUrl}${path}`, init);
  } catch (err) {
    throw new ApiError('No se pudo contactar al backend (error de red).', { cause: err });
  }

  let responseBody = null;
  try {
    responseBody = await res.json();
  } catch {
    /* respuesta sin cuerpo JSON valido - se conserva responseBody=null */
  }

  if (!res.ok) {
    throw new ApiError(responseBody?.message ?? responseBody?.error ?? `El backend respondió con estado ${res.status}.`, { status: res.status, body: responseBody });
  }

  return responseBody;
}

export function apiGet(path, opts) {
  return request('GET', path, opts);
}
export function apiPost(path, body, opts = {}) {
  return request('POST', path, { ...opts, body });
}
export function apiPut(path, body, opts = {}) {
  return request('PUT', path, { ...opts, body });
}

// --- Perfil Productivo: conocimiento de endpoints concentrado aqui (prompt
// seccion 20) - pages/perfil.js nunca arma una URL a mano. ---

export function getProfileCatalogs(opts) {
  return apiGet('/profile/catalogs', opts);
}

export function getActivityRamifications(activityId, opts) {
  return apiGet(`/profile/ramifications/${encodeURIComponent(activityId)}`, opts);
}

export function listProfiles(opts) {
  return apiGet('/profiles', opts);
}

export function getProfile(id, opts) {
  return apiGet(`/profiles/${encodeURIComponent(id)}`, opts);
}

export function createProfile(data, opts) {
  return apiPost('/profiles', data, opts);
}

export function updateProfile(id, patch, opts) {
  return apiPut(`/profiles/${encodeURIComponent(id)}`, patch, opts);
}

export function updateProfileActivities(id, data, opts) {
  return apiPut(`/profiles/${encodeURIComponent(id)}/activities`, data, opts);
}

export function updateProfileMarkets(id, marketIds, opts) {
  return apiPut(`/profiles/${encodeURIComponent(id)}/markets`, { market_ids: marketIds }, opts);
}

export function updateProfileProducts(id, products, opts) {
  return apiPut(`/profiles/${encodeURIComponent(id)}/products`, { products }, opts);
}

export function updateProfileInputs(id, inputs, opts) {
  return apiPut(`/profiles/${encodeURIComponent(id)}/inputs`, { inputs }, opts);
}

export function updateProfilePriorities(id, priorities, opts) {
  return apiPut(`/profiles/${encodeURIComponent(id)}/priorities`, { priorities }, opts);
}

export function updateProfileConstraints(id, constraints, opts) {
  return apiPut(`/profiles/${encodeURIComponent(id)}/constraints`, { constraints }, opts);
}

// getProfileRadar(): fuente principal de la pantalla Situación (Paso 2C-1,
// docs/arquitectura/contrato-situacion.md) - correspondencia directa con
// GET /profiles/:id/radar, sin parámetro `view` (se pide siempre el objeto
// agregado completo: changes+situations+risks+opportunities+monitor+recommendations
// en una sola llamada, tal como exige el contrato de costo).
export function getProfileRadar(id, opts) {
  return apiGet(`/profiles/${encodeURIComponent(id)}/radar`, opts);
}

// --- Informes (Paso 2E-2, docs/arquitectura/contrato-informes.md §24):
// los 8 endpoints reales, ninguno nuevo. ---

export function listReports({ type, profileId } = {}, opts) {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (profileId) params.set('profile_id', profileId);
  const qs = params.toString();
  return apiGet(`/reports${qs ? `?${qs}` : ''}`, opts);
}

export function generateReport(payload, opts) {
  return apiPost('/reports/generate', payload, opts);
}

export function getReport(id, opts) {
  return apiGet(`/reports/${encodeURIComponent(id)}`, opts);
}

export function getReportTraceability(id, opts) {
  return apiGet(`/reports/${encodeURIComponent(id)}/traceability`, opts);
}

export function getReportVersions(id, opts) {
  return apiGet(`/reports/${encodeURIComponent(id)}/versions`, opts);
}

export function getReportNarrative(id, opts) {
  return apiGet(`/reports/${encodeURIComponent(id)}/narrative`, opts);
}

export function generateReportNarrative(id, { mode = 'deterministic' } = {}, opts) {
  return apiPost(`/reports/${encodeURIComponent(id)}/narrative`, { mode }, opts);
}
