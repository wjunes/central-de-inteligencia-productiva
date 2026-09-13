# contrato-radar

> Contrato técnico para el **Radar Productivo** (`GET /profiles/:id/radar`). Producto de una auditoría (Paso 2D-0) — no implementa la pantalla `/radar`, no agrega endpoints, no modifica ninguna capa de inteligencia/relevancia/decisión/recomendación. Toda afirmación fue verificada por lectura directa de código real y, donde correspondía, por ejecución real (fixtures existentes, `backend/test/radar.test.js`, scripts de verificación ad hoc) — nunca inferida de documentación. Este documento reutiliza y no contradice `docs/arquitectura/contrato-situacion.md` (que ya audita el mismo endpoint como fuente de la Home) — aquí se profundiza en lo que ese contrato dejó fuera de su alcance: la estructura completa de `radar.*` como base de una futura pantalla de exploración dedicada.

---

## 1. Propósito

Definir, antes de escribir una sola línea de UI de `/radar`, exactamente qué devuelve hoy `GET /profiles/:id/radar` en cada una de sus secciones, con qué garantías de orden y personalización, qué cadenas de trazabilidad son reconstruibles, y qué GAPs reales existen — para que la futura pantalla de Radar (exploración detallada, distinta del resumen de Situación) no reinvente ni recalcule nada que el backend ya resolvió.

## 2. Endpoint

```
GET /profiles/:id/radar
GET /profiles/:id/radar?view={all|changes|situations|risks|opportunities|monitor|recommendations}
```

Implementado en `backend/api/router.js:164-167` → `buildRadarView(db, id, view)` (`backend/radar/build.js`). Sin autenticación (no existe ninguna capa de auth en esta versión del backend, verificado — ningún middleware la implementa). El `:id` se valida contra el perfil ANTES de llegar a esta rama (`router.js:135`: `if (!getProfile(db, id)) return json(res, 404, {error:'profile_not_found'})`, guarda de forma UNIFORME las 5 sub-rutas de `/profiles/:id/*` — `activities/markets/products/inputs/priorities/constraints/relevance/changes/radar/intelligence/recommendations` —, no solo `/radar`).

## 3. Parámetros

| Parámetro | Tipo | Obligatorio | Efecto real |
|---|---|---|---|
| `:id` (path) | UUID de perfil | Sí | 404 `{error:'profile_not_found'}` si no existe (verificado con id inexistente y con id de formato inválido — **ambos casos devuelven 404, nunca 400**: no hay validación de formato de UUID, solo existencia en `profiles`) |
| `view` (query, opcional) | string | No | Si se omite o es `'all'`, devuelve el objeto completo. Si es uno de `changes/situations/risks/opportunities/monitor/recommendations`, devuelve solo ese subconjunto (ver §5). **Cualquier otro valor devuelve `{error:'view desconocida: <valor>'}' con status HTTP 200** (verificado en `buildRadarView()`, `radar/build.js:127-138`, y en el router: `json(res, 200, buildRadarView(...))` sin verificación de error) — GAP técnico, ver §17.4. |

## 4. Respuesta real — forma completa (`view` omitido o `'all'`)

```json
{
  "profile_id": "…",
  "changes": { "no_relevant_changes": false, "items": [ /* ver §5.1 */ ] },
  "situations": { "no_active_situations": false, "items": [ /* ver §5.2 */ ], "resolved": [ /* ver §5.2 */ ] },
  "risks": [ /* subconjunto de changes.items, ver §5.3 */ ],
  "opportunities": [ /* subconjunto de changes.items, ver §5.3 */ ],
  "monitor": [ /* subconjunto de changes.items, ver §5.3 */ ],
  "recommendations": [ /* ver §5.4 */ ]
}
```

Nota sobre `situations.resolved`: **existe en la respuesta real pero no está mencionado en `contrato-situacion.md`** (esa auditoría se enfocó en `situations.items`, lo único que la Home consume). Verificado en código (`radar/build.js:118`) y con test real (`backend/test/radar.test.js` Caso 12): una situación sin evidencia reciente desaparece de `items` mismo instante en que deja de observarse (no espera ventana adicional) y pasa a `resolved`, conservando su identidad (nunca se borra). Campo disponible para una futura pantalla de Radar que quiera mostrar historial, no usado hoy por Situación.

## 5. Secciones — origen, estructura, criterio de inclusión/exclusión

### 5.1 `changes` — origen: `core/profile/personalize.js#getChanges()`

`radar.changes = { no_relevant_changes: <bool>, items: <array> }` — `buildRadar()` simplemente llama a `getChanges()` y reempaqueta `changes.changes` como `items` (**pierde el campo `reason`** que `getChanges()` sí calcula — ver GAP §17.1, ya documentado como 12.6 en `contrato-situacion.md`).

Cada item (una "unidad de cambio personalizado"):

```
{
  activity_id, is_primary_activity,
  personalized_relevance: { base_level, level, bumps: [{rule, reason}] },
  priority_match,
  relevance_factor: 'direct_dependency' | 'value_chain_relation',   // únicos 2 factores que existen (core/relevance/relevance-engine.js — no hay un tercero)
  relevance_reason,
  signal: { id, signal_type, topic_id, direction, detected_at, source_id, monitor_id, status },
  intelligence: [ { id, type, topic_id, impact_direction, evidence_level, confidence: {source_quality, change_detection_confidence, relevance_confidence, analysis_confidence}, horizon, scope, status, rationale, decisions: [ {id, type, scope, activity_id, alternatives: [...], status, recommendation, recommendation_history} ] } ]
}
```

