# contrato-situacion

> Contrato técnico para la futura pantalla **Situación / Dashboard**. Producto de una auditoría (Paso 2C-0) — no implementa la pantalla, no agrega endpoints, no modifica ninguna capa de inteligencia. Toda afirmación fue verificada por lectura directa de código real y, donde correspondía, por ejecución real (fixtures existentes) — nunca inferida de documentación (los documentos de `docs/metodologia/` y `docs/producto/vision.md`/`funcionalidades.md` están vacíos — "Documento en construcción" — y no se usaron como fuente).

---

## 1. Propósito

Definir, antes de escribir una sola línea de UI, exactamente qué información real puede alimentar la pantalla que responde "¿qué está pasando?" — y qué información todavía no existe, para no inventarla al construirla.

## 2. Alcance

Esta etapa es de **auditoría y congelación de contrato**, no de implementación. No se creó ningún endpoint nuevo, no se tocó `knowledge/`, no se modificó ninguna capa de inteligencia/relevancia/decisión/recomendación/perfil. El resultado es este documento.

## 3. Entidades utilizadas — y su lugar en la cadena epistémica

`DATO → CAMBIO → SEÑAL → RELEVANCIA → INTELIGENCIA → DECISIÓN → RECOMENDACIÓN`, más `SITUACIÓN` (agregación temporal del Radar, no un eslabón nuevo de la cadena) y `INFORME` (síntesis derivada, nunca fuente).

| Entidad | Tabla / origen | Es… | Nunca debe presentarse como… |
|---|---|---|---|
| Captura | `captures` | DATO (crudo, normalizado) | inteligencia |
| Cambio | `changes` | CAMBIO (diferencia entre 2 capturas) | una interpretación |
| Señal | `signals` | SEÑAL (cambio que cruzó un umbral/regla) | un hecho de mercado en sí mismo |
| `relevance_results` | — | RELEVANCIA (¿a quién le importa y cuánto?) | prioridad ni confianza |
| `intelligence` | — | INTELIGENCIA (riesgo/oportunidad/impacto interpretado) | una recomendación |
| `radar_situations` | — | SITUACIÓN (agregación de ≥2 unidades de inteligencia relacionadas, con estado temporal) | una tendencia confirmada |
| `decisions` | — | DECISIÓN (alternativas evaluadas, nunca una elegida) | una recomendación |
| `recommendations` | — | RECOMENDACIÓN (texto regulado por evidencia) | una orden |
| `reports`/`report_narratives` | — | SÍNTESIS derivada de lo anterior | una fuente nueva de inteligencia |

## 4. Inventario real de información disponible

