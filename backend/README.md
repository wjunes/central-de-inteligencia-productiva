# backend — motor operativo

Ejecuta el pipeline `SOURCE → RESOURCE → CAPTURE → NORMALIZATION → CHANGE DETECTION → SIGNAL → RELEVANCE → INTELLIGENCE → DECISION → RECOMMENDATION`, **consumiendo** `knowledge/` como conocimiento (nunca lo reconstruye ni lo duplica), y personaliza ese resultado central por perfil productivo (`core/profile/`) sin duplicar señales, capturas ni inteligencia por usuario.

**Cero dependencias npm**: usa `node:sqlite`, `node:http`, `node:test`, `node:crypto` — todas nativas de Node.js 24 LTS.

## Requisitos

Node.js ≥ 22.5 (usa `node:sqlite`, disponible sin flag desde Node 22.5; probado con Node 24.21).

## Cómo correr

```bash
cd backend
cp .env.example .env        # completar DEEPSEEK_API_KEY solo si se va a usar services/ai/ manualmente
npm run migrate               # aplica db/schema.sql (idempotente)
npm test                       # corre la suite completa (fixtures + 1 fuente real)
npm start                       # levanta el servidor HTTP en :3001
```

## Estructura y responsabilidades

```
backend/
├── server.js            # bootstrap HTTP
├── config.js              # lectura de env vars (nunca secretos hardcodeados)
├── config/thresholds.json  # umbrales OPERATIVOS (ver nota abajo)
├── db/                       # conexión SQLite + esquema + migración
├── knowledge/                 # única puerta de entrada a knowledge/ (loader.js)
├── data/                        # acquisition, normalization, validation, updates (change-detection)
├── core/relevance/                # interpreta relevance/mappings.json
├── intelligence/                   # signals/, analysis/ (intelligence), recommendations/
├── decision/                        # evalúa alternativas (decision/rules.json)
├── pipeline/                         # orquestador central (runPipeline)
├── api/                                # router HTTP mínimo
├── services/ai/                        # AIProvider desacoplado (DeepSeek/OpenRouter) - NO usado por el pipeline
├── services/search/                     # búsqueda web, deshabilitada por defecto
├── fixtures/                             # datos de prueba controlados (modo test)
└── test/                                  # suite end-to-end (fixtures) + 1 prueba de fuente real
```

### Mapeo con el scaffold original de `backend/`

El repo ya traía una estructura vacía (`backend/api/{alerts,auth,dashboard,intelligence,profile,reports,sources,users}`, `backend/core/{activities,alerts,indicators,profile,ramifications,relevance,users}`, `backend/intelligence/{analysis,correlations,opportunities,recommendations,risks,signals,trends}`, `backend/data/{acquisition,historical,normalization,sources,updates,validation}`, `backend/services/{ai,external,notifications,search}`). Esta etapa **reusó** esa estructura donde correspondía (`core/relevance/`, `intelligence/{signals,analysis,recommendations}/`, `data/{acquisition,normalization,validation,updates}/`, `services/{ai,search}/`) y solo agregó carpetas nuevas cuando ninguna de las existentes encajaba:

- **`decision/`** (nueva, top-level): `knowledge/decision/` es su propia capa de conocimiento, distinta de `intelligence/`; forzarla dentro de `backend/intelligence/` habría difuminado esa separación que el propio `knowledge/` fue cuidadoso en mantener.
- **`db/`** y **`knowledge/`** (nuevas, top-level): infraestructura transversal (conexión SQLite, acceso a `knowledge/`) que no pertenece a ninguna de las 6 responsabilidades de negocio (`api/core/intelligence/data/reports/services`).
- **`pipeline/`** (nueva, top-level): el prompt pide explícitamente "crear un orquestador central" (sección 5) — no es una de las 6 carpetas de referencia, pero está pedida por nombre.
- **`api/router.js`** (archivo suelto, no en un subdirectorio): ningún subdirectorio existente (`alerts/auth/dashboard/intelligence/profile/reports/sources/users`) encaja con endpoints transversales como `/health` o `/pipeline/*`.