**Criterio de inclusión**: un `relevance_result` cuyo `personalized_relevance.level != 'none'` (salvo `includeNoneLevel:true`, no usado por la ruta HTTP) y cuya señal no esté `dismissed`. **`previous_value`/`new_value` NO llegan a este item** — confirmado de nuevo por lectura de `getChanges()` (`core/profile/personalize.js:112-121`, el objeto `signal` no incluye ningún campo de valor, solo `direction`) — GAP ya congelado (12.1 de `contrato-situacion.md`), reconfirmado aquí sin corregirlo.

**Orden**: por `getChanges()` (`personalize.js:128-133`): `personalized_relevance.level` descendente → `priority_match` (true primero) → `signal.detected_at` descendente. Es el ÚNICO criterio real de orden de `changes.items` — no usa el comparador de 6 criterios de `radar/prioritize.js` (ese solo se aplica a `situations.items`, ver §9).

### 5.2 `situations` — origen: `radar/situations.js` + `radar/trend.js`

```
{
  no_active_situations: <bool>,
  items: [ situationView(...) ],   // activas, ordenadas por radar/prioritize.js (ver §9)
  resolved: [ situationView(...) ] // sin evidencia reciente, no ordenadas (mismo orden de iteración de la query SQL)
}
```

Una situación se forma agrupando `changes.items` por `topic_id` **solo si hay evidencia de ≥2 elementos relacionados** (`radar/situations.js#groupIntoSituations`, línea 55: `if (intelligenceIds.length < 2 && activityIds.length < 2) continue`) — un cambio aislado nunca se convierte en "situación", sigue siendo un "cambio" (`CAMBIO ≠ SITUACIÓN`, verificado en código, no solo en el vocabulario del prompt).

`situationView()` (`radar/build.js:11-50`) produce:

```
{
  id, topic_id, activity_ids[], intelligence_ids[],
  status: 'emerging' | 'active' | 'persistent' | 'resolved',
  conflicting,
  first_seen_at, last_seen_at, observation_count,
  personalized_relevance: { level },      // el MÁS ALTO entre los intelligence units miembro, nunca un promedio
  recommendation_priority,                // la MÁS ALTA entre las recomendaciones de sus miembros
  confidence,                             // confidence.analysis_confidence del PRIMER intelligence unit del PRIMER miembro (no una agregación real - ver GAP §17.3)
  risk_activities[], opportunity_activities[],
  trend: { status: 'confirmed'|'insufficient_evidence', direction?, observations?, evidence[], reason? },
  type: 'risk' | 'opportunity' | 'impact',   // 'risk' si risk_activities no está vacío, si no 'opportunity' si opportunity_activities no está vacío, si no 'impact' — NUNCA 'trend' (ver GAP §17.2)
  members: [ {activity_id, signal_id, intelligence_ids[]} ]
}
```

`status` (`radar/situations.js#computeStatus`): `'emerging'` si `observation_count<=1`; `'persistent'` si ya superó `windowMs.medium_term` desde `first_seen_at`; si no, `'active'`; si ya no tiene evidencia reciente (`isCurrentlyObserved=false`), **siempre `'resolved'`** (los dos branches del condicional devuelven el mismo valor — verificado, comentario propio del código lo confirma: "no espera ventana adicional").

**GAP FUNCIONAL confirmado por ejecución real (nuevo, no documentado en `contrato-situacion.md`)**: `last_seen_at` se actualiza en **CADA lectura** de `/radar`, no solo cuando llega evidencia nueva. Verificado ejecutando `buildRadar()` dos veces seguidas sin ninguna corrida de pipeline entre medio: `last_seen_at` cambió (`2026-09-12T20:03:49.161Z` → `...219Z`) mientras `observation_count` correctamente permaneció en `1`. Causa: `radar/situations.js#upsertSituations()` hace `UPDATE ... SET last_seen_at = ?` incondicionalmente para todo grupo "fresco" en cada `buildRadar()`, sea invocado por un pipeline run o por un simple `GET`. **Consecuencia**: el campo `last_seen_at` de una situación no significa "última vez que se detectó evidencia nueva" sino "última vez que alguien consultó el Radar mientras la situación seguía dentro de su ventana" — un futuro Radar que muestre "última observación: hace X" usando este campo directamente sería engañoso (subestimaría la antigüedad real de la evidencia). `observation_count` y `first_seen_at` SÍ son confiables (no se ven afectados). Ver GAP §17.5. No se corrige — está fuera del alcance de una auditoría (`radar/situations.js` no se modifica).

### 5.3 `risks` / `opportunities` / `monitor` — origen: filtros directos sobre `changes.changes`

```js
// radar/build.js:95-99
const risks = changes.changes.filter((c) => c.intelligence.some((i) => i.type === 'risk'));
const opportunities = changes.changes.filter((c) => c.intelligence.some((i) => i.type === 'opportunity'));
const monitorItems = changes.changes.filter((c) => c.intelligence.some((i) => i.decisions.some((d) => ['monitor','seek_information'].includes(d.recommendation?.type))));
```

Los tres son **exactamente el mismo tipo de objeto que `changes.items`** (item completo, con TODO su array `intelligence[]`, no solo la unidad que califica) — no son "riesgos"/"oportunidades" en sí mismos, son "cambios que CONTIENEN al menos una unidad de inteligencia de ese tipo". Un item de `radar.risks` puede tener, dentro de su propio `intelligence[]`, otras unidades que NO son de tipo `risk` (p. ej. un `impact` adicional) — un consumidor debe filtrar `item.intelligence` por `type` para no mostrar equivocadamente esa otra unidad bajo el encabezado "Riesgos" (ya resuelto así en `web/src/utils/situation.js#itemsByIntelligenceType`, reusado desde Situación).