| Elemento | Existe | Fuente actual (código) | Endpoint existente | Relación con perfil | Puede mostrarse ahora |
|---|---|---|---|---|---|
| **cambios** | Sí, pero solo cualitativos (`direction`) hacia el consumidor personalizado — el valor concreto (`previous_value`/`new_value`) vive en `changes` y **no se proyecta** hasta `getChanges()` | `changes` (tabla) → `signals` → `core/profile/personalize.js#getChanges()` | `GET /profiles/:id/changes`, incluido en `GET /profiles/:id/radar` | Sí — filtrado por actividades del perfil | Sí (dirección/tema/fecha), **no** con el valor antes→después (ver GAP funcional §12.1) |
| **señales** | Sí, completas | `signals` | igual que arriba (siempre dentro de `changes`, nunca sueltas) | Sí | Sí |
| **relevancia** | Sí — central y personalizada, dos capas separadas verificadas | `relevance_results` + `core/profile/personalize.js` | `GET /profiles/:id/relevance`, incluida en `/changes` y `/radar` | Sí, es la esencia de la personalización | Sí |
| **inteligencia** | Sí — riesgo/oportunidad/impacto con `evidence_level`+`confidence` (4 dimensiones separadas, verificado en código) | `intelligence` | incluida en `/changes` y `/radar` (nunca suelta) | Sí | Sí |
| **riesgos** | Sí | `radar.risks` (filtro de `changes` por `intelligence.type==='risk'`) | `GET /profiles/:id/radar?view=risks` | Sí | Sí |
| **oportunidades** | Sí | `radar.opportunities` | `GET /profiles/:id/radar?view=opportunities` | Sí | Sí |
| **decisiones** | Sí — siempre con alternativa `no_action`, nunca `best_option` (verificado en `decision/decision.js`) | `decisions`, anidada en `intelligence.decisions` dentro de `/changes` | incluida en `/changes`/`/radar` | Sí | Sí |
| **recomendaciones** | Sí — con `strength`/`priority`/`evidence_level`/vigencia | `recommendations` | `GET /profiles/:id/recommendations`, `radar?view=recommendations` | Sí (solo `status='active'`, histórico vía `recommendation_history` en `/changes`) | Sí |
| **situaciones** (agregación temporal) | Sí — `emerging/active/persistent/resolved`, tendencia (≥3 observaciones o `insufficient_evidence`, nunca fabricada) | `radar_situations` + `radar/{situations,trend}.js` | `GET /profiles/:id/radar?view=situations` | Sí | Sí |
| **informes** | Sí — 7 tipos, versionados, con narrativa opcional | `reports`/`report_narratives` | `GET /reports?profile_id=:id`, `GET /reports/:id` | Sí (`profile_id` en `reports`) | Sí (como *lista de informes recientes*, no recalculado en vivo) |
| **indicadores** | Parcial — "indicador" es contexto de adquisición (`context.indicator` al disparar el pipeline), **no una entidad persistida ni consultable por sí sola** | contexto de `runPipeline()`, no una tabla | ninguno | Indirecta (vía `signal.topic_id`) | No como entidad propia — solo implícito dentro de una señal |
| **mercados** | Sí, como dos cosas distintas: dimensión del perfil (`profile_markets`) y filtro de informe (`reports/markets`, `filterByMarket`) — **no existe una "vista de mercado" en vivo fuera de generar un informe** | `profile_markets`, `reports/markets/index.js` | perfil: incluido en `GET /profiles/:id`; informe: `POST /reports/generate {type:'markets',...}` | Sí (bump de relevancia por coincidencia de mercado, ya verificado en Paso 2B-0) | Sí como dimensión del perfil; no como panel de mercado en vivo sin generar un informe |

## 5. Endpoints existentes reutilizables

| Método | Ruta | Params/Query | Body | Respuesta | Depende de perfil | Depende de actividad | Depende de tiempo | Reusa vs. recalcula | Externo/IA |
|---|---|---|---|---|---|---|---|---|---|
| GET | `/profiles/:id/changes` | — | — | `{profile_id, no_relevant_changes, reason?, count?, changes: [...]}` (forma completa: `activity_id, is_primary_activity, personalized_relevance, priority_match, relevance_factor/reason, signal, intelligence[]`) | Sí, obligatoria | Implícita (todas las del perfil) | Sí (`signal.detected_at`, orden por recencia como último criterio) | 100% reusa `relevance_results`/`intelligence`/`decisions`/`recommendations` ya generados — 0 cálculo nuevo | 0/0 |
| GET | `/profiles/:id/relevance` | — | — | `{profile_id, results: [{activity_id, is_primary_activity, factor, base_level, level, bumps}]}` | Sí | Implícita | No (sin timestamp propio, ver §13) | Reusa | 0/0 |
| GET | `/profiles/:id/radar` | `?view={all\|changes\|situations\|risks\|opportunities\|monitor\|recommendations}` | — | Objeto agregado completo (ver ejemplo real §7) o el subconjunto pedido | Sí | Implícita | Sí (ventanas dependientes de `FREQUENCY_MS` real de cada fuente) | Reusa `getChanges()` + agrega estado temporal (`radar_situations`) — 0 señales/intelligence nuevas | 0/0 |
| GET | `/profiles/:id/intelligence` | — | — | `{profile_id, intelligence: [...]}` (subconjunto de `/changes`) | Sí | Implícita | Sí (heredado del cambio) | Reusa | 0/0 |
| GET | `/profiles/:id/recommendations` | — | — | `{profile_id, recommendations: [...]}` (solo `status='active'`) | Sí | Implícita | Sí (`valid_from`) | Reusa | 0/0 |
| GET | `/profiles/:id` | — | — | Perfil completo (identificación + 6 colecciones) — ver `contrato-perfil.md` | Sí (es el perfil) | — | `created_at`/`updated_at` | — | 0/0 |
| GET | `/reports?profile_id=:id&type=` | query | — | `{reports: [{id, type, title, profile_id, status, version, created_at}]}` | Opcional | Vía `scope` del informe | `created_at`, `version` | Reusa (nunca recalcula al listar) | 0/0 |
| GET | `/reports/:id` | — | — | Informe completo + `claims` + `sources` + `snapshot` | Vía `profile_id` del informe | Vía `scope` | `cutoff_at`/`period_start`/`period_end` | Reusa (nunca recalcula al leer) | 0/0 |
| GET | `/reports/:id/traceability` | — | — | Cadena `claim → señal → cambio → captura → fuente` | Indirecta | Indirecta | — | Reusa (sigue referencias, no copia) | 0/0 |
| GET | `/profile/catalogs` | — | — | Catálogos (Paso 2A) | No | No | No | Reusa `knowledge/` | 0/0 |

