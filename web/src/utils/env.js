// Unico punto que lee window.__CIP_ENV__ (inyectado por static-server.js via
// GET /env.js). Nunca se hardcodea 'localhost' fuera de este fallback de
// ultimo recurso (prompt seccion 27) - cambiar de ambiente es una variable de
// entorno del servidor, no un cambio en src/.
export function apiBaseUrl() {
  try {
    if (typeof window !== 'undefined' && window.__CIP_ENV__?.apiBaseUrl) {
      return window.__CIP_ENV__.apiBaseUrl;
    }
  } catch {
    /* window.__CIP_ENV__ ausente (p. ej. env.js no cargo todavia) */
  }
  return 'http://localhost:3001';
}

export function currentEnvironment() {
  try {
    if (typeof window !== 'undefined' && window.__CIP_ENV__?.nodeEnv) {
      return window.__CIP_ENV__.nodeEnv;
    }
  } catch {
    /* noop */
  }
  return 'development';
}
