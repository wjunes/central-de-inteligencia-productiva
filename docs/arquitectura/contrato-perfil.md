# contrato-perfil

> Contrato técnico congelado entre `web/` y `backend/` para Perfil Productivo. Toda afirmación de este documento fue verificada por ejecución directa contra el código real (`backend/core/profile/store.js`, `backend/api/router.js`, `backend/db/schema.sql`) antes de escribirse — no es una descripción de intención, es el comportamiento real, incluidas sus inconsistencias. Referencia oficial para futuras etapas: **no inferir** este contrato leyendo el código de nuevo, léase este documento.
>
> Etapa que lo produjo: Paso 2B-0 (auditoría, cero cambios de comportamiento). Los hallazgos marcados **[GAP DE CONTRATO]** son inconsistencias reales, no corregidas en esta etapa — cada uno tiene un test de regresión en `backend/test/profile-contract.test.js` que fija el comportamiento actual exacto.

---

## 1. Endpoints

| Operación | Método | Endpoint |
|---|---|---|
| Crear perfil | `POST` | `/profiles` |
| Listar perfiles | `GET` | `/profiles` |
| Obtener perfil | `GET` | `/profiles/:id` |
| Actualizar perfil base | `PUT` | `/profiles/:id` |
| Eliminar perfil | `DELETE` | `/profiles/:id` |
| Actualizar actividades | `PUT` | `/profiles/:id/activities` |
| Actualizar mercados | `PUT` | `/profiles/:id/markets` |
| Actualizar productos | `PUT` | `/profiles/:id/products` |
| Actualizar inputs | `PUT` | `/profiles/:id/inputs` |
| Actualizar prioridades | `PUT` | `/profiles/:id/priorities` |
| Actualizar restricciones | `PUT` | `/profiles/:id/constraints` |

(Fuente: `backend/api/router.js`, bloque `seg[0] === 'profiles'`.)

## 2. Creación — `POST /profiles`

- Content-Type de request: `application/json`.
- Body: `{ name (string, OBLIGATORIO), role?, main_activity_id?, location?, scale?, horizon? }` — todos los demás opcionales, sin valores por defecto salvo `null`.
- `main_activity_id`, si se envía, se valida contra `knowledge.activityById()` (400 si no existe).
- Respuesta: **201**, el objeto de perfil completo (ver forma en §3).
- Si falta `name`: **400** `{ "error": "validation_error", "message": "name es obligatorio" }`. No crea ninguna fila.

```json
// request
{ "name": "Establecimiento Los Ceibos", "main_activity_id": "cultivo-soja" }

// response 201
{
  "id": "…", "name": "Establecimiento Los Ceibos", "role": null,
  "main_activity_id": "cultivo-soja", "location": null, "scale": null, "horizon": null,
  "created_at": "…", "updated_at": "…",
  "activities": [{ "activity_id": "cultivo-soja", "kind": "main" }],
  "markets": [], "products": [], "inputs": [], "priorities": [], "constraints": []
}
```

## 3. Lectura

- `GET /profiles/:id` → **200** con el objeto anidado completo (todas las colecciones incluidas) o **404** `{ "error": "profile_not_found" }` — **sin campo `message`** (única forma de error del proyecto que no lo trae).
- `GET /profiles` → **200** `{ "profiles": [...] }` con **filas planas** de la tabla `profiles` — **sin `activities`/`markets`/etc. anidados**. Solo `GET /profiles/:id` trae las colecciones. Esta asimetría es real y debe respetarse: listar perfiles no sirve para poblar un formulario, solo para elegir cuál abrir.

## 4. Actualización base — `PUT /profiles/:id`

Campos modificables: `name, role, main_activity_id, location, scale, horizon`. `updateProfile()` construye `merged = {...existing, ...patch}` — esto define exactamente la semántica:

| Caso | Comportamiento |
|---|---|
| Campo **omitido** del body | Conserva el valor anterior (verificado: cambiar solo `name` no borra `role`) |
| Campo enviado como **`null` explícito** | Sobrescribe a `null` (verificado) |
| Campo enviado con valor | Sobrescribe |

