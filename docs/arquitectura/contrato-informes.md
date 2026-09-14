# contrato-informes

> Contrato técnico para el **Motor de Informes** (`backend/reports/` + `backend/narrative/`). Producto de una auditoría (Paso 2E-0) — no implementa la pantalla `/informes`, no agrega endpoints, no modifica ninguna capa de inteligencia/relevancia/decisión/recomendación/knowledge. Toda afirmación fue verificada por lectura directa de código real, por ejecución real (backend levantado, `curl` contra endpoints reales) y por la suite de tests existente (`backend/test/reports.test.js`, 27 tests reales + `backend/test/narrative.test.js`, 22 tests reales) — nunca inferida de documentación (los documentos de `docs/metodologia/` siguen siendo "Documento en construcción", sin contenido real, verificado de nuevo en esta etapa — no se usaron como fuente).

---

## 1. Propósito

Definir, antes de diseñar o implementar la pantalla de Informes, exactamente qué es hoy un "informe" en este sistema, de dónde obtiene su información, qué puede afirmar, qué no puede afirmar, y qué GAPs reales existen — para que 2E-1 (arquitectura funcional/UX) no invente capacidades que el backend no tiene.

## 2. Alcance

Auditoría y congelación de contrato únicamente. No se creó ningún endpoint, no se tocó `knowledge/`, no se modificó ninguna capa de inteligencia/relevancia/decisión/recomendación/perfil/radar/reportes/narrativa. Todo lo documentado aquí ya existía antes de esta etapa — **el hallazgo central de esta auditoría es que el Motor de Informes está considerablemente más completo de lo que el prompt de esta etapa anticipaba** ("no asumir que todos los tipos deben existir en V1" — de hecho los 5 tipos sugeridos YA existen, más 2 adicionales).

## 3. Fuentes de datos

Todo el árbol `DATOS → CAMBIOS → SEÑALES → RELEVANCIA → INTELIGENCIA → DECISIÓN → RECOMENDACIÓN` ya construido es reutilizado sin excepción:

| Capa | Fuente real | Reuso en Informes |
|---|---|---|
| Relevancia | `relevance_results` (tabla) | `reports/select.js#itemsForActivities()` para reportes NO personalizados; `core/profile/personalize.js#getChanges()` para personalizados/ejecutivo-con-perfil |
| Inteligencia | `intelligence` (tabla) | `intelligenceForSignal()` (reusada de `personalize.js`, ya exportada para este propósito) |
| Decisión/Recomendación | `decisions`/`recommendations` | `decisionsAndRecommendations()` (misma función que usa Radar/Situación) |
| Situaciones/tendencia | `radar/build.js#buildRadar()` | Los reportes "estándar" (no periódicos) invocan `buildRadar()` para poblar `current_situation`/`trends` — **sin volver a calcular nada**, ver §10 |

**Cero cálculo nuevo de relevancia/inteligencia/decisión/recomendación en `reports/`** — verificado por grep: ningún archivo de `reports/` contiene lógica de clasificación de riesgo/oportunidad, generación de decisiones ni de recomendaciones. Confirmado también por test (`Caso 24`: generar 2 reportes no altera el conteo de `captures`/`signals`/`intelligence`).

## 4. Tipos de informes soportados

**Estado real (verificado en código y por ejecución)**: 7 tipos completamente implementados, no 5. El prompt de esta etapa sugería evaluar 5 tipos "sin asumir que todos deben existir en V1" — la auditoría encontró que **los 5 ya existen, más 2 adicionales que el scaffold original no contemplaba**.

