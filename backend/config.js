// Lectura de configuracion desde variables de entorno. Nunca hardcodear
// secretos aqui (prompt seccion 31). Los valores reales viven en backend/.env
// (gitignored) - este modulo solo LEE process.env, nunca los expone en logs.
export const config = {
  port: Number(process.env.PORT ?? 3001),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  dbPath: process.env.DB_PATH ?? './data/cip.sqlite',
  acquisitionTimeoutMs: Number(process.env.ACQUISITION_TIMEOUT_MS ?? 10000),
  // file_download (Bloque C): limite de bytes aplicado en streaming (con o sin
  // Content-Length declarado) para no permitir una descarga sin cota - ver
  // data/acquisition/adapters.js#fileDownload.
  acquisitionMaxBytes: Number(process.env.ACQUISITION_MAX_BYTES ?? 20 * 1024 * 1024),
  // Automatización real del monitoreo (Bloque A). SCHEDULER_ENABLED explícito
  // siempre gana; si se omite, se activa en todo ambiente EXCEPTO 'test' -
  // evita que los tests de integración que levantan server.js como proceso
  // hijo (situation-integration.test.js, reports-integration.test.js, etc.,
  // todos con NODE_ENV=test) disparen llamadas reales a fuentes externas.
  scheduler: {
    enabled: process.env.SCHEDULER_ENABLED != null ? process.env.SCHEDULER_ENABLED === 'true' : (process.env.NODE_ENV ?? 'development') !== 'test',
    intervalMs: Number(process.env.SCHEDULER_INTERVAL_MS ?? 15 * 60 * 1000),
  },
  ai: {
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY ?? '',
      baseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
    },
    openrouter: {
      apiKey: process.env.OPENROUTER_API_KEY ?? '',
      baseUrl: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
    },
  },
};

// Utilidad de logging segura: nunca imprime valores que parezcan secretos.
const SECRET_KEY_PATTERN = /key|token|secret|password|authorization/i;
export function safeLogFields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = SECRET_KEY_PATTERN.test(k) ? '[redacted]' : v;
  }
  return out;
}
