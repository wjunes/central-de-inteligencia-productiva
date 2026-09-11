// Lectura de configuracion desde variables de entorno (mismo patron que
// backend/config.js: nunca hardcodear valores de ambiente en el codigo).
export const config = {
  port: Number(process.env.PORT ?? 5173),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  // URL del backend REST/JSON que el cliente debe consumir. Nunca se escribe
  // 'localhost' dentro de src/ - este valor viaja al navegador via GET /env.js
  // (ver static-server.js), asi que cambiar de ambiente (local -> apptest.uy
  // -> produccion) es una variable de entorno, no un cambio de codigo.
  apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:3001',
};