| Tipo (`type`) | Módulo | Existente | Implementado | Requiere perfil | Requiere IA/Search |
|---|---|---|---|---|---|
| `sectorial` | `reports/sectorial/index.js` | Sí | Sí (verificado, Caso 2) | No (`activityId`) | No |
| `market` | `reports/markets/index.js` | Sí | Sí (Caso 3) | No (`marketId`, `activityIds?`) | No |
| `risk` | `reports/risks/index.js` | Sí | Sí (Caso 4) | No (`activityIds?`) | No |
| `opportunity` | `reports/opportunities/index.js` | Sí | Sí (Caso 5) | No (`activityIds?`) | No |
| `personalized` | `reports/personalized/index.js` | Sí | Sí (Caso 6) | **Sí**, obligatorio | No |
| `executive` | `reports/executive/index.js` (nuevo, no en el scaffold original) | Sí | Sí (Caso 1) | Opcional (con perfil: sus cambios; sin perfil: síntesis global `relevance_level∈{high,critical}`) | No |
| `periodic` | `reports/periodic/index.js` (nuevo, no en el scaffold original) | Sí | Sí (Caso 7) | No (perfil siempre `null`) | No |

Los 7 son **existentes + implementados + con contrato verificable** (no "previstos" ni "faltantes"). **Ninguno requiere IA ni búsqueda externa para generarse** — la IA solo interviene, opcionalmente, en la fase de *narrativa* (§23), nunca en la selección/clasificación de contenido.

## 5. Estructura conceptual del informe

Un informe real (`reports/store.js#getReport()`) es:

```
{
  id, type, title, scope: {...}, profile_id, created_at, cutoff_at,
  period_start, period_end, rules_version, snapshot_id, status, version, previous_version_id,
  body: { metadata, scope, executive_summary, current_situation, changes, trends, impacts,
          risks, opportunities, decisions, recommendations, uncertainty, evidence, sources,
          comparisons, traceability },
  claims: [ { id, section, type, activity_id, text, importance, evidence_level, confidence, references } ],
  sources: [ {id, name, institution, type} ],   // objetos reales de knowledge/sources/, no copias
  snapshot: { id, created_at, cutoff_at, situation_ids, intelligence_ids, decision_ids, recommendation_ids, signal_ids },
}
```

`body` es el documento presentable (una sección por concepto, nunca mezclados); `claims` es la lista plana subyacente (10 tipos: `fact/change/trend/impact/risk/opportunity/decision/recommendation/uncertainty/comparison` — `reports/claims.js#TEMPLATES`, verificado); `snapshot` es la foto de qué IDs reales sustentan el informe (para reproducibilidad, §21).

**Cada `claim.text` sale de una plantilla determinista** (`reports/claims.js#TEMPLATES`) — nunca texto libre, nunca generado por IA en esta capa (la IA solo puede intervenir después, sobre el `body` ya cerrado, en `narrative/`, §23).

## 6. Datos de entrada

`POST /reports/generate` recibe `{type, ...params}`. Params reales por tipo (verificados en cada `selectScope()`):

| Tipo | Params obligatorios | Params opcionales |
|---|---|---|
| `sectorial` | `activityId` | — |
| `market` | `marketId` (debe existir en `knowledge.marketDimensions()`) | `activityIds` (array; default: todas) |
| `risk` / `opportunity` | — | `activityIds` (array; default: todas) |
| `personalized` | `profileId` | — |
| `executive` | — | `profileId` (si se omite, síntesis global) |
| `periodic` | `monitorId`, `field`, `periodStart`, `periodEnd` | `activityId` |

## 7. Datos de salida

Ver §5. **Ningún campo se rellena con datos inventados**: cuando una sección no tiene claims, el `body` expone un marcador explícito y honesto en vez de omitir la clave o mostrar un array vacío ambiguo — `reports/build.js#emptyMarker()`:

```js
{ changes: 'no_relevant_changes', trends: 'insufficient_evidence', impacts: 'no_relevant_information',
  risks: 'no_relevant_information', opportunities: 'no_relevant_information', decisions: 'no_relevant_information',
  recommendations: 'no_recommendation', uncertainty: 'no_relevant_information', comparisons: 'no_relevant_information' }
```

Verificado con ejecución real: `Caso 4` (`rEmpty.body.risks.no_relevant_information === true` para una actividad sin riesgos reales), `Caso 12` (`recommendations.no_recommendation === true` sin recomendaciones).

## 8. Relación con perfil

**`CENTRAL RELEVANCE + CONTEXT = PERSONALIZED RELEVANCE`** se respeta sin excepción, igual que en Radar/Situación:

- `personalized`/`executive` (con perfil): usan `getChanges(db, profileId)` — la MISMA función de `core/profile/personalize.js` que usan Radar y Situación. Cero segunda implementación de personalización.
- `sectorial`/`market`/`risk`/`opportunity`/`executive` (sin perfil): usan `itemsForActivities()` (`reports/select.js`), que construye el MISMO shape de item pero con `personalized_relevance.level = relevance_level` **central** (sin bumps de perfil) — documentado explícitamente en el código como "no una segunda escala", solo la ausencia de contexto de perfil cuando no corresponde.
- Prioridades: no aumentan relevancia en ningún reporte (mismo GAP-no-GAP ya congelado en `contrato-situacion.md`/`contrato-radar.md` — es una decisión deliberada, no una omisión).
- Restricciones (`profile_constraints`): **siguen sin influir** en ningún reporte (grep confirmado: cero referencias a `constraints` en `reports/`) — mismo GAP 12.2 heredado, no corregido aquí.

## 9. Multiactividad

Verificado con el perfil real de prueba (ganadería + soja + aceites, `Caso 13/14`): un reporte `personalized` sobre ese perfil produce claims de `risk`/`opportunity` correctamente separados por `activity_id` (`cultivo-soja→opportunity`, `elaboracion-aceites→risk`), **y la actividad principal (`ganaderia-bovina-carne`) no recibe ningún claim de riesgo/oportunidad forzado** — sin privilegio automático, igual que Radar. No hay duplicación (`Caso 30`: los claims de un reporte `sectorial` acotado a `cultivo-soja` solo contienen esa actividad, nunca otra fuera de alcance, ni siquiera una no relacionada como `turismo`).

## 10. Inteligencia

Reusada 100% de `intelligence` (tabla) vía `intelligenceForSignal()` — nunca reclasificada. Los claims `risk`/`opportunity`/`impact` (`reports/claims.js#claimsFromChangeItem`) reflejan exactamente el `intel.type` ya calculado. **`trend` no es una `intelligence` unit** (mismo hallazgo que en `contrato-radar.md` §17.2) — un claim `type=trend` solo se genera desde `radar/trend.js#detectTrend()` vía `situation.trend.status==='confirmed'` (`reports/claims.js#claimFromTrend`), nunca desde una fila de `intelligence`. Verificado con ejecución real: `Caso 17` (3 observaciones consecutivas → sí aparece `trends.claims[0].type==='trend'`), `Caso 3` implícito de `radar.test.js` (1 sola observación → nunca se fabrica).

**`intelligence` no versiona** (GAP ya documentado en el propio código, `Caso 18`): no existe un estado `superseded` para unidades de inteligencia (a diferencia de `recommendations`) — un reporte nunca inventa ese estado.

## 11. Decisiones

Se exponen como claims `type=decision` (`section=decisions`), uno por cada `decision` real anidada — nunca resumidas ni fusionadas. Campos del claim: `alternative_count` (siempre 2 hoy, igual que Radar), `decision_type`, `rationale` — **nunca `best_option`** (no existe en el modelo, confirmado de nuevo aquí). Un informe puede tener sección `decisions` vacía (`no_relevant_information`) sin que eso invalide el resto — las secciones son independientes.

## 12. Recomendaciones

Claims `type=recommendation` con `text = recommendation.statement` **verbatim** (`reports/claims.js:21`: `recommendation: (c) => c.statement` — nunca reformulado). Solo la recomendación **activa** aparece (`Caso 11/19`: tras 3 corridas sucesivas que producen 3 recomendaciones para la misma actividad, solo 1 claim de recomendación sobrevive — la superseded desaparece del `body`, pero NO de la trazabilidad del snapshot). **Deduplicación real**: una misma recomendación activa alcanzada desde 2 `items` distintos (2 señales del mismo indicador a través del tiempo) se muestra **una sola vez** (`reports/build.js#dedupeRecommendationClaims`, comentario explícito en el código, verificado por lectura — no hay test dedicado a este caso específico pero el mecanismo es directamente auditable).

