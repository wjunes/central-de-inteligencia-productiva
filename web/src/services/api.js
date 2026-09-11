// Capa unica de acceso al backend (prompt seccion 26) - centraliza fetch,
// JSON, estados HTTP y manejo de errores. Ninguna vista debe llamar fetch()
// directamente. Toda dependencia externa (baseUrl, fetchImpl) es inyectable
// para poder probar 2xx/4xx/5xx/error de red sin tocar la red real (ver
// web/tests/api.test.js).
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

export async function apiGet(path, { baseUrl = apiBaseUrl(), fetchImpl = fetch } = {}) {
  let res;
  try {
    res = await fetchImpl(`${baseUrl}${path}`, { method: 'GET' });
  } catch (err) {
    throw new ApiError('No se pudo contactar al backend (error de red).', { cause: err });
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    /* respuesta sin cuerpo JSON valido - se conserva body=null */
  }

  if (!res.ok) {
    throw new ApiError(body?.message ?? body?.error ?? `El backend respondió con estado ${res.status}.`, { status: res.status, body });
  }

  return body;
}