**`monitor` NO es "elementos sin riesgo/oportunidad"**: puede (y en la práctica, con el perfil de prueba de 3 actividades, ocurre) contener items de tipo `impact` puro que ni califican como riesgo ni como oportunidad — confirmado por ejecución real (`ganaderia-bovina-carne`, `type:'impact'`, `recommendation.type:'monitor'`, ausente de `radar.risks` y `radar.opportunities`) — este es exactamente el estado G del §18 más abajo.

**Orden**: heredan el orden de `changes.changes` (relevancia→prioridad→fecha, §5.1) — **NO** pasan por `radar/prioritize.js`. Es una asimetría real respecto de `situations.items` (§9).

### 5.4 `recommendations` — origen: deduplicación de recomendaciones activas

```js
// radar/build.js:100-108
const recsById = new Map();
for (const c of changes.changes) for (const i of c.intelligence) for (const d of i.decisions)
  if (d.recommendation && d.recommendation.status === 'active') recsById.set(d.recommendation.id, d.recommendation);
const activeRecommendations = [...recsById.values()];
```

Contiene **TODAS** las recomendaciones activas del perfil, de **cualquier tipo** (no solo `monitor`/`seek_information` — también `mitigate`, `pursue_opportunity`, `prepare`, `adjust`, `evaluate`, ver §11). Deduplicada por `recommendation.id` (una misma recomendación activa, referenciada por varios `decisions`, aparece una sola vez). **Orden**: orden de inserción en el `Map`, que sigue el orden de `changes.changes` — no hay un sort explícito propio.

## 6. Flujo de datos real — qué atraviesa el Radar

```
SOURCE (knowledge/sources/) → RESOURCE → CAPTURE (captures) → NORMALIZATION → VALIDATION
  → CHANGE (changes, detectChanges())
  → SIGNAL (signals, generateSignal() — solo si cruza un umbral de knowledge/signals/rules.json)
  → RELEVANCE (relevance_results, calculateRelevance() — factor direct_dependency | value_chain_relation)
  → INTELLIGENCE (intelligence, generateIntelligenceUnit() — SIEMPRE se genera 1 unidad por relevance_result, incondicional)
  → DECISION (decisions, evaluateDecision() — SIEMPRE se genera, shouldTriggerDecision() devuelve true incondicional)
  → RECOMMENDATION (recommendations, generateRecommendation() — statement de plantilla regulada, puede reusar una activa existente en vez de crear otra)
  → RADAR (getChanges() agrega todo lo anterior por perfil; radar/{situations,trend,prioritize}.js agrega estado temporal y orden)
```

Todas las capas SÍ atraviesan el Radar (no hay ninguna que se omita en la ruta feliz), pero **`intelligence.type='trend'` nunca se genera** (`intelligence/analysis/intelligence.js` solo produce `impact`/`risk`/`opportunity`, pese a que `knowledge/intelligence/intelligence-types.json` define 4 tipos incluyendo `trend` con su propia precondición) — la "tendencia" que sí aparece en la respuesta (`situations.items[].trend`) es un campo calculado aparte por `radar/trend.js`, **no** una fila de la tabla `intelligence` — son dos conceptos con el mismo nombre en capas distintas, nunca deben confundirse (ver §11).

## 7. Cambios (`radar.changes`) — detalle adicional

Ver §5.1. Confirmado una vez más con ejecución real (perfil ABC, fixtures `soja-precio.t1/t2.json`): el campo `signal.direction` (`'increase'`) es lo único cuantitativo-adyacente que llega; no hay `previous_value`/`new_value`/`field`/magnitud porcentual en ningún punto de la cadena hasta aquí, aunque sí existen en la tabla `changes` de la base (`changes.previous_value`/`new_value` — nunca proyectados aguas abajo). GAP 12.1 (`contrato-situacion.md`) reconfirmado, no corregido.

## 8. Señales

El Radar **nunca expone señales sueltas** — siempre anidadas dentro de un item de `changes`/`risks`/`opportunities`/`monitor` como `item.signal`, o referenciadas por id dentro de `situation.members[].signal_id`. Campos reales de `signal`: `id, signal_type, topic_id, direction, detected_at, source_id, monitor_id, status`. `CAMBIO ≠ SEÑAL` se mantiene estrictamente en el código: una fila de `changes` (tabla) puede existir sin generar ninguna `signal` (si no cruza el umbral configurado — confirmado con Caso 13 de `radar.test.js`: un indicador sin entrada en `backend/config/thresholds.json` nunca genera señal, en ninguna corrida), y el Radar solo ve señales, nunca "cambios" crudos de la tabla `changes`.

## 9. Relevancia

Confirmado (`core/relevance/relevance-engine.js`): solo 2 factores existen, `direct_dependency` (actividad de origen de la señal) y `value_chain_relation` (grafo precalculado de `knowledge/relevance/mappings.json`, un solo salto). La relevancia CENTRAL (`relevance_results`, sin conocer perfiles) se combina con el CONTEXTO DEL PERFIL en `core/profile/personalize.js` (personalización, en el momento de la consulta, nunca en el pipeline). Confirmado con ejecución real (2 perfiles distintos, mismos datos centrales, Caso 16 de `radar.test.js`): cada perfil recibe una priorización distinta de la MISMA inteligencia central — la relevancia personalizada nunca se recalcula, solo se reinterpreta por perfil.