## 13. Evidencia

Cada claim de intelligence/recomendación lleva su propio `evidence_level` (`intelligence.evidence_level` siempre `structural_relationship` hoy — mismo hallazgo que Radar §11 de `contrato-radar.md`; `recommendation.evidence_level` sí variable: `insufficient/limited/moderate/conflicting`). El body agrega un resumen (`evidence.by_level`, conteo por nivel) y marca cuántos claims son de incertidumbre (`evidence.uncertain_claims`). La evidencia contradictoria **se conserva explícita, nunca se oculta ni se resuelve arbitrariamente**: `Caso 10` — con una señal marcada `conflicting`, el reporte produce un claim de `uncertainty` con `evidence_level==='conflicting'` Y una recomendación con `statement==='No existe evidencia suficiente para recomendar una acción.'` (nunca una recomendación categórica sobre evidencia contradictoria).

## 14. Confianza

`intelligence.confidence` (4 subdimensiones: `source_quality`, `change_detection_confidence`, `relevance_confidence`, `analysis_confidence`) se propaga tal cual a los claims de riesgo/oportunidad/impacto — nunca combinada en un número. **Hallazgo nuevo de esta auditoría**: `knowledge/intelligence/intelligence-types.json` define una dimensión `epistemic_status` (`observed/derived/estimated/projected/inferred/scenario`) que **nunca se persiste ni se usa** en ningún punto de `backend/` (grep confirmado, cero ocurrencias fuera de `knowledge/`) — la distinción conceptual DATO/INTERPRETACIÓN/ESTIMACIÓN/PROYECCIÓN/INFERENCIA que pide el prompt de esta etapa (§11) existe HOY solo de forma indirecta, vía la separación estructural de capas (`signal` es dato, `intelligence` es interpretación, `recommendation` es la única capa con un vocabulario de acción) y vía `evidence_level`/`confidence` — no como un campo epistemológico explícito por claim. Documentado como GAP informacional nuevo (§28).

## 15. Trazabilidad

**Completa y funcional, con endpoint dedicado** (`GET /reports/:id/traceability`, `reports/store.js#getTraceability()`) — a diferencia de Radar, que NO tiene endpoint de trazabilidad propio (`contrato-radar.md` §16 lo señala explícitamente). Cadena real verificada por ejecución (`Caso 20`):

```
claim → (refs.signal_id) → signal → (signal.change_id) → change → (change.capture_id) → capture → (capture.source_id) → knowledge.sourceById()
```

y, cuando el claim lo referencia: `intelligence_id`, `decision_id`, `recommendation_id`, `situation_id`, `activity_id` (todos incluidos directamente en `chain`, sin resolución adicional). **Esto es estrictamente más profundo que lo que expone Radar hoy** (Radar se detiene en `signal`, sin `change_id`/`capture_id` visibles — `contrato-radar.md` §11/§16) — un informe SÍ puede llegar hasta la fuente original, porque `getTraceability()` consulta la base de datos directamente (server-side), no depende de que el JSON de `/radar` incluya esos campos.

**Límite heredado, reconfirmado**: la relación `decision → recommendation` sigue resolviéndose por `activity_id` en `decisionsAndRecommendations()` (GAP 17.7 de `contrato-radar.md`), no por `decision.id` exacto — este mecanismo es compartido por Informes (misma función reusada), así que el mismo matiz aplica: un `claim` de recomendación anidado bajo una decisión puede, en el caso de reuso de una recomendación ya activa, no haber sido generado exactamente por esa decisión. No se corrige aquí.

## 16. Temporalidad