**`campo omitido ≠ null` — confirmado por código y por test** (`profile-contract.test.js`, casos 3/3b).

**[GAP DE CONTRATO] `main_activity_id: null` vía este endpoint**: `profiles.main_activity_id` queda en `null`, pero **`profile_activities` conserva la fila `kind='main'` anterior sin tocar** — el perfil queda con `main_activity_id: null` y a la vez `activities: [{activity_id: '<el anterior>', kind: 'main'}]`, inconsistente entre sí. Verificado por ejecución directa y fijado en el test `3c`. **Impacto**: bajo en el uso actual (`pages/perfil.js` nunca envía `main_activity_id` a este endpoint — usa siempre `/activities` para eso), pero cualquier código futuro que use `PUT /profiles/:id` para limpiar la actividad principal producirá un perfil inconsistente. **Propuesta de corrección** (no aplicada en esta etapa): que `updateProfile()` detecte `patch.main_activity_id === null` explícito y borre también la fila `kind='main'` de `profile_activities`, igual que ya hace `setActivities()` en el sentido contrario.

Errores: `main_activity_id` inexistente en el catálogo → 400 `validation_error`. Perfil inexistente → 404 `profile_not_found`.

## 5. Colecciones relacionadas

Regla general, verificada individualmente en las 6 colecciones: **cada `PUT` de colección reemplaza el conjunto completo** (`DELETE` de todo lo existente para ese `profile_id` + `INSERT` de lo enviado, dentro de la misma llamada). Nunca es un merge/patch parcial.

### 5.1 Activities — `PUT /profiles/:id/activities`

- Request: `{ "main_activity_id": "<id>" | null, "secondary_activity_ids": ["<id>", ...] }`.
- Identificador: `activity_id` real de `knowledge/activities/activities.json` (nivel `activity` o `subactivity`, ambos válidos).
- Cardinalidad: **0 o 1** principal, **0 o muchas** secundarias.
- Campo que distingue: `kind` (`'main' | 'secondary'`) en `profile_activities`.
- Duplicados: si `main_activity_id` aparece también en `secondary_activity_ids`, el backend lo **descarta en silencio** de las secundarias (nunca hay 2 filas para la misma actividad — `UNIQUE(profile_id, activity_id)` en el esquema lo impediría de todos modos).
- Colección vacía: `{ main_activity_id: null, secondary_activity_ids: [] }` → perfil sin ninguna actividad.
- **[GAP DE CONTRATO]** (inverso al de §4): `main_activity_id: null` por esta vía **sí limpia `profile_activities`** correctamente (sin fila `kind='main'`), pero **dentro de esta función `profiles.main_activity_id` NO se actualiza a `null`** — el `UPDATE` de esa columna vive solo dentro del `if (main_activity_id)` de `setActivities()`. Verificado y fijado en el test `4c`. **Impacto**: un perfil sin actividad principal (correctamente reflejado en `activities`) puede seguir reportando un `main_activity_id` obsoleto y no nulo al nivel de la fila `profiles`. **Propuesta**: mover el `UPDATE profiles SET main_activity_id = ?` fuera del `if`, para que también se ejecute (con `null`) cuando se limpia.
- Validación: `activity_id` inexistente → 400 `validation_error`, sin modificar nada (falla antes del `DELETE`).

### 5.2 Markets — `PUT /profiles/:id/markets`