**Todos reutilizables directamente, ninguno requiere modificación para un primer Dashboard.** Ninguno realiza llamadas externas ni invoca `services/ai`/`services/search` (verificado: `radar/*.js`, `core/profile/personalize.js` y las rutas de `/profiles/:id/*` no importan esos módulos — grep de imports, no supuesto).

## 6. Personalización — cómo se aplica hoy

`RELEVANCIA CENTRAL (relevance_results, sin conocer perfiles) + CONTEXTO DEL PERFIL (core/profile/personalize.js, en el momento de la consulta) = RELEVANCIA PERSONALIZADA`. Verificado en `personalize.js`:

- **Actividad principal/secundarias**: determinan qué `activity_id` filtra `relevance_results` (`getChanges()`); `is_primary_activity` se calcula en el momento de la consulta (nunca en el pipeline central — corrección quirúrgica ya documentada en `backend/README.md`).
- **Mercados**: producen un `bump` de un nivel si `source.markets` (de `knowledge/sources.json`) intersecta `profile.markets` (`market_match`).
- **Productos/insumos**: producen un `bump` de un nivel si el `ramification_id` de origen de la señal coincide exactamente con uno declarado (`declared_interest_match`).
- **Prioridades**: **nunca** alteran el nivel de relevancia — solo producen `priority_match` (booleano) usado como criterio de *orden*, no de nivel (verificado en `getChanges()` y en `radar/prioritize.js`).
- **Restricciones**: **no se leen en ningún punto de `personalize.js` ni de `radar/*.js`** — hoy no afectan ni el cálculo de relevancia ni la priorización del Radar. Esto es una omisión real, documentada como GAP funcional (§12.2), no un diseño deliberado explícito en el código (no hay comentario que lo justifique, a diferencia de las prioridades).

Ningún cálculo de relevancia se duplicaría en frontend — el futuro Dashboard debe **consumir** `personalized_relevance`/`priority_match` ya resueltos, nunca recalcularlos.

## 7. "¿Qué cambió para mí?" — auditoría específica

1. Cambios reales existen (`changes`/`signals`), verificado con ejecución real (fixtures `soja-precio.t1/t2.json`).
2. Se identifican por umbral/regla ya aplicada aguas arriba (`signal_type='cambio-significativo'`, etc.) — el Dashboard no re-detecta nada.
3. Relación con señales: 1:1 explícita (`getChanges()` siempre parte de una señal).
4. Relevancia: la personalizada, ya resuelta (§6).
5. Relación con perfil: total — el endpoint ya filtra por las actividades del perfil.
6. Información temporal: `signal.detected_at` existe; **el valor concreto del cambio (`changes.previous_value`/`new_value`) no llega hasta aquí** (§12.1).
7. Endpoint reutilizable: **sí, `GET /profiles/:id/changes` (o `/radar?view=changes`) ya responde exactamente esta pregunta**, verificado con ejecución real:

```json
// GET /profiles/:id/changes — primer item real (perfil con main_activity_id=cultivo-soja,
// tras 2 corridas del pipeline con fixtures reales de precio de soja)
{
  "activity_id": "cultivo-soja",
  "is_primary_activity": true,
  "personalized_relevance": { "base_level": "low", "level": "low", "bumps": [] },
  "priority_match": false,
  "signal": {
    "id": "1b9153ef-...", "signal_type": "cambio-significativo", "topic_id": "precios",
    "direction": "increase", "detected_at": "2026-09-12T18:51:03.047Z",
    "source_id": "fao-giews-amis", "monitor_id": "fao-giews-amis::principal", "status": "detected"
  },
  "intelligence": [{ "type": "opportunity", "evidence_level": "structural_relationship",
    "confidence": { "source_quality": "very_high", "change_detection_confidence": "high", "relevance_confidence": "high", "analysis_confidence": "medium" },
    "decisions": [ /* 1 decisión, con alternativa no_action + recomendación */ ] }]
}
```

8. **No se requiere un endpoint nuevo** para la función conceptual "¿qué cambió para mí?" — existe y funciona. Sí falta el detalle cuantitativo (§12.1) para una versión más rica.

## 8. Situación — qué preguntas responde hoy `GET /profiles/:id/radar`

| Pregunta | Respondida por | Estado |
|---|---|---|
| ¿Qué está pasando? | `radar.situations` + `radar.changes` | Sí |
| ¿Qué cambió? | `radar.changes` (cualitativo) | Parcial (§12.1) |
| ¿Qué es relevante para mi actividad? | `personalized_relevance` en cada item | Sí |
| ¿Existe algún riesgo relevante? | `radar.risks` | Sí |
| ¿Existe alguna oportunidad relevante? | `radar.opportunities` | Sí |
| ¿Hay algo que debería observar especialmente? | `radar.monitor` | Sí |

**Hallazgo central de esta auditoría**: una sola llamada (`GET /profiles/:id/radar`) ya cubre 5 de las 6 preguntas que definen la sección "Situación" — no hace falta construir ni proponer un agregador nuevo, el Radar ya lo es.

## 9. Priorización — conceptos distinguidos (verificado, no supuesto)

| Concepto | Existe como dimensión separada | Dónde |
|---|---|---|
| Relevancia | Sí | `personalized_relevance.level` |
| Prioridad (de una recomendación) | Sí | `recommendation.priority` |
| Confianza | Sí, 4 sub-dimensiones (`source_quality`, `change_detection_confidence`, `relevance_confidence`, `analysis_confidence`) | `intelligence.confidence` |
| Riesgo/severidad | Sí, vía `intelligence.type='risk'` + `evidence_level`, nunca un número | `intelligence` |
| Actualidad/recencia | Sí, criterio de desempate final, nunca primero | `radar/prioritize.js#compareForPriority` (6 criterios documentados, sin score) |
| Importancia | **No existe como campo propio** — se usa el importance de `report_claims` (motor de Reportes), no del Radar | `report_claims.importance` únicamente |

**Confirmado por lectura de `radar/prioritize.js`**: no hay un score numérico combinado en ningún punto — el orden es una secuencia explícita de 6 comparaciones (relevancia → tipo → prioridad de recomendación → persistencia → confianza → recencia). El futuro Dashboard debe reusar exactamente este orden ya resuelto por el backend (los items de `radar.situations` ya llegan ordenados) — nunca reordenar con un criterio propio en frontend.

## 10. Datos temporales