- `created_at`, `cutoff_at` (momento de corte de la información usada) en todo informe.
- `period_start`/`period_end` **solo** en `periodic` (`null` en el resto — verificado en el esquema de `createReport()`).
- **Comparación de período**: existe, pero **solo como tipo de informe explícito** (`periodic`), nunca automática para "todo el perfil" — mismo GAP 12.5 de `contrato-situacion.md`/`contrato-radar.md`, reconfirmado aquí sin corregir. `periodic` requiere que el cliente indique `monitorId`+`field`+`periodStart`+`periodEnd` explícitamente — no hay una comparación "vs. semana pasada" automática a nivel de perfil completo.
- **Hallazgo importante**: `periodic` es el **único** tipo de informe que accede a `previous_value`/`new_value` REALES (`reports/periodic/index.js` lee `changes.new_value` directamente de la tabla `changes`, sin pasar por `getChanges()`/`buildRadar()`) — confirmado con ejecución real (`Caso 7`: el claim de comparación incluye valores reales antes/después). **Esto significa que el GAP 12.1 (`previous_value`/`new_value` no llegan a Situación/Radar) es una limitación específica de esos dos consumidores, no del modelo de datos** — la información sí existe y sí es accesible, solo que `getChanges()` no la proyecta. Nunca se usa la palabra "tendencia" para una comparación de 2 puntos (`Caso 16`, verificado explícitamente: el texto siempre aclara "no implica una tendencia confirmada").

## 17. Mercados

`market_id` es una dimensión validada contra `knowledge.marketDimensions()` (mismo catálogo ya usado por `profile_markets` — `mercados-destino.market_dimensions`), nunca un dominio de conocimiento nuevo. `filterByMarket()` filtra por `source.markets` (de `knowledge/sources.json`), reutilizando exactamente el mismo mecanismo de `market_match` que personaliza relevancia en Radar/Situación — no una lógica paralela. Un reporte de mercado sin `activityIds` explícito cubre **todas** las actividades del catálogo (verificado en `markets/index.js`), lo cual puede ser costoso de interpretar visualmente pero no incorrecto — nota para 2E-1, no una corrección de esta etapa.

## 18. Estados vacíos

Ver §7 (marcadores explícitos por sección). A nivel de informe completo: un informe con **todas** las secciones vacías es un resultado válido y generable (no lanza error) — el "vacío total" nunca se convierte en un 404 ni en un error, es un documento real con marcadores honestos en cada sección.

## 19. Información insuficiente

`reports/claims.js#TEMPLATES.uncertainty`: `"{actividad}: evidencia {nivel} {y contradictoria si aplica} - no se presenta como hecho confirmado."` — se genera automáticamente para toda recomendación con `evidence_level` débil (`limited/insufficient/conflicting`, `claims.js:112`). Un informe **nunca completa un vacío con una conclusión artificial** — verificado en `Caso 9` (sin señales relevantes → `body.changes.no_relevant_changes:true`, ningún claim inventado) y `Caso 12` (sin recomendación real → `no_recommendation:true`, nunca una recomendación genérica de relleno).

## 20. Evidencia contradictoria

Ver §13. `conflicting` es un valor real y observable de `evidence_level`, se conserva explícito en `uncertainty`, y fuerza `strength='none'`→`statement='No existe evidencia suficiente para recomendar una acción.'` en la capa de recomendaciones (heredado, no reimplementado en `reports/`). Verificado con ejecución real (`Caso 10`).

## 21. Errores

**Hallazgo de esta auditoría (defecto de implementación, no corregido — regla §20 de este paso)**: verificado por ejecución HTTP real contra el backend:

| Caso | Resultado real |
|---|---|
| `POST /reports/generate` sin `type` | **400** `{error:'validation_error', message:'body.type es obligatorio'}` — correcto |
| `POST /reports/generate` con `type` desconocido | **500** `{error:'internal_error', message:"generateReport: tipo de reporte desconocido 'no-existe'"}` |
| `POST /reports/generate {type:'sectorial'}` sin `activityId` | **500** `{error:'internal_error', message:'reporte sectorial: activityId es obligatorio'}` |
| `GET /reports/:id` inexistente | **404** `{error:'report_not_found'}` — correcto |
| `POST /reports/:id/narrative {mode:'ai'}` sin API key configurada | **503** `{error:'ai_unavailable', message:'...', hint:"usar mode='deterministic'..."}` — correcto y con mensaje útil |