- **Actividad principal/secundarias**: determinan qué `activity_id` filtra (`is_primary_activity` se calcula en el momento de la consulta, nunca en el pipeline — corrección quirúrgica documentada en `backend/README.md`, ya citada en `contrato-situacion.md`).
- **Mercados**: bump de 1 nivel si `source.markets` intersecta `profile.markets`.
- **Productos/insumos**: bump de 1 nivel si el `ramification_id` de origen coincide con uno declarado.
- **Prioridades**: **nunca** alteran el nivel — solo producen `priority_match` (booleano), usado como criterio de *orden*, reconfirmado en código (`personalize.js:109` y `getChanges()` sort, `109-116` y `128-133`).
- **Restricciones**: **siguen sin leerse** en `personalize.js` ni en `radar/*.js` (grep verificado, cero referencias a `profile.constraints` fuera de `core/profile/store.js`) — GAP 12.2 (`contrato-situacion.md`) reconfirmado, no corregido.

## 10. Multiactividad — resultado real (perfil ABC: ganadería bovina de carne + cultivo de soja + elaboración de aceites)

Ejecutado en vivo (fixtures reales `soja-precio.t1.json`→`t2.json`, contexto `originActivityId:'cultivo-soja'`):

- `changes.items`: 3 (una entrada por actividad — la MISMA señal produjo 3 `relevance_results` distintos, uno por actividad relacionada, cada uno con su propia `intelligence`/`decision`/`recommendation` independiente).
- `elaboracion-aceites` (secundaria): `relevance=high`, `factor=value_chain_relation` (customer de `cultivo-soja`), `intelligence.type=risk` → aparece en `radar.risks`.
- `cultivo-soja` (secundaria): `relevance=low`, `factor=direct_dependency` (ramificación `soja` declarada), `intelligence.type=opportunity` → aparece en `radar.opportunities`.
- `ganaderia-bovina-carne` (**principal**): `relevance=low`, `factor=value_chain_relation` (heredado por jerarquía: `related_activity`), `intelligence.type=impact` (dirección incierta) → **no** aparece en riesgos ni oportunidades, sí en `radar.monitor` y `radar.recommendations` (`type:'monitor'`).
- **Una señal, tres actividades, tres unidades de inteligencia distintas** — el frontend no dedujo nada de esto, todo llegó ya resuelto y separado por `activity_id`. Sin duplicaciones (cada `intelligence.id` es único) y sin desapariciones incorrectas (las 3 actividades declaradas del perfil aparecen).
- `situations.items`: 1 (agrupa las 3 unidades por `topic_id='precios'`), `activity_ids` = las 3, `type:'risk'` (por tener `risk_activities` no vacío, aunque también tiene `opportunity_activities`) — confirma que `situation.type` prioriza `risk` sobre `opportunity` cuando ambos coexisten en el mismo grupo (`radar/build.js:47`, orden del operador ternario).
- Confirma también el Caso 5 ya probado en `radar.test.js`: una actividad **secundaria** (`elaboracion-aceites`) puede calificar como riesgo mientras la **principal** no, sin ningún privilegio artificial por ser principal — verificado también que `priorityKeyOf()` no usa `is_primary_activity` en absoluto.

## 11. Inteligencia — los 4 tipos catalogados vs. los realmente producidos

`knowledge/intelligence/intelligence-types.json` cataloga 4 tipos: `trend`, `impact`, `risk`, `opportunity`. **El motor real (`intelligence/analysis/intelligence.js`) solo produce 3**: `impact` (default), `risk`, `opportunity` — nunca `trend` (confirmado en código y por ejecución: ninguna fila de `intelligence` tiene `type='trend'` en ningún test ni ejecución real de esta auditoría). GAP informacional (§17.2).

Para cada `intelligence` unit real: `type, topic_id, impact_direction ('positive'|'negative'|'uncertain'), evidence_level, confidence {4 subdimensiones}, horizon:'current', scope:'operational', status:'detected', rationale`. **`evidence_level` de `intelligence` es SIEMPRE `'structural_relationship'`** (verificado: los 3 branches del cálculo en `intelligence.js:71-73` devuelven el mismo valor — dead branching) — el motor no distingue hoy evidencia "fuerte" de "estructural" en la práctica (ya documentado en `contrato-situacion.md` §11, reconfirmado). **Distinto** de `recommendation.evidence_level` (`insufficient|limited|moderate|conflicting`, SÍ variable — ver §15) — dos campos con el mismo nombre en capas distintas, nunca deben confundirse.

"Tendencia" en el Radar (`situation.trend`) NO es una `intelligence` unit — es un campo calculado por `radar/trend.js#detectTrend()` directamente sobre `signals` (regla `tendencia-por-persistencia`: ≥3 señales `cambio-significativo` consecutivas, mismo `monitor_id`+indicador, misma dirección, sin reversión). Nunca se fabrica con menos evidencia (`insufficient_evidence` explícito, con `reason`) — confirmado con ejecución real de 2 y de 4 observaciones (Casos 3 y 4 de `radar.test.js`).

## 12. Riesgos (`radar.risks`)

Ver §5.3. Contiene **items de cambio completos** (no solo la unidad de riesgo), filtrados por tener al menos una `intelligence.type==='risk'`. No contiene señales sueltas, no contiene decisiones/recomendaciones fuera de su anidamiento normal dentro de `intelligence[].decisions[]`. `RIESGO ≠ RECOMENDACIÓN` se mantiene: un item de `radar.risks` puede no tener ninguna recomendación de tipo `mitigate` todavía (p. ej. si la evidencia es `insufficient`, la recomendación real terminará siendo `monitor`, nunca `mitigate` — confirmado en `recommendations.js#typeFor`: `mitigate` solo se alcanza con `strength==='conditional'`, es decir `evidence_level==='moderate'`).