| Entidad | Fecha propia | Comparación anterior disponible |
|---|---|---|
| `captures` | `captured_at` | vía `changes.previous_capture_id` |
| `changes` | `detected_at` | `previous_value`/`new_value` en la propia fila (no propagados aguas abajo, §12.1) |
| `signals` | `detected_at` | ninguna — cada señal es un evento puntual |
| `relevance_results` | **ninguna propia** — se infiere por join a `signals.detected_at` | — |
| `intelligence` | `created_at` | ninguna |
| `recommendations` | `valid_from`/`valid_until`, `previous_version_id` (cadena completa) | Sí — historial completo vía `recommendation_history` |
| `radar_situations` | `first_seen_at`, `last_seen_at`, `observation_count` | Sí — es la única entidad diseñada explícitamente para observar evolución a través de corridas |
| `reports` | `created_at`, `period_start`/`period_end`, `version`, `previous_version_id` | Sí — tipo `periodic` compara 2 períodos explícitamente, versionado completo |

**Tendencia**: solo puede afirmarse cuando `radar/trend.js` la confirma (≥3 observaciones consecutivas sin reversión, misma regla de `knowledge/signals/rules.json`) — verificado que nunca se fabrica con menos evidencia. **Comparación de período general** (para todo el Dashboard, no un indicador puntual): sigue sin existir fuera del tipo de informe `periodic` (parámetros explícitos requeridos) — mismo GAP ya documentado en `docs/producto/arquitectura-funcional-ux.md` §11.2, reafirmado aquí, no resuelto.

## 11. Procedencia / evidencia / confianza / límites

Cada unidad de `intelligence` trae `evidence_level` (`structural_relationship` es el único valor que este motor produce hoy — verificado, `strong/moderate/limited/insufficient/conflicting` son posibles en el vocabulario de conocimiento pero el cálculo actual de `intelligence.js` siempre asigna `structural_relationship`) y `confidence` (4 sub-dimensiones). Los **límites reales de esta versión**: el motor de inteligencia no distingue evidencia "fuerte" de "estructural" en la práctica (todo llega igual) — el Dashboard no debe presentar una falsa granularidad que el backend no produce todavía.

## 12. GAPs detectados

### 12.1 GAP FUNCIONAL — valor concreto del cambio no se propaga

`changes.previous_value`/`new_value`/`field` existen en la base pero ni `getChanges()` ni `reports/claims.js` (que ya usa `magnitude_pct: null` a propósito, verificado) los exponen. Impacto: el Dashboard puede decir "el precio de la soja aumentó" pero no "de U$S X a U$S Y". **Propuesta, no implementada**: extender `signal` dentro de `getChanges()`/`radar` con `{ change_id, field, previous_value, new_value }` leído de `changes` por `signal.change_id` — aditivo, no rompe nada existente, no requiere nueva tabla.

### 12.2 GAP FUNCIONAL — restricciones del perfil no influyen en relevancia ni en el Radar

`profile_constraints` se guarda y se expone, pero ningún cálculo (`personalize.js`, `radar/*.js`) lo lee. A diferencia de las prioridades (cuya no-influencia en relevancia está documentada como decisión deliberada), aquí no hay evidencia de que sea intencional. No se corrige en esta etapa — queda como candidato a revisión de diseño.

### 12.3 GAP INFORMATIVO — "indicador" no es una entidad consultable

Es contexto de adquisición, no una fila persistida con identidad propia — un futuro Dashboard no puede listar "todos los indicadores monitoreados" sin recorrer `signals`/`monitors` indirectamente.

### 12.4 GAP INFORMATIVO — sin "vista de mercado" en vivo

Existe el filtro de informe (`reports type=markets`) pero no una consulta liviana equivalente a `/profiles/:id/radar` para un mercado. No se propone crearla ahora — no hay evidencia de que el Dashboard de esta etapa la necesite (los mercados ya personalizan relevancia vía `market_match`).

### 12.5 Mejora futura — comparación de período general

Reafirmación del GAP ya documentado en `arquitectura-funcional-ux.md` §11.2 (sin comparación automática "vs. semana pasada" a nivel de todo el perfil). No crítico: `radar_situations.first_seen_at`/`observation_count` ya permiten mostrar antigüedad/persistencia sin ser estrictamente una comparación de período.