- Request: `{ "market_ids": ["brasil", "china", ...] }`.
- Identificador: string plano de `domain-names/mercados.json#mercados-destino.market_dimensions` (dimensión de mercado-destino, **no** una actividad ni un dominio de conocimiento en sí).
- Cardinalidad: cero o muchos.
- `[] ` → elimina todas las relaciones de mercado del perfil (verificado, inequívoco).
- Reemplazo verificado con ejemplo real: `["brasil","china"]` → `["brasil"]` dejó exactamente `["brasil"]`, `china` desapareció.
- Validación: id fuera del catálogo → 400 `validation_error`.
- **[GAP DE CONTRATO] duplicados en la misma solicitud**: `["brasil","brasil"]` (ambos ids **válidos**) pasa la validación de existencia (no valida unicidad dentro del array) y falla en el segundo `INSERT` con el error crudo de SQLite (`UNIQUE constraint failed: profile_markets.profile_id, profile_markets.market_id`), propagado como **500** `{ "error": "internal_error", "message": "UNIQUE constraint failed: ..." }` — un mensaje interno de base de datos llega tal cual al cliente, no un `validation_error` humano. Verificado y fijado en el test `5c`. Misma clase de problema en `activities`/`products`/`inputs`/`priorities` (comparten el mismo patrón `DELETE`+bucle de `INSERT` sin deduplicar). **`constraints` es la única excepción** (§5.6). **Propuesta**: deduplicar el array de entrada antes de insertar, o envolver el bucle y convertir una violación `UNIQUE` en `validation_error` (400) en vez de dejarla llegar como 500.

### 5.3 Products — `PUT /profiles/:id/products`

- Request: `{ "products": [{ "activity_id": "cultivo-soja", "ramification_id": "soja" }, ...] }`.
- Identificador: `ramification_id` validado contra `knowledge.effectiveRamifications(activity_id)` (la misma fuente de `GET /profile/ramifications/:activityId`, ver `docs/producto/arquitectura-funcional-ux.md` GAP resuelto en Paso 2A) — **requiere `activity_id`** porque un `ramification_id` no es único globalmente entre actividades.
- Cardinalidad: cero o muchos, por actividad.
- Reemplazo: completo, igual que markets.
- Validación: `activity_id` inexistente → 400; `ramification_id` inexistente **para esa actividad** → 400.
- Mismo GAP de duplicados que §5.2 (no probado repetido aquí — mismo patrón de código).

### 5.4 Inputs — `PUT /profiles/:id/inputs`

- Request y validación idénticos a Products, tabla separada (`profile_inputs`), independiente — actualizar inputs nunca toca products (verificado).
- **[Observación de contrato, no un bug]**: `requireRamification()` **no filtra por `category`** del nodo de ramificación. El comentario de `db/schema.sql` sugiere que `profile_inputs.ramification_id` "debería" ser de `category=inputs/cost_factors/suppliers`, pero el código acepta **cualquier** `ramification_id` válido de esa actividad, sin importar su categoría real — verificado enviando el id `"soja"` (que es `category=products` en `knowledge/ramifications/cultivo-soja.json`) a `inputs` y siendo aceptado sin error. La UI actual (`pages/perfil.js`) nunca provoca esto porque solo ofrece los ids que ya vienen bajo `ramifications.products`/`ramifications.inputs` respectivamente — pero la API en sí **no** lo impide si algo más la llamara directamente.

### 5.5 Priorities — `PUT /profiles/:id/priorities`

- Request: `{ "priorities": [{ "topic_id": "demanda", "rank"?: number }, ...] }`.
- Entidad priorizada: un `topic_id` de `ramifications/_signal_types.json` (el mismo catálogo que `GET /profile/catalogs` expone como `topics`).
- `rank` es **opcional por elemento**: si se omite, se asigna por **posición en el array** (`índice + 1`); si se envía explícito, se usa tal cual.
- **[Observación de contrato]**: un `rank` explícito **no se valida como único ni secuencial** — verificado enviando dos temas distintos con `rank: 5` ambos: el backend los acepta sin corregir ni rechazar (`UNIQUE(profile_id, topic_id)` protege contra repetir el mismo tema, no contra repetir el mismo rank).
- `[]` → elimina todas las prioridades.
- Principio reafirmado explícitamente por este contrato: **las prioridades son orden/preferencia declarada por el usuario — nunca constituyen un score de relevancia** (`core/profile/personalize.js` nunca las lee para alterar el nivel de relevancia central, solo para ordenar la salida de `/changes`).
- Validación: `topic_id` inexistente → 400.

