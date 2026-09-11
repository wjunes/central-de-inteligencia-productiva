# ambientes

## Backend (`backend/`)

`PORT`, `NODE_ENV`, `DB_PATH`, `DEEPSEEK_API_KEY`/`OPENROUTER_API_KEY` (opcionales, IA desacoplada) — ver `backend/.env.example`. `backend/config.js` es el único punto que lee `process.env`; nunca se hardcodean secretos ni URLs.

## Frontend (`web/`)

`PORT` (puerto del servidor estático, no confundir con el de `backend/`), `NODE_ENV`, `API_BASE_URL` (URL del backend REST/JSON) — ver `web/.env.example`. `web/config.js` lee estas variables en el servidor; `web/static-server.js` las inyecta en el navegador vía `GET /env.js` (`window.__CIP_ENV__`), de modo que ningún archivo de `web/src/` contiene una URL hardcodeada.

Migrar de ambiente es exclusivamente cambiar variables de entorno en el `.env` de cada lado, sin tocar código:

| Ambiente | `web` `API_BASE_URL` apunta a |
|---|---|
| local (desarrollo) | `http://localhost:3001` (backend corriendo en la misma máquina) |
| test / staging (p. ej. `apptest.uy`) | URL pública del backend desplegado en ese ambiente |
| producción (futuro dominio) | URL pública del backend de producción |

No existe todavía infraestructura de despliegue (`deployment/` sigue siendo scaffold) — esta tabla describe la estrategia de configuración, no un despliegue ya realizado.

## Ejecución local conjunta

```bash
cd backend && npm run migrate && npm start   # :3001
cd web && npm start                            # :5173
```
