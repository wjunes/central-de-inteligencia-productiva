# web — AppShell, navegación y sistema de diseño

Primer núcleo del frontend de la **Central de Inteligencia Productiva**: `AppShell + Navegación + Sistema de diseño + Temas + Responsive + Accesibilidad`. No implementa todavía Radar, Informes, Perfil ni ninguna pantalla de inteligencia — esta es la base sobre la que esas etapas construyen (ver `docs/producto/arquitectura-funcional-ux.md`).

**Cero dependencias npm**: HTML + CSS + JavaScript moderno (módulos ES nativos, sin bundler), `node:http`/`node:fs` para servir los archivos estáticos — mismo principio de cero-dependencias que `backend/`.

## Cómo correr

```bash
cd web
cp .env.example .env       # ajustar API_BASE_URL si el backend no corre en localhost:3001
npm start                    # sirve la app en :5173
npm test                      # corre la suite (47 tests)
```

Requiere `backend/` corriendo aparte (`cd backend && npm start`) para que la comprobación de conectividad de Inicio y las futuras pantallas funcionen.

## Estructura

```
web/
├── server.js            # bootstrap (lee config.js, arranca static-server.js)
├── config.js               # lectura de env vars (mismo patrón que backend/config.js)
├── static-server.js          # servidor estático real, sin dependencias (ver abajo)
├── public/
│   └── index.html               # AppShell estático: header, nav (5 items), main, footer
├── src/
│   ├── app.js                     # bootstrap: router + tema + montaje de páginas
│   ├── router.js                    # router de cliente (History API), tabla de rutas
│   ├── services/api.js                # única capa de acceso al backend (fetch centralizado)
│   ├── state/theme.js                   # Claro/Oscuro/Sistema (lógica pura + localStorage)
│   ├── components/                        # Navigation, ThemeSelector, SectionPlaceholder, StatusMessage
│   ├── pages/                               # Inicio, Configuración, NotFound (+ placeholders inline en app.js)
│   ├── utils/                                 # env.js (lee window.__CIP_ENV__), dom.js (helper de creación de DOM)
│   └── styles/                                  # tokens.css, themes.css, reset.css, base.css, layout.css, components.css, responsive.css
└── tests/                                          # 47 tests (node:test) - router, tema, api, servidor estático, contraste
```

`web/src/modules/` (scaffold original del repo) queda sin uso todavía — se reserva para módulos por dominio (radar/, informes/, perfil/) que orquesten componentes + datos en etapas futuras (ver `docs/producto/arquitectura-funcional-ux.md`, sección 5.1). No se creó contenido ahí para no anticipar esas etapas.

## Servidor estático (`static-server.js`)

Sirve únicamente `public/` y `src/` (nunca `server.js`/`.env`/`package.json` — un intento de path traversal hacia esos archivos devuelve 404, verificado en `tests/server.test.js`). Cualquier ruta sin extensión que no coincide con un archivo real cae al `index.html` (fallback de SPA): esto permite recargar `/radar`, `/informes`, etc. directamente sin que el servidor tenga que conocer ni duplicar la tabla de rutas del cliente (`src/router.js`). Expone además `GET /env.js`, que inyecta `window.__CIP_ENV__` (`apiBaseUrl`, `nodeEnv`) leyendo `config.js` en tiempo de arranque — el código en `src/` nunca escribe `localhost` (ver "Configuración de ambiente" abajo).

## Navegación

5 rutas de primer nivel — **no** las 7 sugeridas ilustrativamente en el prompt de esta etapa. Se verificó `docs/producto/arquitectura-funcional-ux.md` (sección 2.1) antes de implementar, tal como esa misma etapa pide, y se respetó su decisión:

```
/               inicio         (real: confirma AppShell/tema/responsive/estado inicial)
/radar          radar          (placeholder)
/informes       informes       (placeholder)
/perfil         perfil         (placeholder)
/configuracion  configuracion  (real: selector de tema)
```

`Cambios` **no** es una ruta propia — es una vista dentro del Radar (`?view=changes` en el backend); se implementará como pestaña dentro de `/radar` cuando esa pantalla se construya, no antes. `Inteligencia`, `Decisiones` y `Recomendaciones` **no** son rutas propias — nunca se consultan sueltas, siempre ancladas al detalle de una situación/informe. `src/router.js` documenta esta decisión inline y `tests/router.test.js` la protege como regresión (falla si alguien agrega `/cambios` o `/inteligencia` como ruta de primer nivel).

Deep-links individuales (`/intelligence/:id`, `/decision/:id`, `/recommendation/:id`, `/situation/:id`) no se implementan — sus endpoints de backend siguen siendo GAPs abiertos (ver `docs/producto/arquitectura-funcional-ux.md`, sección 11.2).

## Temas (Claro / Oscuro / Sistema)