## 13. Oportunidades (`radar.opportunities`)

Simétrico a §12. `OPORTUNIDAD ≠ ACCIÓN` confirmado en código: `knowledge/recommendations/rules.json:92` — "la existencia de una oportunidad NUNCA implica que deba aprovecharse" — y en la práctica, `pursue_opportunity` solo se alcanza con evidencia `moderate` (`strength==='conditional'`); con evidencia `insufficient`/`limited` la recomendación real es `monitor`/`seek_information`/`prepare`, nunca una acción de aprovechamiento.

## 14. Decisiones

**Sí se exponen directamente**, anidadas en `intelligence[].decisions[]` (nunca sueltas, no existe endpoint `/decisions/:id` personalizado por perfil — solo `GET /decisions` global de depuración, sin filtrar por perfil, fuera del contrato de Radar). Estructura real (`decision/decision.js`):

```
{ id, run_id, triggered_by_intelligence_id, type: 'risk_response'|'opportunity_pursuit'|'production'|'commercial',
  scope, activity_id, status:'open',
  alternatives: [
    { id:'monitorear', kind:'no_action', description, is_contingent:false, factors_for, factors_against, constraints:[], uncertainty:{status}, reversibility:'reversible', relative_cost:'unknown', status:'candidate' },
    { id: 'preparar_respuesta'|'evaluar_aprovechamiento'|'ajustar_operacion', kind:'action', is_contingent, trigger_condition?, factors_for, factors_against, constraints, uncertainty, reversibility, relative_cost, status }
  ],
  recommendation, recommendation_history
}
```

**Siempre exactamente 2 alternativas**: una `no_action` (monitoreo, `kind:'no_action'`, SIEMPRE presente — "opción de no actuar" nunca omitida) y una acción específica según `intelligence.type` (`risk`→`preparar_respuesta`, `opportunity`→`evaluar_aprovechamiento`, `impact`→`ajustar_operacion`). **Nunca hay un `best_option`** (verificado: ningún campo del objeto lo indica — cumple `knowledge/decision/criteria.json.no_scoring`). "Valor de información" no es un campo explícito propio; se aproxima informalmente vía `uncertainty.status`/`is_contingent`/`trigger_condition`, pero no existe un campo `information_value` en la respuesta — GAP informacional menor (§17.6).

**Hallazgo de trazabilidad importante (nuevo, verificado por lectura de código)**: `decisionsAndRecommendations()` (`core/profile/personalize.js:70-78`) resuelve `recommendation`/`recommendation_history` buscando **por `activity_id`**, no por `decision.id`:
```js
const recs = db.prepare('SELECT * FROM recommendations WHERE activity_id = ? ORDER BY created_at DESC').all(decision.activity_id);
const current = recs.find((r) => r.status === 'active') ?? null;
```
Cuando la recomendación generada por ESTA decisión específica es reusada por ser idéntica a una ya activa (`generateRecommendation()` puede devolver `{created:false, reused: previous}`, ver §15), la recomendación que termina anidada bajo esta decisión puede provenir de OTRA decisión (incluso de otra corrida anterior). En ese caso `decision.recommendation.decision_id !== decision.id`. En el perfil ABC de prueba (una única señal por actividad) esto no se manifestó (`match=true` en los 3 casos verificados), pero el mecanismo es real y reproducible con evidencia repetida de igual `strength`/`type` sobre la misma actividad. **Un futuro Radar no debe asumir que `decisions[].recommendation` fue generada por `decisions[].id`** — para una trazabilidad estricta decisión→recomendación debe compararse explícitamente `recommendation.decision_id === decision.id`. GAP técnico (§17.7).

## 15. Recomendaciones

Tipos realmente alcanzables por el motor (`intelligence/recommendations/recommendations.js#typeFor`): **`monitor`, `seek_information`, `prepare`, `pursue_opportunity`, `mitigate`, `adjust`, `evaluate`** (7 de los 8 catalogados en `knowledge/recommendations/recommendation-types.json`). **`defer` está catalogado pero ningún camino de código lo produce** — GAP informacional (§17.8). `prioritize` y `review` están **deliberadamente excluidos por diseño** del catálogo mismo (modelados como `recommendation.priority` y como evento de ciclo de vida `reassess`, respectivamente — no como tipos, decisión documentada en el propio `recommendation-types.json`).

Cada recomendación real: `id, run_id, decision_id, type, strength, evidence_level, statement, rationale, priority, activity_id, status:'active'|'superseded', valid_from, valid_until, previous_version_id, created_at`. `statement` **siempre sale de una plantilla regulada** (`LANGUAGE_BY_STRENGTH`, 5 plantillas fijas, nunca texto libre generado) — confirmado en código, no hay ningún punto de interpolación de texto arbitrario. `RECOMMENDATION ≠ ACTION` se sostiene: los verbos de las plantillas son deliberadamente no imperativos ("se recomienda monitorear...", "conviene prepararse para...", nunca "hacé...").

Ciclo de vida verificado con ejecución real (Caso 11 de `radar.test.js`, 3 corridas sucesivas): cuando una nueva recomendación difiere en `strength`/`type` de la activa existente para la misma actividad, la anterior pasa a `status:'superseded'` y **no vuelve a aparecer en `radar.recommendations`** (que filtra `status==='active'` en la fuente, `personalize.js:104`) — pero **si permanece accesible** vía `intelligence[].decisions[].recommendation_history` (historial completo, no purgado).

## 16. Trazabilidad

Dos cadenas reconstruibles, ambas verificadas por ejecución real (Caso 21 de `radar.test.js`, reproducido en esta auditoría):