**El defecto**: los `selectScope()` de cada tipo de informe (y el `throw` de tipo desconocido en `build.js`) usan `Error` genérico, no la clase `ValidationError` de `core/profile/store.js` — el router (`api/router.js:236`) solo intercepta `ValidationError` para responder 400; cualquier otro `Error` cae al bloque genérico y responde **500**, aunque la causa sea un error de validación de entrada del cliente, no un fallo interno real. El mensaje no expone SQL/stack traces/secretos (son mensajes de validación legibles, ej. "activityId es obligatorio"), pero **el código de estado es incorrecto** respecto del patrón ya establecido en el resto de la API (`profiles/*` sí usa `ValidationError`→400 consistentemente). Documentado como GAP nuevo (§28), no corregido en esta etapa.

## 22. Seguridad

- **Sin autenticación** en todo el backend (heredado, ya documentado en `contrato-perfil.md`) — cualquier cliente puede leer `GET /reports?profile_id=<cualquier_id>` o `GET /reports/:id` de cualquier perfil sin verificación de propiedad. No es un GAP nuevo de Informes, es el mismo estado del resto del sistema.
- **Sin exposición de SQL/stack traces**: verificado en los casos de error de §21 — los mensajes son validaciones legibles, nunca contenido crudo de la base.
- **Hallazgo nuevo de esta auditoría**: cuando se genera una narrativa `mode='ai'` para un informe `personalized`, el `scope` enviado al proveedor de IA externo (`narrative/prompt.js#buildPrompt()`) incluye `profile.markets/products/inputs/priorities/constraints` (todo el `scope` del reporte personalizado se serializa tal cual). Esto significa que, si en el futuro se habilita `mode='ai'` para informes personalizados, **datos del perfil productivo del usuario viajarían a un proveedor de IA externo** (DeepSeek u OpenRouter) — no es un defecto (es exactamente lo que el modo `ai` está diseñado para hacer, y requiere una API key explícitamente configurada, es opt-in), pero es una implicación de privacidad que no estaba documentada explícitamente en ningún contrato anterior. Documentado como GAP informacional nuevo (§28) para que 2E-1/2E-2 lo consideren al diseñar si el modo `ai` se expone al usuario final.
- API keys (`DEEPSEEK_API_KEY`/`OPENROUTER_API_KEY`) se leen de `process.env`, nunca se registran en logs ni se devuelven en respuestas (verificado: `DeepSeekProvider` nunca incluye `this.apiKey` en ningún valor de retorno).

## 23. Costos operativos

```text
Generación de informe (cualquiera de los 7 tipos): HTTP externo: 0, IA: 0, Search: 0, SQLite: sí (lecturas + 1 INSERT por tabla de reports/*)
Narrativa modo 'deterministic' (default): HTTP externo: 0, IA: 0, Search: 0
Narrativa modo 'ai' (opt-in explícito, requiere API key configurada): HTTP externo: 1 llamada al proveedor resuelto (DeepSeek u OpenRouter), IA: 1, Search: 0
```

Verificado por ejecución real y por test (`Caso 25`: grep confirma que `reports/{build,claims,select,store}.js` no importan `services/ai` ni `services/search`; `Caso 26`: `generateReport()` nunca lanza por falta de configuración de IA; `Caso 27/28`: los proveedores permanecen abstractos, nunca invocados fuera del modo `ai` explícito). La única llamada externa real de todo el Motor de Informes es la de `narrative/ai.js#generateAINarrative()`, y es **exactamente 1** por invocación (nunca por sección, nunca por claim) — coherente con la lección de BNC-UY citada en el prompt de esta etapa (evitar búsquedas redundantes): aquí no hay ninguna búsqueda en absoluto, ni siquiera con IA activada (el proveedor solo redacta, nunca busca — `narrative/prompt.js` se lo prohíbe explícitamente en el system prompt).

## 24. Endpoints existentes