### 5.6 Constraints — `PUT /profiles/:id/constraints`

- Request: `{ "constraints": [{ "category": "regulatory", "severity": "soft_constraint", "description"?: string|null }, ...] }`.
- `category` validado contra `decision/constraints.json.categories[].id`; `severity` contra `decision/constraints.json.severity.values` (`hard_constraint | soft_constraint | unknown_constraint`) — ambos del catálogo ya existente, ninguno inventado aquí.
- No hay `activity_id` — una restricción es del perfil en general, no de una actividad puntual (a diferencia de products/inputs).
- **Única de las 6 colecciones sin `UNIQUE` en el esquema** (`profile_constraints` no lo declara): **acepta duplicados exactos** sin error — verificado enviando la misma `{category,severity,description}` dos veces: resultan 2 filas idénticas con distinto `id`. Esto es consistente (no es un bug, es la ausencia deliberada o no-deliberada de una restricción — documentado como observación, no corregido).
- `[]` → elimina todas las restricciones.

## 6. Semántica de reemplazo — ejemplo end-to-end verificado

Con `activities`, `markets`, `products`, `inputs`, `priorities` y `constraints` poblados, se ejecutó una **segunda ronda** de `PUT` solo sobre 5 de las 6 colecciones (constraints deliberadamente omitida). Resultado real:

- Las 5 colecciones actualizadas reflejan exactamente y solo lo enviado en la segunda ronda — nada de la primera ronda sobrevive.
- `constraints` (no tocada en la segunda ronda) **permanece exactamente como quedó en la primera** — confirma que cada colección se reemplaza de forma independiente entre sí; actualizar una nunca afecta a otra.

Ver test `12/13` en `profile-contract.test.js` para la secuencia completa reproducible.

## 7. Tabla de errores

| Situación | Status | Cuerpo |
|---|---|---|
| Falta un campo obligatorio / id fuera del catálogo | 400 | `{ "error": "validation_error", "message": "<humano>" }` |
| Perfil inexistente (`GET/PUT/DELETE /profiles/:id` y todas las sub-rutas) | 404 | `{ "error": "profile_not_found" }` (sin `message`) |
| **[GAP]** id válido duplicado en el mismo array de una colección con `UNIQUE` | 500 | `{ "error": "internal_error", "message": "<mensaje crudo de SQLite>" }` |
| Cualquier otro error no previsto | 500 | `{ "error": "internal_error", "message": err.message }` |

No hay actualmente ningún caso de **409 Conflict** en el contrato de Perfil.

## 8. Transaccionalidad

**Comportamiento real (Opción C, ninguna de las ideales)**: ninguna función de `core/profile/store.js` abre una transacción explícita (`BEGIN`/`COMMIT`). Cada `db.prepare(...).run()` se autocommitea individualmente (SQLite en modo autocommit, `PRAGMA journal_mode = WAL` no cambia esto). Consecuencia verificada: si el `INSERT` N falla dentro del bucle de una función `setX()`, el `DELETE` inicial **ya se ejecutó** y los `INSERT` 1..N-1 **ya se confirmaron** — el conjunto queda en un estado **parcial**, que no es ni el anterior (no hay rollback) ni el nuevo completo. Verificado con un caso real reproducible (`markets`, ids válidos duplicados) en el test de transaccionalidad de `profile-contract.test.js`. **No se corrige en esta etapa** — requeriría envolver cada `setX()` en una transacción explícita, cambio de comportamiento fuera del alcance de una auditoría.

## 9. Identidad del perfil (`active-profile.js`)

**No existe autenticación en el sistema.** `web/src/state/active-profile.js` guarda un `profile_id` en `localStorage` del navegador — es **exclusivamente una conveniencia de UI de un solo dispositivo** ("¿qué perfil estaba viendo esta pestaña/navegador la última vez?"), nunca enviada al backend como credencial ni verificada contra nada. El backend no tiene noción de "perfil activo": cualquier cliente que conozca un `profile_id` puede leerlo/editarlo vía la API — no hay control de acceso por perfil. Si el `profile_id` guardado ya no existe (`GET /profiles/:id` → 404), `pages/perfil.js` lo trata como "sin perfil" y ofrece crear uno nuevo — no hay recuperación ni fusión de datos. **Esto no debe interpretarse como un mecanismo de seguridad** — es deliberadamente equivalente a "recordar la última pestaña abierta", nada más.