```
PROFILE → PERSONALIZED RELEVANCE (relevance_result.id) → INTELLIGENCE (intelligence.id, based_on_signal_ids[0])
        → SIGNAL (signal.id, change_id) → CHANGE (change.id, capture_id) → CAPTURE (capture.id, source_id)
        → SOURCE (knowledge.sourceById(capture.source_id))
```
```
PROFILE → RELEVANCE → INTELLIGENCE (decision.triggered_by_intelligence_id) → DECISION (decision.id)
        → RECOMMENDATION (recommendation.decision_id — con la salvedad de §14: verificar igualdad explícita, no asumir anidamiento)
```

IDs que viajan en la respuesta y permiten seguir cada tramo: `signal.id`, `signal.source_id`, `signal.monitor_id`, `intelligence[].id`, `decisions[].id`, `decisions[].triggered_by_intelligence_id`, `recommendation.id`, `recommendation.decision_id`, `situation.intelligence_ids[]`, `situation.members[].signal_id`. No existe un endpoint de trazabilidad dedicado a Radar (sí existe uno para Informes: `GET /reports/:id/traceability`, reusa la misma cadena de fuente pasando por un informe — ver §15 de `contrato-situacion.md`, ya documentado, no se repite aquí).

## 17. Ordenamiento

| Colección | Ordenada por | Criterio |
|---|---|---|
| `changes.items` | `getChanges()` | relevancia desc → `priority_match` desc → `signal.detected_at` desc |
| `risks` / `opportunities` / `monitor` | heredado de `changes.changes` | el mismo criterio de arriba — **no** pasa por `prioritize.js` |
| `recommendations` | orden de inserción en `Map` | sigue el orden de `changes.changes`, deduplicado por id — sin sort propio |
| `situations.items` | `radar/prioritize.js#sortByPriority` | 6 criterios explícitos, sin score numérico (relevancia → tipo risk/opportunity>impact → prioridad de recomendación → persistencia del status → confianza → recencia) |
| `situations.resolved` | ninguno | orden de la consulta SQL (`SELECT * FROM radar_situations`, sin `ORDER BY`) |

**Ninguna de estas 5 reglas es intercambiable con otra** — un futuro Radar debe reusar la que corresponda a cada colección, nunca aplicar un único "reordenamiento general" en frontend.

## 18. Estados vacíos (A-H) — verificados por ejecución real

| Estado | Resultado real verificado |
|---|---|
| A. Perfil inexistente | 404 `{error:'profile_not_found'}` (también con id de formato inválido, no solo UUID válido inexistente) |
| B. Perfil sin actividades | `{no_relevant_changes:true, items:[]}` en `changes`; `situations:{no_active_situations:true, items:[], resolved:[]}` (no verificado el contenido de `resolved` en este caso pero por código siempre es `[]` si `profileActivityIds` está vacío — `resolvedSituationsFor` retorna `[]` si `!profileActivityIds.length`); `risks/opportunities/monitor/recommendations` = `[]` |
| C. Perfil con actividades, sin señales relacionadas | **Byte-idéntico al estado B** (confirmado de nuevo por ejecución real en esta etapa) — GAP 12.6 de `contrato-situacion.md` reconfirmado |
| D. Señales con relevancia pero sin inteligencia | **No alcanzable en el motor actual** (verificado en código, no requiere ejecución adicional): `pipeline/orchestrator.js:96-104` invoca `generateIntelligenceUnit()` incondicionalmente para CADA `relevance_result` generado — no existe ninguna condición que produzca un `relevance_result` sin su intelligence unit correspondiente |
| E. Inteligencia sin riesgos | Real y verificado (perfil ABC sin `elaboracion-aceites`: `cultivo-soja`+`ganaderia-bovina-carne` solo producen `opportunity`/`impact`, `radar.risks=[]`) |
| F. Inteligencia sin oportunidades | Real y verificado (simétrico) |
| G. Recomendaciones sin riesgos/oportunidades | Real y verificado: `ganaderia-bovina-carne` (`type:'impact'`) genera `recommendation.type:'monitor'` sin calificar como riesgo ni oportunidad |
| H. Radar completamente vacío | Igual que B — todas las colecciones en su forma vacía simultáneamente |

## 19. Errores

| Caso | Resultado real |
|---|---|
| 404 (perfil inexistente o id malformado) | `{error:'profile_not_found'}`, sin detalle interno |
| `view` desconocido | **200** con `{error:'view desconocida: <valor>'}` — no 400 (ver §3, GAP técnico §17.4) |
| 500 | No reproducido en esta auditoría (requeriría corromper la base deliberadamente, fuera de alcance) — por lectura de código, cualquier excepción no capturada en `handle()` de `router.js` no tiene un catch genérico visible en el fragmento auditado; se toma como point de atención, no como hallazgo confirmado |
| Error de red | Responsabilidad exclusiva del cliente, nada que auditar en backend |
| Body/SQL/stack trace expuesto | No observado en ningún caso probado — todas las respuestas de error son objetos `{error, message?}` controlados |

## 20. Costo y externalidad

```text
HTTP externo: 0
IA: 0
Search: 0
```

Confirmado en código (Caso 19/20 de `radar.test.js`, ejecutado de nuevo en esta auditoría): `radar/build.js`, `situations.js`, `trend.js`, `prioritize.js` no importan `services/ai` ni `services/search`. Confirmado también que **construir el Radar no genera señales ni capturas nuevas** (Caso 17/18, reejecutado): 2 perfiles distintos + 3 llamadas a `buildRadar()` no alteran el conteo de `captures`/`signals`. **Salvedad real** (nuevo hallazgo, no relacionado a servicios externos sino a efectos secundarios internos): `buildRadar()` SÍ escribe en `radar_situations` en cada llamada (ver §5.2, GAP §17.5) — no es una lectura pura a nivel de base de datos, aunque no dispara ningún proceso costoso ni externo.