**Carpetas del scaffold NO utilizadas en esta etapa** (deliberado, no un olvido — no hay funcionalidad de usuarios, alertas, reportes, auth, dashboard, ni conectores de fuentes más allá de `sources.json` en esta fase): `api/{alerts,auth,dashboard,intelligence,profile,reports,sources,users}`, `core/{activities,alerts,indicators,profile,ramifications,users}`, `intelligence/{correlations,opportunities,risks,trends}`, `data/{historical,sources}`, `services/{external,notifications}`, `reports/*`. La lógica de "actividad principal/secundarias" (`core/profile/`) y el cálculo de fechas de vencimiento por frecuencia (`data/updates/scheduling.js`) están hoy **inline** en `core/relevance/relevance-engine.js` y `data/acquisition/capture.js` respectivamente — si crecen, esas son las carpetas naturales para extraerlos.

## Perfil productivo y personalización (`core/profile/`)

`core/profile/store.js` (CRUD sobre 7 tablas — `profiles`, `profile_activities`, `profile_markets`, `profile_products`, `profile_inputs`, `profile_priorities`, `profile_constraints` — todas por referencia a ids de `knowledge/`, nunca copias) y `core/profile/personalize.js` (`RELEVANCIA CENTRAL + CONTEXTO DEL PERFIL = RELEVANCIA PERSONALIZADA`, y `getChanges()` para "¿qué cambió para mí?"). Endpoints en `api/router.js`: `GET/POST /profiles`, `GET/PUT/DELETE /profiles/:id`, `GET/PUT /profiles/:id/activities`, `PUT /profiles/:id/{markets,products,inputs,priorities,constraints}`, `GET /profiles/:id/{relevance,changes,intelligence,recommendations}`.

**Escalado de relevancia**: solo 2 reglas estructurales, nunca por preferencia — `declared_interest_match` (el producto/insumo declarado por el perfil coincide exactamente con la ramificación de origen de la señal) y `market_match` (un mercado declarado coincide con `sources.json[source_id].markets`) — cada una sube un nivel, nunca fabrica evidencia. Las prioridades del usuario (`profile_priorities`) **nunca** alteran el nivel: solo ordenan la salida de `/changes` (`priority_match`, ver `personalize.js`).

**Problema detectado y corregido (quirúrgico, dentro de `backend/`, `knowledge/` no se tocó)**: la primera versión de `core/relevance/relevance-engine.js` (etapa del Motor Operativo) recibía un `profileContext` y calculaba `is_primary_activity` **al generar la relevancia central** — esto violaba el principio de esta etapa (el pipeline central no puede conocer ningún perfil; si dos perfiles disparaban el pipeline, `is_primary_activity` quedaba fijado por el primero). Se quitó `profileContext` de `calculateRelevance()`/`runPipeline()` (siempre inserta `is_primary_activity=0`) y se recalcula ahora en `core/profile/personalize.js`, en el momento de la consulta, contra el perfil que efectivamente pregunta. Se actualizaron las pruebas de `test/pipeline.test.js` que dependían del comportamiento anterior.

## Radar Productivo (`radar/`)

Transforma `getChanges()` (personalización) en una vista temporal/agregada/priorizada: `radar/situations.js` (agrupa >=2 intelligence units por `topic_id` + actividades ya conectadas por `relevance/`, persiste identidad en `radar_situations` porque su **estado** — `emerging/active/persistent/resolved` — depende de observarla a través de varias corridas, no de una consulta), `radar/trend.js` (aplica textualmente la regla `tendencia-por-persistencia` de `knowledge/signals/rules.json` sobre `signals` ya existentes — nunca fabrica una tendencia con <3 observaciones), `radar/prioritize.js` (orden explícito de 6 criterios documentados, sin score numérico) y `radar/build.js` (orquestación). Endpoint: `GET /profiles/:id/radar?view={changes|situations|risks|opportunities|monitor|recommendations}` (se prefirió el parámetro `?view=` sobre sub-rutas — más coherente con el router manual existente, evita duplicar la lógica de resolución de perfil).