| Método | Ruta | Función |
|---|---|---|
| GET | `/reports?type=&profile_id=` | Listar (id, type, title, profile_id, status, version, created_at) |
| POST | `/reports/generate` | `{type, ...params}` → genera y persiste (201) |
| GET | `/reports/:id` | Informe completo (200) o `report_not_found` (404) |
| GET | `/reports/:id/traceability` | Cadena claim→fuente completa |
| GET | `/reports/:id/versions` | Cadena de versiones (encadenada por `previous_version_id`) |
| GET | `/reports/:id/narrative` | Última narrativa activa (200) o `narrative_not_found` (404) |
| POST | `/reports/:id/narrative` | `{mode:'deterministic'\|'ai'}` → genera narrativa (201) o `ai_unavailable` (503) |
| POST | `/reports/:id/narrative/validate` | Revalida la narrativa vigente o una enviada en el body |

**Los 8 ya existen y están probados** (49 tests reales entre `reports.test.js` y `narrative.test.js`) — ninguno necesita crearse para que 2E-1/2E-2 diseñen sobre ellos.

## 25. Endpoints faltantes

**Ninguno estrictamente necesario para una V1 de la pantalla de Informes.** Los 8 endpoints de §24 cubren listar, generar, leer, trazar, versionar y narrar. Una posible mejora futura (no propuesta como endpoint nuevo en esta etapa): un filtro adicional en `GET /reports` por `status` (hoy solo `type`/`profile_id`) para que un futuro frontend pueda listar "solo vigentes" sin descartar `superseded` en el cliente — anotado como candidato de diseño para 2E-1, no un GAP bloqueante.

## 26. Limitaciones

- `intelligence` no versiona (§10) — un informe no puede mostrar "esta interpretación reemplazó a una anterior" a nivel de intelligence, solo a nivel de `recommendation` (que sí versiona).
- `report_sections`/`report_versions` como tablas separadas fueron deliberadamente omitidas (`backend/README.md`) — no es una ausencia, es una decisión de esquema ya documentada (una sección es `claims` agrupados + el JSON ya ensamblado; el versionado se reconstruye encadenando `previous_version_id`).
- Un reporte de mercado sin `activityIds` cubre TODO el catálogo de actividades — potencialmente pesado de presentar (nota UX, no defecto).
- No existe paginación en `GET /reports` (`listReports()` no acepta `limit`/`cursor`) — sin evidencia de que sea necesaria hoy (volumen bajo en pruebas reales), anotado para si el volumen crece.

## 27. GAPs heredados (12.1–12.6, 17.2–17.8) — estado respecto de Informes

| GAP | Aplica a Informes? | Estado |
|---|---|---|
| 12.1 (previous_value/new_value no llegan a Situación/Radar) | **No aplica de la misma forma** — `periodic` sí accede a valores reales (§16). Los demás tipos heredan la misma ausencia que Radar/Situación (no pasan por `changes` directamente). | Reconfirmado, matizado |
| 12.2 (constraints sin influencia) | Sí, igual que Radar/Situación (§8) | Reconfirmado, no corregido |
| 12.3 (indicador no es entidad) | Sí — un informe no puede listar "todos los indicadores" como entidad propia | Reconfirmado |
| 12.4 (sin vista de mercado en vivo) | **Parcialmente resuelto por el tipo `market`** — un informe de mercado SÍ existe y es generable a demanda; sigue sin ser una "vista en vivo" sin generar el informe (coherente con lo ya documentado) | Reconfirmado, matizado |
| 12.5 (sin comparación de período automática) | Sí — `periodic` requiere parámetros explícitos, no hay comparación automática de todo el perfil (§16) | Reconfirmado |
| 12.6 (sin actividades ≡ sin señales) | Sí, en `personalized`/`executive` con perfil (ambos usan `getChanges()`) | Reconfirmado, no corregido |
| 17.2 (`trend` no es intelligence unit) | Sí, idéntico (§10) | Reconfirmado |
| 17.3 (`situation.confidence` no agregada) | Aplica solo si un informe expone `current_situation` con situaciones (los reportes estándar sí las incluyen vía `buildRadar()`) | Reconfirmado |
| 17.4 (`view=` desconocido → 200) | No aplica — Informes no tiene un parámetro `view=` | N/A |
| 17.5 (`last_seen_at` se actualiza con la sola lectura) | Aplica indirectamente si un informe expone `situation.last_seen_at` sin aclarar su semántica — mismo cuidado que en Radar | Reconfirmado |
| 17.6 (sin `information_value` explícito en decisiones) | Sí, idéntico | Reconfirmado |
| 17.7 (decision↔recommendation por actividad, no por decision_id exacto) | Sí, mecanismo compartido (§15) | Reconfirmado |
| 17.8 (`defer` catalogado pero no alcanzable) | Sí, mismo motor de recomendaciones | Reconfirmado |