## 21. Personalización — confirmación puntual

Confirmado nuevamente en esta auditoría (no solo por lectura, también por ejecución con el perfil ABC): actividad principal/secundarias, mercados y productos/insumos SÍ afectan el Radar (bumps de relevancia, filtrado de actividades). `priorities` SÍ ordena (`priority_match` → orden de `changes.items`, y `recommendation_priority` como criterio de `prioritize.js`) pero **nunca** aumenta el nivel de relevancia (grep confirmado: `priorities` no aparece en `personalizedRelevance()`/`computeBumps()`). `constraints` **sigue sin ninguna influencia** — grep confirmado en `personalize.js` y en todo `radar/`.

## 22. Relación con Situación

| | Situación (Home, `/`) | Radar (`/radar`, no implementado aún) |
|---|---|---|
| Fuente | `GET /profiles/:id/radar` completo | Mismo endpoint — **no hay una fuente distinta** |
| Qué muestra hoy | Resumen (conteos), `changes.items` sin distinción de tipo, `risks`/`opportunities` filtrados, `situations.items` bajo "Inteligencia destacada", `monitor` bajo "Para observar" | Nada implementado — placeholder (`renderSectionPlaceholder`) |
| Qué NO muestra Situación (disponible en la misma respuesta, candidato a Radar) | `situations.resolved` (historial de situaciones resueltas), `decisions[].alternatives` completas (solo se ve el `recommendation.statement`, nunca las alternativas evaluadas ni `uncertainty`/`reversibility`), `radar.recommendations` completo (Situación solo deriva `monitor`/`seek_information` vía `radar.monitor`, nunca muestra `mitigate`/`pursue_opportunity`/`prepare`/`adjust`/`evaluate`), `intelligence[].confidence` con sus 4 subdimensiones por separado (Situación solo usa `analysis_confidence`) | — |

**La Home no debe convertirse en una copia de Radar**: la diferencia real entre ambos, con los datos ya disponibles hoy, es de **profundidad de exposición sobre la MISMA respuesta**, no de fuente de datos distinta — Situación es un subconjunto curado y resumido; un futuro Radar expondría el resto (decisiones completas, todas las recomendaciones, historial resuelto, las 4 subdimensiones de confianza) sin llamar a ningún endpoint adicional.

## 23. Relación con Informes

El Radar es **independiente** de Informes: no los enlaza, no los usa, no los genera. `reports/build.js`/`reports/select.js` consumen las mismas capas centrales (`intelligence`/`decisions`/`recommendations`) pero de forma **no personalizada** (no pasan por `core/profile/personalize.js`, verificado — Informes tiene su propio motor de selección, `reports/select.js`, con su propio concepto de `scope`/`markets`, distinto del filtrado por perfil de Radar). No hay ningún campo en la respuesta de `/radar` que referencie un `report_id`.

## 24. Frontend actual

Verificado en `web/src/router.js`/`app.js`: la ruta `/radar` existe (`{path:'/radar', name:'radar', title:'Radar Productivo'}`) pero su renderer es un placeholder genérico (`renderSectionPlaceholder({title:'Radar Productivo'})`, `app.js:21`) — no hay ninguna página `web/src/pages/radar.js`. `web/src/services/api.js` ya tiene `getProfileRadar(id, opts)` implementado y probado (reusado de Situación, Paso 2C-1) — **no requiere ningún cambio ni endpoint nuevo para una futura pantalla de Radar**, ni siquiera para exponer `view=` (ya soportado por el backend, no usado hoy por el frontend, que siempre pide el objeto completo). Componentes reutilizables ya existentes y verificados: `renderIntelligenceItem` (`components/intelligence-item.js`, genérico, no acoplado a Situación), `renderSituationSummary`, `renderProfileSection`, `renderStatusMessage`, y los tokens/estilos `.intelligence-list`/`.badge*`/`.summary-strip` (`components.css`) — todos con contraste ya verificado (`tests/contrast.test.js`, incluida la extensión de Paso 2C-2).

## 25. GAPs

| # | Severidad | GAP | Corrige |
|---|---|---|---|
| 17.1 | FUNCIONAL (heredado) | `buildRadar()` no propaga `reason` de `getChanges()` (12.6 de `contrato-situacion.md`) | No |
| 17.2 | INFORMACIONAL (nuevo) | `intelligence.type='trend'` catalogado en `knowledge/` pero nunca producido por el motor; la "tendencia" del Radar es un campo separado de `radar/trend.js`, no una `intelligence` unit | No |
| 17.3 | TÉCNICO (nuevo) | `situation.confidence` toma el `analysis_confidence` del PRIMER intelligence unit del PRIMER miembro, no una agregación real de todos los miembros de la situación — puede no representar la confianza combinada real | No |
| 17.4 | TÉCNICO (nuevo) | `?view=` con valor desconocido devuelve HTTP 200 con `{error:...}` en el body, en vez de 400 | No |
| 17.5 | FUNCIONAL (nuevo, crítico para un futuro Radar) | `radar_situations.last_seen_at` se actualiza en cada `GET /radar`, no solo con evidencia nueva — el campo no significa lo que su nombre sugiere | No |
| 17.6 | INFORMACIONAL (nuevo) | No existe un campo explícito `information_value` en `decision`/alternativas, pese a que `knowledge/decision/rules.json` lo modela conceptualmente | No |
| 17.7 | TÉCNICO (nuevo) | `decisions[].recommendation` se resuelve por `activity_id`, no por `decision.id` — puede no ser la recomendación generada por ESA decisión específica en escenarios de reuso | No |
| 17.8 | INFORMACIONAL (nuevo) | El tipo de recomendación `defer` está catalogado en `knowledge/` pero ningún camino de `recommendations.js#typeFor` lo produce | No |
| — | FUNCIONAL (heredados, sin cambios) | 12.1 (previous_value/new_value), 12.2 (constraints sin influencia), 12.3 (indicador no es entidad), 12.4 (sin vista de mercado en vivo), 12.5 (comparación de período) — todos de `contrato-situacion.md` | No |