Una situación solo se considera "observada actualmente" si tiene evidencia (una señal miembro) dentro de su propia ventana reciente — calculada a partir de la frecuencia real de sus fuentes (`FREQUENCY_MS`, reusado de `data/acquisition/capture.js`, nunca una duración universal). Sin evidencia reciente, deja de listarse como activa y pasa a `situations.resolved` (histórico preservado, nunca eliminado).

**Corrección aditiva** (no rompe nada existente): se agregó la columna `recommendations.evidence_level` — ya se calculaba en memoria (`recommendations.js`) pero no se persistía, y el Radar necesita distinguir `conflicting` de `insufficient` (antes ambos producían `strength=none` de forma indistinguible). Y se ajustó `signals.js`: la clave de deduplicación de una señal ahora incluye el valor observado (antes solo `monitor+indicador+clase+dirección`, lo que colapsaba subas consecutivas del mismo indicador en una sola señal, impidiendo sostener una tendencia con >1 observación).

## Motor de Reportes (`reports/`)

Presenta inteligencia ya validada — nunca la genera. `reports/select.js` (reusa la resolución `intelligence→decision→recommendation` de `core/profile/personalize.js`, ahora exportada, sin requerir un perfil), `reports/claims.js` (construye `claims` con plantillas deterministas — 10 tipos: `fact/change/trend/impact/risk/opportunity/decision/recommendation/uncertainty/comparison` — nunca texto libre ni IA), `reports/build.js` (orquesta: selector de alcance → claims → snapshot → persistencia), `reports/store.js` (CRUD + versionado, mismo patrón de `supersede` que `recommendations.js`). 7 tipos de reporte, cada uno un módulo delgado en `reports/<tipo>/index.js` — 5 reusan el scaffold original del repo (`sectorial/`, `markets/`, `risks/`, `opportunities/`, `personalized/`); `executive/` y `periodic/` son carpetas nuevas (ninguna de las 5 existentes encajaba con una síntesis transversal o una comparación entre períodos).

**Solo 4 tablas** (de las 6 sugeridas): `reports`, `report_claims`, `report_snapshots`, `report_sources`. Se omiten `report_sections` (una sección es `report_claims` agrupado por `section`, más el JSON ya ensamblado en `reports.body` — una tabla aparte duplicaría lo mismo dos veces) y `report_versions` (el historial ya se reconstruye encadenando `reports.previous_version_id`, igual que `recommendations`).

Endpoints: `GET /reports`, `POST /reports/generate`, `GET /reports/:id`, `GET /reports/:id/traceability`, `GET /reports/:id/versions`. `POST /reports/generate` recibe `{type, ...params}` (p. ej. `{"type":"sectorial","activityId":"cultivo-soja"}`, `{"type":"periodic","monitorId":...,"field":...,"periodStart":...,"periodEnd":...}`).

**Reproducibilidad**: `GET /reports/:id` nunca recalcula — devuelve el `body` ya persistido en la generación (verificado por test). Una comparación de período (`type=periodic`) nunca usa la palabra "tendencia" para afirmar algo — solo `radar/trend.js` puede producir un claim `type=trend`, con su propia regla de evidencia.

## Motor de Presentación y Narrativa (`narrative/`)

Convierte un reporte ya generado (`reports/`) en lenguaje humano — nunca modifica `reports`/`report_claims`. Dos modos: `deterministic` (`narrative/deterministic.js`, plantillas + registro de evidencia proporcional — sección 9 del prompt —, 0 llamadas externas, es el modo por defecto y suficiente para API/tests/fallback) y `ai` (`narrative/ai.js` + `narrative/prompt.js`, una única llamada al `AIProvider` ya resuelto — DeepSeek primario, OpenRouter fallback, misma abstracción sin modificar — con un prompt compacto que **solo** recibe metadata/alcance/claims/fuentes del reporte, nunca acceso a la base de datos).