Ningún GAP es **crítico** para congelar este contrato — los 5 son documentados, ninguno bloquea que `GET /profiles/:id/radar` sea la base de datos real de un primer Dashboard funcional.

## 13. Endpoints nuevos propuestos

**Ninguno estrictamente necesario para una primera versión.** Se propone, para una etapa posterior, una **extensión aditiva** (no un endpoint nuevo) del §12.1:

| Campo | Detalle |
|---|---|
| Dónde | `core/profile/personalize.js#getChanges()` (y por herencia, `radar/build.js`) |
| Cambio propuesto | Agregar `signal.change: {id, field, previous_value, new_value}` (join a `changes` por `signal.change_id`) |
| Fuente de datos | Ya existente, `changes` table — 0 cálculo nuevo |
| Reusa procesamiento existente | Sí, 100% |
| Requiere modificación backend | Sí, mínima (una columna más seleccionada + un join) |
| Requiere tests | Sí, si se implementa — no en esta etapa |
| Reglas de relevancia/ordenamiento afectadas | Ninguna — es un campo adicional, no cambia semántica existente |

No implementado en esta etapa, por mandato explícito.

## 14. Estados de UI (contrato, no implementación)

| Estado | Cómo se distingue hoy en el backend |
|---|---|
| Sin perfil | Frontend aún no tiene `profile_id` guardado — no llama a `/radar` (ver `contrato-perfil.md` §9) |
| Perfil recién creado, sin actividades | `getChanges()`/`buildRadar()` devuelven `no_relevant_changes:true, reason:'el perfil no tiene actividades declaradas'` |
| Sin información relevante (con actividades) | `no_relevant_changes:true, reason:'no hay cambios centrales relacionados con las actividades del perfil'` — **reason distinto del caso anterior, ya diferenciable** |
| Información disponible | `no_relevant_changes:false`, con `changes`/`situations`/etc. poblados |
| Error de servidor | 500 `{error: 'internal_error', message}` (router genérico) |
| Error de red | Responsabilidad exclusiva del cliente (no hay nada que auditar en backend) |
| Perfil inexistente | 404 `{error:'profile_not_found'}` (verificado, mismo patrón que `contrato-perfil.md`) |
| Datos insuficientes ≠ ausencia de riesgo | `radar.risks`/`radar.opportunities` simplemente no listan nada — el Dashboard no debe interpretar una lista vacía de riesgos como "confirmado sin riesgo", sino como "sin riesgo detectado con la evidencia actual" (matiz ya presente en la redacción de `SectionPlaceholder`/`StatusMessage` del Paso 1) |
| Información en actualización | **No existe hoy** — ningún endpoint de perfil expone un estado "recalculando". `pipeline_runs.status` existe pero no está ligado a la vista de un perfil específico. GAP informativo, sin propuesta (no hay evidencia de que se necesite: el pipeline corre por fuera de la consulta del usuario, nunca de forma síncrona a su request) |

## 15. Costo esperado

Un Dashboard mínimo necesita **una sola llamada**: `GET /profiles/:id/radar` (trae changes+situations+risks+opportunities+monitor+recommendations en un solo request). Opcionalmente una segunda, `GET /reports?profile_id=:id&type=` para un widget de "informes recientes". Ninguna de las dos dispara procesamiento nuevo, señales nuevas, captura, IA ni búsqueda externa — 100% lectura de lo ya calculado por el pipeline. No se requiere polling ni actualización automática (coherente con la restricción explícita de esta etapa).

## 16. Trazabilidad

La cadena `perfil → relevancia → inteligencia → señal → cambio → captura → recurso → fuente` ya existe y es recorrible — verificada en el Motor de Reportes (`reports/store.js#getTraceability`), reutilizable sin cambios: cualquier `signal_id`/`intelligence_id` que llegue al Dashboard puede resolverse hasta la fuente pasando por un informe que lo incluya, sin crear una segunda cadena en frontend. Para decisión→recomendación, la misma cadena aplica (`decision.triggered_by_intelligence_id`, `recommendation.decision_id`, ambos ya expuestos en `getChanges()`).