`src/state/theme.js` separa la lógica pura (normalización, persistencia inyectable) de los efectos de navegador, por eso es comprobable con `node:test` sin DOM. `'system'` no aplica ningún atributo — deja que `prefers-color-scheme` decida enteramente en CSS (`src/styles/themes.css`); `'light'`/`'dark'` explícitos estampan `data-theme` en `<html>`, que gana sobre la preferencia del sistema operativo. La preferencia persiste en `localStorage` (`cip:theme-preference`), nunca en el backend — es un dato de dispositivo, no de perfil productivo. El tema oscuro redefine cada token (superficies, bordes, foco, colores semánticos) — no es una inversión global de blanco/negro.

## Sistema de diseño

Tokens semánticos en `src/styles/tokens.css` (tema claro, base) y `src/styles/themes.css` (tema oscuro + reafirmación explícita del claro). Ningún componente escribe un color/tamaño/radio literal — todo vía `var(--token)`. Contraste verificado con cálculo WCAG real sobre los valores del CSS (`tests/contrast.test.js`, no una afirmación sin comprobar): texto principal ≥7:1, texto secundario ≥4.5:1, foco ≥3:1 (contraste de componente de UI) y cada color semántico (`success/warning/danger/info/risk/opportunity`) ≥4.5:1 usado como texto, en ambos temas. `--color-risk`/`--color-opportunity` son tokens propios, distintos de `--color-danger`/`--color-success` (un riesgo no es un "error de formulario").

Tipografía: fuente del sistema (`system-ui`, sin fuente web — disponibilidad offline y sin licencias), escala fija (`caption/small/body/label/nav/h1/h2/h3`). Espaciado en base 4px (`--space-xs` a `--space-2xl`). Radios discretos (`sm/md/lg`).

## Accesibilidad

Landmarks reales (`header`/`nav[aria-label]`/`main`/`footer`), enlace "Saltar al contenido principal", `<button>`/`<a>` reales (nunca `div` con click), foco siempre visible (`:focus-visible`, nunca `outline:none` sin reemplazo), foco movido a `<main>` tras cada navegación (sin agregarlo al orden de tabulación — `tabindex="-1"`), estado de navegación comunicado por `aria-current="page"` **y** refuerzo visual (nunca solo color), `StatusMessage` siempre antepone una etiqueta de texto (`Error`/`Advertencia`/...) al color del borde.

## Responsive

Mobile-first: la navegación es una barra inferior por defecto (apta para touch, controles ≥44px, no depende de hover); desde 768px pasa a barra lateral (`src/styles/responsive.css`); desde 1024px se amplía el padding de contenido. Una sola base, sin tres aplicaciones distintas.

## Capa de API (`src/services/api.js`)

Único punto que llama `fetch` — ninguna vista lo hace directamente. Centraliza JSON, 2xx/4xx/5xx (`ApiError` con `status`+`body`+mensaje del backend) y error de red (`ApiError` con `cause`). `baseUrl` y `fetchImpl` son inyectables, por eso es comprobable con un servidor HTTP local en los tests, sin red real.

## Configuración de ambiente

`web/.env.example` → `PORT`, `NODE_ENV`, `API_BASE_URL`. Nunca se hardcodea `localhost` en `src/`: `static-server.js` inyecta `API_BASE_URL` en el navegador vía `GET /env.js` (`window.__CIP_ENV__`) en tiempo de arranque, y `src/utils/env.js` es el único punto que lo lee (con un fallback de último recurso a `http://localhost:3001` solo para el caso de que `env.js` no haya cargado todavía). Migrar de ambiente (local → `apptest.uy` → producción) es cambiar `API_BASE_URL` en el `.env` del servidor estático, no tocar código (ver `docs/arquitectura/ambientes.md`).

## Datos ficticios

Ninguno. Inicio no muestra métricas/riesgos/oportunidades simuladas — el único dato que expone es un chequeo real y honesto de `GET /health` contra el backend (éxito o error, tal como responda de verdad).

## Tests

`npm test` — 47 tests: `router.test.js` (tabla de rutas y su alineación con la jerarquía de navegación documentada), `theme.test.js` (normalización/persistencia/aplicación, lógica pura), `api.test.js` (2xx/4xx/5xx/error de red contra un servidor HTTP local), `server.test.js` (AppShell servido de verdad por HTTP, deep-linking, seguridad de path traversal, tipos de contenido), `contrast.test.js` (contraste WCAG real calculado sobre los tokens tal como están escritos en el CSS).

**Limitación conocida**: no hay verificación automatizada dentro de un navegador real (renderizado visual, foco real, `prefers-color-scheme` real, comportamiento táctil) — no hay una herramienta de navegador/headless disponible en este entorno. Lo comprobado automáticamente es: estructura HTML servida por HTTP real, lógica de router/tema/api como funciones puras, y contraste real calculado sobre los valores de los tokens. La verificación visual en navegador (prompt sección 32) queda pendiente de una validación manual del usuario.