**Toda salida (determinística o IA) pasa por `narrative/validator.js`** antes de aceptarse — nunca se acepta contenido de IA como verdad. 10 checks deterministas (sin NLP): `claim_ids` inexistentes, párrafos sin respaldo, fuentes no citadas en el reporte (incluidas fuentes inventadas de cero vía patrones "según X"), tendencia sin claim `type=trend`, lenguaje causal prohibido, recomendación convertida en acción/orden, certeza sobre evidencia débil, cifras no presentes en los claims referenciados, actividades fuera de alcance, y advertencias críticas de incertidumbre no reflejadas. Verificado con una prueba de alucinación controlada (`FakeProvider` adversarial que produce las 7 categorías de la sección 30 del prompt — las 7 se detectan) y con una narrativa fiel (valida sin errores).

**Solo 1 tabla nueva** (`report_narratives`): no se guarda de nuevo el contenido del reporte, solo texto + `claim_ids` citados + resultado de validación. Versionado por `(report_id, mode, provider)`, mismo patrón `supersede` que `reports`/`recommendations`.

Endpoints: `GET /reports/:id/narrative`, `POST /reports/:id/narrative` (`{"mode":"deterministic"}` o `{"mode":"ai"}` — este último resuelve el proveedor real y responde `503` con mensaje claro si no hay `DEEPSEEK_API_KEY`/`OPENROUTER_API_KEY` configuradas, sin afectar el modo determinístico), `POST /reports/:id/narrative/validate` (revalida la narrativa vigente, o una enviada en el body — útil para el caso de alucinación controlada).

## Umbrales operativos (`config/thresholds.json`)

`knowledge/signals/thresholds.json` dejó `overrides: []` **a propósito** (no hay metodología estadística validada en el repositorio). Este archivo es la configuración **operativa** que ese esquema anticipó como "a completar incrementalmente" — sigue el mismo `overrides_schema`, vive en `backend/` (no en `knowledge/`, que no se modificó), y cada valor declara su `source_of_value` explícitamente. Sin una entrada aquí, cualquier `valor_modificado` queda `pending_threshold` — nunca se inventa un umbral por defecto.

## IA — qué está realmente implementado

- **Interfaz `AIProvider`** (`generate/analyze/summarize`): implementada.
- **`DeepSeekProvider`**: implementación real (fetch-based), lee `DEEPSEEK_API_KEY` de `process.env`. **No se llama en ningún punto del pipeline ni de la suite de tests** (el pipeline es 100% determinístico — no hay clasificación por IA de nada que ya esté definido por taxonomía, prompt sección 24).
- **`OpenRouterProvider`** (fallback) + `resolveProvider()`: implementado con la misma interfaz, tampoco se invoca en el pipeline.
- **OpenAI / Anthropic**: no implementados (documentados como evaluación futura, prompt sección 23).
- Ningún test de este repo realiza una llamada real a DeepSeek/OpenRouter (evita consumir cuota) — la abstracción se prueba con un `FakeProvider` en `test/pipeline.test.js`.

## Seguridad

`backend/.env` contiene una API key real de DeepSeek y **nunca se leyó su valor más allá de confirmarlo gitignored**; no se copió a ningún archivo de código, commit, log ni test. `.gitignore` (raíz del repo) ya cubre `.env` en cualquier profundidad y `*.sqlite*`. `src/config.js:safeLogFields()` redacta cualquier campo cuyo nombre contenga `key/token/secret/password/authorization` antes de loguear.

## Base de datos

SQLite vía `node:sqlite` (nativo, sin `better-sqlite3` ni otra dependencia). 9 tablas (`pipeline_runs, captures, changes, signals, relevance_results, intelligence, decisions, recommendations, errors`) — ver `db/schema.sql`. Nunca duplica el conocimiento estático de `knowledge/`: cada fila referencia ids (`source_id`, `monitor_id`, `activity_id`, `topic_id`), nunca copia su contenido.

## Modo fixture vs. fuente real

- **`fixtures/`**: 4 archivos, usados por `test/pipeline.test.js` para los 5+ casos extremo a extremo (prompt secciones 36-40) — deterministas, sin red.
- **`test/real-source.test.js`**: usa el adaptador `ckan_api` real contra `catalogodatos.gub.uy` (monitor real `inumet::principal`) — tolerante a falta de conectividad (se omite, no falla la suite, si no hay red).