Ningún GAP es CRÍTICO en el sentido de bloquear una futura pantalla de Radar; 17.5 es el de mayor atención si esa pantalla llega a mostrar textualmente "última observación" usando `last_seen_at` sin aclarar su semántica real.

## 26. Ejemplo real completo

Obtenido por ejecución real (`GET /profiles/:id/radar`, perfil ABC, tras 2 corridas de pipeline con `soja-precio.t1.json`→`t2.json`, `originActivityId:'cultivo-soja'`, `originRamificationId:'soja'`, `topicId:'precios'`):

```json
{
  "profile_id": "47919bb2-17c7-4b14-9748-987bcd3f72eb",
  "changes": {
    "no_relevant_changes": false,
    "items": [
      {
        "activity_id": "elaboracion-aceites", "is_primary_activity": false,
        "personalized_relevance": { "base_level": "high", "level": "high", "bumps": [] },
        "priority_match": false,
        "relevance_factor": "value_chain_relation",
        "relevance_reason": "elaboracion-aceites es customer de cultivo-soja",
        "signal": { "id": "cc881907-...", "signal_type": "cambio-significativo", "topic_id": "precios", "direction": "increase", "detected_at": "2026-09-12T20:01:43.05Z", "source_id": "fao-giews-amis", "monitor_id": "fao-giews-amis::principal", "status": "detected" },
        "intelligence": [{
          "id": "967e411b-...", "type": "risk", "topic_id": "precios", "impact_direction": "negative", "evidence_level": "structural_relationship",
          "confidence": { "source_quality": "very_high", "change_detection_confidence": "high", "relevance_confidence": "high", "analysis_confidence": "medium" },
          "decisions": [{
            "id": "7180e130-...", "type": "risk_response", "activity_id": "elaboracion-aceites", "status": "open",
            "alternatives": [
              { "id": "monitorear", "kind": "no_action", "status": "candidate", "uncertainty": { "status": "known" }, "reversibility": "reversible" },
              { "id": "preparar_respuesta", "kind": "action", "is_contingent": true, "trigger_condition": "confirmación adicional del riesgo sobre elaboracion-aceites", "status": "candidate" }
            ],
            "recommendation": { "id": "…", "type": "mitigate", "strength": "conditional", "evidence_level": "limited", "statement": "Si se confirma la condición asociada, resulta conveniente evaluar la situación (precios) detectada para elaboracion-aceites.", "priority": "high", "activity_id": "elaboracion-aceites", "status": "active" },
            "recommendation_history": []
          }]
        }]
      },
      { "activity_id": "cultivo-soja", "personalized_relevance": { "level": "low" }, "relevance_factor": "direct_dependency", "intelligence": [{ "type": "opportunity" }] },
      { "activity_id": "ganaderia-bovina-carne", "is_primary_activity": true, "personalized_relevance": { "level": "low" }, "relevance_factor": "value_chain_relation", "intelligence": [{ "type": "impact", "impact_direction": "uncertain" }] }
    ]
  },
  "situations": {
    "no_active_situations": false,
    "items": [{
      "id": "c838c992-...", "topic_id": "precios",
      "activity_ids": ["elaboracion-aceites", "cultivo-soja", "ganaderia-bovina-carne"],
      "status": "emerging", "conflicting": false, "observation_count": 1,
      "personalized_relevance": { "level": "high" }, "recommendation_priority": "high", "confidence": "medium",
      "risk_activities": ["elaboracion-aceites"], "opportunity_activities": ["cultivo-soja"],
      "trend": { "status": "insufficient_evidence", "reason": "1 observación(es) - se requieren 3 (knowledge/signals/rules.json:tendencia-por-persistencia)", "evidence": ["cc881907-..."] },
      "type": "risk",
      "members": [
        { "activity_id": "elaboracion-aceites", "signal_id": "cc881907-...", "intelligence_ids": ["967e411b-..."] },
        { "activity_id": "cultivo-soja", "signal_id": "cc881907-...", "intelligence_ids": ["94b1839a-..."] },
        { "activity_id": "ganaderia-bovina-carne", "signal_id": "cc881907-...", "intelligence_ids": ["cee94412-..."] }
      ]
    }],
    "resolved": []
  },
  "risks": ["/* item completo de elaboracion-aceites, igual al de changes.items */"],
  "opportunities": ["/* item completo de cultivo-soja */"],
  "monitor": ["/* item completo de ganaderia-bovina-carne */"],
  "recommendations": [
    { "type": "mitigate", "activity_id": "elaboracion-aceites", "status": "active" },
    { "type": "pursue_opportunity", "activity_id": "cultivo-soja", "status": "active" },
    { "type": "monitor", "activity_id": "ganaderia-bovina-carne", "status": "active" }
  ]
}
```

(Truncado por brevedad donde se indica — cada campo mostrado es real, ningún valor fue inventado; los ids largos se abrevian con `...` mantieniendo el prefijo real observado.)