## 10. Correspondencia `web/src/services/api.js` ↔ backend

| Función frontend | Método | Endpoint | Payload enviado | Transformación |
|---|---|---|---|---|
| `getProfileCatalogs()` | GET | `/profile/catalogs` | — | ninguna |
| `getActivityRamifications(id)` | GET | `/profile/ramifications/:id` | — | ninguna (solo `encodeURIComponent(id)`) |
| `listProfiles()` | GET | `/profiles` | — | ninguna |
| `getProfile(id)` | GET | `/profiles/:id` | — | ninguna |
| `createProfile(data)` | POST | `/profiles` | `data` tal cual | ninguna |
| `updateProfile(id, patch)` | PUT | `/profiles/:id` | `patch` tal cual | ninguna |
| `updateProfileActivities(id, data)` | PUT | `/profiles/:id/activities` | `data` tal cual (`{main_activity_id, secondary_activity_ids}`) | ninguna |
| `updateProfileMarkets(id, marketIds)` | PUT | `/profiles/:id/markets` | `{ market_ids: marketIds }` | envuelve el array recibido en la clave que espera el backend |
| `updateProfileProducts(id, products)` | PUT | `/profiles/:id/products` | `{ products }` | envuelve |
| `updateProfileInputs(id, inputs)` | PUT | `/profiles/:id/inputs` | `{ inputs }` | envuelve |
| `updateProfilePriorities(id, priorities)` | PUT | `/profiles/:id/priorities` | `{ priorities }` | envuelve |
| `updateProfileConstraints(id, constraints)` | PUT | `/profiles/:id/constraints` | `{ constraints }` | envuelve |

**Auditoría de transformaciones silenciosas**: ninguna encontrada. Las únicas "transformaciones" son envolver un array recibido bajo la clave JSON que el body del backend espera (`{market_ids: [...]}` etc.) — necesarias y documentadas, no una alteración de datos. `pages/perfil.js` aplica además, ANTES de llamar a `updateProfileActivities`, `sanitizeSecondaryActivities()` (quita la actividad principal de la lista de secundarias en el cliente) — una prevención de UX que coincide exactamente con lo que el backend ya hace en silencio (§5.1); no introduce ninguna divergencia.

## 11. Resumen de GAPs de contrato (solo problemas reales, no estilísticos)

| # | GAP | Severidad | Corregido en esta etapa |
|---|---|---|---|
| 1 | `PUT /profiles/:id` con `main_activity_id: null` no limpia `profile_activities` | Baja (sin consumidor actual que lo dispare) | No |
| 2 | `PUT /profiles/:id/activities` con `main_activity_id: null` no limpia `profiles.main_activity_id` | Baja (inverso al #1) | No |
| 3 | Un id válido duplicado en el mismo array de escritura produce 500 con mensaje crudo de SQLite, no 400 | Media (mensaje interno expuesto + estado parcial) | No |
| 4 | Sin transacciones explícitas: un fallo a mitad de un reemplazo deja estado parcial | Media (mismo origen que #3) | No |
| 5 | `profile_inputs`/`profile_products` no restringen la `category` real del nodo de ramificación | Informativo (la UI actual nunca lo dispara) | No — no es un bug, es una ausencia de restricción |
| 6 | `profile_constraints` permite duplicados exactos (única colección sin `UNIQUE`) | Informativo | No — comportamiento consistente, solo distinto de las otras 5 |

Ninguno de estos 6 hallazgos fue corregido — este paso es de auditoría y congelamiento, no de rediseño. Los 4 primeros comparten causa raíz (ausencia de transacciones explícitas) y podrían resolverse juntos en una futura etapa quirúrgica si se decide que vale la pena.