Ninguno se corrigió en esta etapa.

## 28. GAPs nuevos (descubiertos en 2E-0)

| # | Severidad | GAP | Tipo |
|---|---|---|---|
| 21.1 | MEDIO (defecto real) | `POST /reports/generate` con `type` desconocido o params obligatorios ausentes responde **500** en vez de **400** (usa `Error` genérico, no `ValidationError`) — verificado por ejecución HTTP real | Defecto (contradice el patrón ya establecido en `/profiles/*`) |
| 14.1 | INFORMACIONAL | `epistemic_status` (`observed/derived/estimated/projected/inferred/scenario`) catalogado en `knowledge/intelligence/intelligence-types.json` pero nunca persistido ni usado en ningún punto de `backend/` | Ausencia (diseñado, no implementado) |
| 22.1 | INFORMACIONAL / privacidad | Narrativa `mode='ai'` de un informe `personalized` enviaría `profile.markets/products/inputs/priorities/constraints` a un proveedor de IA externo (opt-in, requiere API key) — no documentado explícitamente antes | Observación |
| 25.1 | BAJO | `GET /reports` no soporta filtro por `status` ni paginación | Ausencia |

## 29. Decisiones congeladas

1. **Informes NO recalcula ninguna capa de inteligencia** — reusa `intelligenceForSignal`/`decisionsAndRecommendations`/`getChanges`/`buildRadar` tal cual, siempre.
2. **7 tipos de informe ya existen y están disponibles para 2E-1**: `sectorial`, `market`, `risk`, `opportunity`, `personalized`, `executive`, `periodic` — 2E-1 puede diseñar UI para los 7 sin necesitar backend nuevo.
3. **Narrativa es una capa separada y opcional** — un informe es completo y presentable con su `body` de claims estructurados sin narrativa alguna; la narrativa (determinística o IA) es un enriquecimiento posterior, nunca un requisito.
4. **Modo IA de narrativa es estrictamente opt-in y aislado** — nunca se invoca automáticamente, nunca tiene acceso a datos más allá del reporte ya cerrado, y siempre pasa por `narrative/validator.js` antes de aceptarse.
5. **Trazabilidad de Informes es más profunda que la de Radar** — llega hasta `capture`/`source` real, con endpoint dedicado.
6. **El GAP de error 500-en-vez-de-400 (§28, 21.1) no se corrige en 2E-0** — queda documentado para que 2E-2 (implementación) decida si el frontend debe tratarlo defensivamente (p. ej. nunca enviar un `type` inválido, controlado por el propio frontend) o si amerita una corrección backend mínima en una etapa posterior explícitamente autorizada para tocar backend.
7. **Los 6 GAPs heredados de perfil/situación/radar (12.1–12.6) y los 7 de Radar (17.2–17.8) permanecen sin corregir**, con su impacto sobre Informes matizado en §27.

## 30. Criterio de cierre 2E-0

Puede responderse con precisión: un Informe es un documento estructurado (`claims` + `body` por secciones), generado a demanda a partir de datos ya procesados por el motor central (nunca recalculados), en 7 variantes reales, con evidencia/confianza/incertidumbre explícitas, trazabilidad completa hasta la fuente, versionado y reproducibilidad garantizados, y una capa de narrativa opcional que nunca compromete la integridad del contenido subyacente (validada siempre, con o sin IA). Lo que falta: los GAPs heredados ya conocidos (sin corregir), un código de error más preciso para validaciones de `POST /reports/generate` (defecto nuevo, documentado, no bloqueante), y — por supuesto — toda la interfaz de usuario, que es exactamente el objeto de 2E-1/2E-2.
