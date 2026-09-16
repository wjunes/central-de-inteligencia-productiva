# Arquitectura funcional y UX/UI — Decisiones y Recomendaciones (2F-1)

> Etapa de **diseño**, no de implementación. Ningún componente visual se construye en esta etapa. Referencia contractual obligatoria: `docs/arquitectura/contrato-decisiones-recomendaciones.md` (2F-0) — toda decisión de este documento cita el campo/regla real que la sustenta. Hermano de `docs/producto/arquitectura-funcional-ux.md` (Paso 1) y de los diseños ya congelados `docs/producto/arquitectura-radar-ux.md` (2D-1) y `docs/producto/arquitectura-informes-ux.md` (2E-1) — **no los reemplaza ni los repite**: Decisiones y Recomendaciones ya estaban diseñadas ahí como capa anidada dentro de Cambios/Claims (§7-11/§21 de `arquitectura-radar-ux.md`; §11/§18-20/§28-29 de `arquitectura-informes-ux.md`). Este documento **consolida, verifica contra el contrato 2F-0 y refina** esa capa específicamente — sobre todo el lenguaje de la relación decisión→recomendación (GAP 17.7) — para que quede como referencia única y autosuficiente.
>
> **Nota sobre el estado real del código** (relevante para las secciones 15/16): a la fecha de este documento, `web/src/pages/radar.js`, `web/src/pages/informes.js` y todos los componentes que los acompañaban (`decision-detail.js`, `evidence-panel.js`, `recommendation-item.js`, `activity-badge.js`, `traceability-panel.js`, `change-item.js`, `situation-card.js`, `radar-filter.js`, `narrative-section.js`, `report-*.js`) **no existen en el repositorio** — `/radar` y `/informes` son placeholders (`renderSectionPlaceholder`). Solo existen hoy: `intelligence-item.js`, `situation-summary.js`, `status-message.js`, `profile-section.js`, `section-placeholder.js` (los componentes de Situación/Home, Paso 2C-1/2C-2). Este documento diseña sobre el contrato y sobre el diseño ya congelado de Radar/Informes, no sobre código que exista hoy — su implementación (2F-2 y, en paralelo o después, la reimplementación de Radar/Informes) partirá de estos componentes base más los nuevos aquí especificados.

---

## 1. Objetivo

Definir cómo el usuario comprende y utiliza la cadena `INTELIGENCIA → DECISIÓN → RECOMENDACIÓN VIGENTE → EVIDENCIA → FUENTE`, como capa progresiva dentro de `/radar` y `/informes` (nunca como rutas propias), sin inventar ninguna capacidad que `contrato-decisiones-recomendaciones.md` no confirme.

## 2. Principios UX

1. **Decisiones y Recomendaciones no son una pantalla — son una profundidad de exposición** sobre datos que Radar e Informes ya muestran en su nivel superior (cambio/claim). No se crea `/decisiones` ni `/recomendaciones`.
2. **El lenguaje respeta exactamente la fuerza de la relación garantizada por el backend** (§11 de este documento) — nunca se afirma más vínculo del que el dato permite comprobar.
3. **`no_action` es una alternativa de primera clase**, nunca un vacío ni un error.
4. **El `statement` se muestra verbatim.** La interfaz clasifica y contextualiza, nunca reescribe ni intensifica.
5. **Ningún score, ranking, porcentaje o "mejor opción" inventado** — el backend no los produce (`contrato-decisiones-recomendaciones.md` §2/§10).
6. **El usuario decide; el sistema informa.** Ninguna recomendación se presenta como orden ejecutada.
7. **Cero llamadas nuevas.** Todo dato de esta capa ya viaja en `GET /profiles/:id/radar` (Radar/Situación) o en el `body`/`claims` ya cargado de un informe (Informes) — expandir decisión/recomendación/evidencia básica es siempre 0 peticiones adicionales; solo la trazabilidad completa es lazy (ya así en ambos diseños previos).

## 3. Lugar dentro de la navegación

Sin cambios respecto de lo ya congelado: navegación principal de 5 ítems (`/`, `/radar`, `/informes`, `/perfil`, `/configuracion`, `arquitectura-funcional-ux.md` §2.1). Decisión y Recomendación aparecen:

- Dentro de **`/radar`**: anidadas en cada `change-item` expandido (nunca sección global "Decisiones"), más la sección plana **Recomendaciones** ya definida en `arquitectura-radar-ux.md` §4/§9 (única sección de nivel superior, porque el contrato expone `radar.recommendations` como array propio con valor de exploración independiente).
- Dentro de **`/informes`**: como secciones "Decisiones consideradas" y "Recomendaciones" de la plantilla estándar (`arquitectura-informes-ux.md` §11), presentes en 6 de los 7 tipos de informe (no en `periodic`, que no pasa por `intelligence`/`decisions`, `contrato-decisiones-recomendaciones.md` implícito vía contrato-informes §16).

No se crean nuevas rutas ni niveles de navegación.

## 4. Modelo de experiencia (progresión)

```
¿Qué está pasando?              → Inteligencia   (badge tipo/dirección, ya en intelligence-item)
¿Por qué merece atención?       → Evidencia + relevancia (evidence_level, confidence, personalized_relevance)
¿Qué alternativas considera?    → Decisión        (no_action + acción, expandida bajo demanda)
¿Qué recomienda actualmente?    → Recomendación vigente (statement verbatim + badges de tipo/evidencia/prioridad)
¿Con qué fundamento?            → Evidencia (nivel 1, ya incluida) → Trazabilidad (nivel 2/3, lazy)
¿Qué debería hacer el usuario?  → El propio statement, sin reinterpretación
```

Progresiva, nunca simultánea: el resumen (tipo + relevancia + statement) es lo primero visible; alternativas/incertidumbre/reversibilidad/evidencia completa se revelan al expandir.

## 5. Decisiones

Modelo real (`contrato-decisiones-recomendaciones.md` §2): `id, type, activity_id, status:'open'` (constante — sin ciclo de vida propio, ver §9 estado B), `alternatives[]` (siempre 2). La UI muestra, por decisión:

- `type` traducido a lenguaje llano (tabla §6).
- Actividad (`activity_id`, vía el patrón de identificación de actividad — ver §16, ya que `activity-badge` como componente independiente no existe hoy).
- Las 2 alternativas completas (§6).
- Vínculo con su recomendación vigente, con el lenguaje exacto de §11.

**No se muestra**: `best_option`, score, probabilidad, `information_value` explícito (no existe como campo — GAP 17.6, heredado).

## 6. Alternativas y `no_action`

Cada decisión siempre trae `no_action` (`id:'monitorear'`) primero, y una alternativa accional (`preparar_respuesta` / `evaluar_aprovechamiento` / `ajustar_operacion` según `intelligence.type`). Presentación:

| Campo real | Tratamiento UX |
|---|---|
| `kind: 'no_action'` | Etiqueta **"No actuar / mantener monitoreo"** — nunca "sin recomendación" ni error (§9 Estado C). Primera alternativa siempre visible, nunca colapsada por defecto de forma que parezca ausente. |
| `kind: 'action'` | Etiqueta según `id` (`preparar_respuesta`→"Prepararse", `evaluar_aprovechamiento`→"Evaluar aprovechamiento", `ajustar_operacion`→"Ajustar operación") |
| `is_contingent` + `trigger_condition` | Si `true`, mostrar la condición textual tal cual (`trigger_condition`) — nunca simplificarla a "condicional" sin contexto |
| `factors_for[]` / `factors_against[]` | Dos listas cortas, sin fusionar, sin puntuar |
| `constraints[]` | Mostradas como categorías (`data_availability`/`resource`, `severity`) **con una aclaración explícita: son categorías generales del motor, no las restricciones específicas declaradas en el perfil del usuario** (§14, GAP 12.2 extendido) — nunca presentarlas como si reflejaran `profile.constraints` |
| `uncertainty.status` | Etiqueta llana (`known`→"Conocida", `inferred`→"Inferida", `estimated`→"Estimada", `unknown`→"Desconocida") |
| `reversibility` | Etiqueta llana (`reversible`/`unknown`) |
| `relative_cost: 'unknown'` | **No se muestra** — mostrar "costo: desconocido" en todos los casos (es siempre `'unknown'`, contrato) no aporta información, sería ruido visual constante |
| `status` (de la alternativa: `candidate`/`not_comparable`) | Sin badge propio en V1 — no es un dato con valor de exploración adicional una vez mostradas las dos alternativas completas |

**Nunca**: resaltar una alternativa como "recomendada" dentro de la propia decisión — esa señal, cuando existe, la aporta la recomendación anidada (`recommendation.type`/`priority`), no un juicio nuevo de la interfaz sobre las alternativas.

## 7. Recomendaciones

Tipos realmente alcanzables (`contrato-decisiones-recomendaciones.md` §3, verificado en `recommendations.js#typeFor`): **`monitor`, `seek_information`, `prepare`, `pursue_opportunity`, `mitigate`, `adjust`, `evaluate`** — 7 de los 8 catalogados. `defer` está catalogado pero ningún camino de código lo produce.

> **Corrección respecto del enunciado de esta etapa**: la lista de tipos mencionada en el prompt de 2F-1 (`monitor, seek_information, prepare, evaluate, prioritize, mitigate, exploit, adjust`) no coincide exactamente con el motor real — no existen los tipos `prioritize` ni `exploit`; el tipo real para "aprovechar una oportunidad" es `pursue_opportunity`, y `prioritize` está deliberadamente modelado como el campo `recommendation.priority`, no como un `type` (`contrato-radar.md` §15, reconfirmado en 2F-0). Se usa aquí la lista verificada, no la del enunciado, para no diseñar sobre una capacidad inexistente.

| `type` real | Etiqueta de UI (neutra, no imperativa) |
|---|---|
| `monitor` | Monitorear |
| `seek_information` | Buscar información |
| `prepare` | Prepararse |
| `mitigate` | Mitigar |
| `pursue_opportunity` | Evaluar oportunidad |
| `adjust` | Ajustar |
| `evaluate` | Evaluar |
| *(cualquier valor no catalogado, incluido un futuro `defer`)* | se muestra el propio `type` sin traducir — mismo principio ya usado en `intelligence-item.js` para valores desconocidos |

El `type` interno se conserva siempre como atributo de datos (`data-type`/similar) para accesibilidad y estructura semántica, aunque el texto visible sea la etiqueta traducida.

Cada recomendación muestra: `statement` (verbatim), badge de tipo (tabla arriba), `priority`, `evidence_level` **propio de la recomendación** (`insufficient/limited/moderate/conflicting`, distinto del `evidence_level` de la inteligencia — ver §13), actividad, y estado vigente/histórico (§10).

## 8. `no_action`

Ver §6. Estado diferenciado explícitamente de "no existe decisión": una decisión con `no_action` como su única alternativa candidata visible (p. ej. cuando la acción específica tiene `status:'not_comparable'`, caso `impact` con `impact_direction:'uncertain'`) sigue siendo una **decisión real, con contenido real** — nunca se colapsa a un estado vacío. "No existe decisión" (inteligencia sin ninguna decisión asociada) es, según el contrato, **inalcanzable en el motor actual** (`shouldTriggerDecision()` siempre `true`) — no se diseña ese estado como alcanzable ni se simula.

## 9. Estados

| Estado | Alcanzable | Tratamiento UX |
|---|---|---|
| A. Decisión + recomendación | Sí | Caso general — ambas visibles, vínculo per §11 |
| B. Decisión sin recomendación | **No** — `generateRecommendation()` se invoca incondicionalmente tras cada decisión (`orchestrator.js:111`) | **No se diseña como estado alcanzable.** Si en el futuro el motor cambiara y esto se volviera posible, requeriría una decisión de diseño nueva — no se anticipa aquí un placeholder para un estado que hoy no puede ocurrir |
| C. `no_action` | Sí | §6/§8 — primera alternativa, siempre visible, nunca error |
| D. Información insuficiente | Sí (`evidence_level:'insufficient'`→ `strength:'none'`/`'monitoring_only'`) | El `statement` regulado ya lo dice ("No existe evidencia suficiente para recomendar una acción" o `monitoring_only`) — la UI no agrega un badge de alarma adicional, deja que el texto regulado hable |
| E. Evidencia contradictoria | Sí, pero **solo si el pipeline la declaró explícitamente** (`context.conflicting`) — no autodetectada | Badge "Evidencia contradictoria" + `statement` regulado tal cual — nunca oculta ni resuelve la contradicción |
| F. Recomendación activa | Sí | Badge "Vigente" (o ausencia de badge de histórico — la vigente es el estado por defecto, sin necesidad de marcarla siempre) |
| G. Recomendación superseded | Sí | Ver §10 — nunca mostrada como la recomendación actual sin aclaración |
| H. Error | Sí (de red/servidor) | Reusa `describeApiError()` ya existente |
| I. Perfil inexistente | Sí (404) | Reusa `isNotFoundError()` ya existente |
| J. Sin actividad / sin datos centrales | Sí, pero **indistinguibles entre sí** (GAP 12.6 heredado, byte-idéntico) | Un único mensaje honesto, igual que ya hace Situación — nunca afirmar cuál de los dos casos ocurrió |
| K. Multiactividad | Sí | §12 |

No se crea ningún estado adicional a estos — en particular no se simula "B" (inalcanzable).

## 10. Recomendación vigente vs. versión anterior

`status: 'active' | 'superseded'`, `previous_version_id` (`contrato-decisiones-recomendaciones.md` §3). Regla de presentación:

- La recomendación **activa** de una actividad es la que aparece por defecto — no requiere un badge "Vigente" explícito salvo cuando, en el mismo contexto visual, también se muestra una superseded (p. ej. dentro de `recommendation_history`), en cuyo caso ambas llevan badge (**"Vigente"** / **"Versión anterior"**) para evitar ambigüedad.
- Una superseded, cuando se muestra (accesible vía `intelligence[].decisions[].recommendation_history`, nunca vía `radar.recommendations` ni `/profiles/:id/recommendations`, que filtran solo activas), lleva SIEMPRE su badge de histórico — nunca se presenta sin distinguirla de la vigente.
- **No se diseña una comparación campo-a-campo** entre versiones — el backend no expone un diff; solo se muestra la cadena de estado/fecha (mismo criterio ya aplicado a versiones de Informes, `arquitectura-informes-ux.md` §21).

## 11. Relación decisión → recomendación (GAP 17.7) — terminología congelada

**Verificado en vivo en 2F-0**: `recommendation.decision_id` existe como campo, pero la resolución real (`decisionsAndRecommendations()`) es por `activity_id`. Reproducido con la secuencia estándar de fixtures: tras 2 evaluaciones consecutivas de igual `type`/`strength` sobre la misma actividad, la decisión visible en pantalla queda anidada a una recomendación **creada por una decisión anterior, ya no visible** (`decision.id !== recommendation.decision_id`).

**Regla congelada, aplicable en Radar e Informes por igual**:

```js
const directamenteVerificable = decision.id === recommendation.decision_id;
```

- Si `directamenteVerificable === true`: puede usarse lenguaje directo — **"Recomendación derivada de esta decisión"** o equivalente.
- Si `directamenteVerificable === false` (o no puede comprobarse porque la recomendación no viaja anidada a su decisión de origen, p. ej. en la sección plana de Recomendaciones): usar exclusivamente **"Recomendación vigente para esta actividad"** / **"Respuesta recomendada para esta situación"** / **"Recomendación relacionada"**.
- **Nunca**, en ningún caso ni contexto: *"El sistema decidió que…"*, *"Esta decisión generó esta recomendación"* sin haber verificado la igualdad de ids.

Esta regla **refina** (no contradice) lo ya especificado en `arquitectura-radar-ux.md` §9/§11 y `arquitectura-informes-ux.md` §18/§20, que optaban conservadoramente por "relacionada" siempre — 2F-0 confirma que la comprobación explícita de ids **sí es posible** con los datos ya disponibles en el payload (ambos ids viajan), así que se habilita el lenguaje directo únicamente en ese caso verificable, en vez de degradar siempre al lenguaje genérico. La comprobación es una comparación local de dos strings ya presentes en memoria — **0 llamadas adicionales**.

## 12. Multiactividad

`decision.activity_id`/`recommendation.activity_id` mantienen separación estricta, sin privilegio para la actividad principal (verificado en 2F-0 en vivo y por grep: `decision.js`/`recommendations.js` no referencian `is_primary_activity`). Tratamiento UX: igual criterio ya establecido en Radar/Informes — cada actividad se identifica con su propio badge, sin fusionar decisiones/recomendaciones de actividades distintas aunque compartan `signal_id`/`topic_id`, y sin ordenar "principal primero" de forma artificial (el orden ya viene del backend, ver `contrato-radar.md` §17).

## 13. Evidencia, confianza y relevancia — dimensiones separadas

Nunca combinadas en un único indicador ni en un porcentaje:

| Dimensión | Fuente | Dónde vive |
|---|---|---|
| `intelligence.evidence_level` | Siempre `'structural_relationship'` hoy (dead branching, `contrato-radar.md` §11) | En la unidad de inteligencia (ya resuelto en `intelligence-item.js`) |
| `recommendation.evidence_level` | `insufficient/limited/moderate/conflicting` — **sí variable** | En la recomendación — badge propio, distinto del anterior aunque comparta nombre |
| `intelligence.confidence` | 4 subdimensiones (`source_quality`, `change_detection_confidence`, `relevance_confidence`, `analysis_confidence`) | Mostradas por separado si se expande, nunca combinadas |
| `personalized_relevance.level` | del cambio/situación, no de la decisión/recomendación en sí | Badge separado, ya existente |
| `recommendation.priority` | `low/medium/high` | Badge propio de la recomendación |

Ninguna se presenta como "95% confiable" ni con estrellas/rankings — no existen esos valores en el contrato.

## 14. Restricciones del perfil — aclaración obligatoria

`alternatives[].constraints` son categorías fijas por `intel.type` (`data_availability`/`resource`), **no derivadas de `profile.constraints`** (extensión del GAP 12.2 verificada en 2F-0, específica del modelo de decisión). Si se muestran, deben ir acompañadas de un texto que evite la confusión — p. ej. "Consideración general del motor" en vez de dejarlas sin contexto, lo que induciría a pensar que reflejan las restricciones que el usuario declaró en su Perfil Productivo.

## 15. Evidencia y trazabilidad

Reutiliza el patrón de 3 niveles ya especificado:

```
Nivel 1 — Resumen de fundamento     (0 llamadas — ya en el payload: evidence_level, confidence, rationale)
Nivel 2 — Evidencia relevante        (0 llamadas — signal.id/source_id/monitor_id/detected_at, ya en el payload)
Nivel 3 — Trazabilidad completa      (lazy: en Radar, limitada a señal — sin endpoint dedicado, contrato §16
                                       de contrato-radar.md; en Informes, 1 llamada GET /reports/:id/traceability,
                                       cacheada por informe abierto — llega hasta capture/source real)
```

**Límite real que la UI debe respetar sin insinuar más**: en Radar, la cadena se detiene en `signal` — `change_id`/`capture_id` no viajan en el payload de `/radar` (existen en la base, pero no hay endpoint de trazabilidad propio para Radar). En Informes, sí se llega hasta la fuente real. No prometer "ver el documento original" desde Radar.

## 16. Componentes reutilizados

Existen hoy en `web/src/components/`: `intelligence-item.js`, `situation-summary.js`, `status-message.js`, `profile-section.js`. Ya soportan el nivel 1 de esta capa (`recommendationText`/`recommendationEvidenceLevel` en `intelligence-item.js`) pero **no** alternativas de decisión, ni badge de actividad independiente, ni evidencia/trazabilidad expandida — su extensión (no reescritura) es la base de la implementación futura.

De `arquitectura-radar-ux.md`/`arquitectura-informes-ux.md` (diseñados, no presentes en el código actual — ver nota inicial): el patrón `activity-badge` (identificación de actividad, hoy resuelta como texto plano dentro de `intelligence-item.js`) y las etiquetas centralizadas (`TYPE_LABEL`/`EVIDENCE_LABEL`/`CONFIDENCE_LABEL`/`RELEVANCE_LABEL`, hoy viven dentro de `intelligence-item.js`, candidatas a extraerse a un `utils/labels.js` compartido si más de un componente las necesita, tal como ya preveía `arquitectura-informes-ux.md` §28).

## 17. Componentes nuevos propuestos

| Componente | Responsabilidad | Reuso previsto |
|---|---|---|
| `decision-detail` | Presentar una decisión con sus 2 alternativas reales (§5/§6), sin score | Radar (`change-item` expandido) e Informes (claim `type=decision`) |
| `recommendation-item` | Presentar una recomendación con badge de tipo (§7), vigente/histórico (§10), vínculo per §11 | Radar (sección Recomendaciones + anidada) e Informes (claim `type=recommendation`) |
| `evidence-panel` | Niveles 1-2 de evidencia (§15), común a Radar/Informes | Radar e Informes (Informes extiende con nivel 3, ver `traceability-panel`) |
| `traceability-panel` | Nivel 3, exclusivo de Informes (llega a `capture`/`source`) | Solo Informes — Radar no tiene el endpoint que lo sustente |
| `activity-badge` | Identificación consistente de `activity_id`, reusable donde hoy `intelligence-item.js` solo usa texto plano | Radar, Informes, y opcionalmente refactor de `intelligence-item.js` |
| `decision-recommendation-link` | Encapsula exactamente la regla de §11 (comprobación de ids + texto resultante) — un solo lugar de la verdad para no duplicar la lógica de lenguaje en Radar e Informes | Radar e Informes |

No se crean todavía — **decisión de diseño, no implementación** (2F-1 no construye código). `recommendation-context`/`recommendation-status` del enunciado quedan cubiertos por `recommendation-item` (badge vigente/histórico + vínculo) sin necesidad de dos componentes separados — fragmentarlos no aportaría responsabilidad propia adicional.

## 18. Accesibilidad

- Jerarquía: decisión/recomendación nunca introducen un nivel de heading propio adicional — viven dentro del `<h2>`/`<h3>` de la sección que las contiene (Cambios en Radar, sección del informe).
- Expansión: `<details>/<summary>` nativos para alternativas/evidencia (mismo patrón ya definido en `arquitectura-radar-ux.md` §18) — `aria-expanded` correcto sin ARIA manual.
- Filtros de tipo de recomendación (si Radar los ofrece dentro de la sección Recomendaciones): botones reales con `aria-pressed`, nunca `div` con `onClick`.
- Todo control (enlaces "ver decisión relacionada", badges interactivos) es un elemento nativo enfocable.
- Estados de carga/error: `role="status"`/`role="alert"`, reutilizados de los componentes ya existentes.

## 19. Responsive

Mismo sistema único (sin segunda experiencia móvil), validado en 360/390/768/1024/1440px:

- **Alternativas**: en móvil, columna única, cada alternativa como bloque completo (no side-by-side comparativo — comparar visualmente "no_action vs. acción" en columnas induciría a leerlo como una elección binaria puntuada, que no es el modelo real).
- **Evidencia/trazabilidad**: `<details>` colapsado por defecto en todos los anchos.
- **Badges de actividad**: envuelven (`flex-wrap`), nunca truncan el `activity_id`.

## 20. Temas

Sin paleta nueva. Reusa `--color-risk`, `--color-opportunity`, `--color-info`, `--color-interactive`, `--color-neutral` ya definidos y verificados (`tests/contrast.test.js`). Ningún color exclusivo para "decisión" o "recomendación" — el tipo de recomendación usa los mismos tokens semánticos ya mapeados por tipo de inteligencia relacionada (p. ej. `mitigate` hereda el tono de `risk`, `pursue_opportunity` el de `opportunity`), sin introducir una escala nueva.

## 21. API / llamadas

Exclusivamente `GET /profiles/:id/radar` (Radar/Situación, ya integrado en `api.js`) y `GET /reports/:id` + `GET /reports/:id/traceability` (Informes, ya integrados en el contrato de Informes, aunque su cliente en `api.js` fue removido junto con la implementación revertida y deberá reincorporarse en la etapa de implementación). **No se crea ningún endpoint nuevo.** Expandir decisión, alternativas o evidencia básica: 0 llamadas. Verificar `decision.id === recommendation.decision_id` (§11): 0 llamadas (comparación local). Trazabilidad completa: lazy, como ya estaba especificado.

## 22. Costos

```
Carga de la capa Decisión/Recomendación (dentro de Radar o de un informe ya abierto): 0 HTTP externo, 0 IA, 0 Search
Trazabilidad completa (Informes, lazy): 0 IA, 0 Search, 0 HTTP externo (solo el backend propio)
```

Ninguna interacción de esta capa introduce IA/Search — confirmado en 2F-0 por lectura de `backend/decision/` y `backend/intelligence/recommendations/` (sin imports de `services/ai`/`services/search`).

## 23. Seguridad

Sin autenticación (heredado, todo el sistema). Ningún dato interno (SQL, stack traces, ids técnicos innecesarios como `run_id`) se expone en la UI — solo los identificadores con valor de trazabilidad real ya documentados (§15). Compatible con una futura autenticación sin rediseño: la capa no asume ni depende de sesión, solo del perfil activo local ya existente.

## 24. Flujos UX

**Flujo principal** (desde un cambio, Radar):
```
Cambio → Inteligencia (tipo/evidencia/confianza) → expandir Decisión
  → comparar no_action vs. alternativa → ver Recomendación vigente (statement + badges)
  → Evidencia (nivel 1, ya visible) → Trazabilidad (lazy, límite de señal en Radar)
```

**Flujo alternativo** (desde la sección plana de Recomendaciones o un claim de Informes):
```
Recomendación → actividad para la que aplica → statement → confianza/evidencia
  → situación/inteligencia relacionada → decisión, SOLO si decision.id === recommendation.decision_id
    es comprobable (§11); si no, el contexto explícito es "actividad/situación", nunca "esta decisión"
```

## 25. Casos límite

- Una decisión cuya única alternativa accional tiene `status:'not_comparable'` (`impact_direction:'uncertain'`): se muestra igual, sin ocultarla ni marcarla como error — `not_comparable` se traduce como "no comparable con la evidencia actual", no se omite la alternativa.
- Una recomendación reusada (`{created:false, reused: previous}`): no genera una fila nueva — la UI simplemente no tiene nada especial que mostrar aquí, porque no hay una segunda recomendación, solo la misma vigente vista desde una decisión distinta (exactamente el caso de §11).
- Multiactividad con clasificaciones opuestas (una actividad en riesgo, otra en oportunidad, desde la misma señal): cada una se presenta en su propio contexto de actividad, nunca fusionadas en un resumen ambiguo.
- Informe `periodic`: no tiene decisiones ni recomendaciones (`contrato-informes.md` §16, reconfirmado) — esta capa simplemente no aparece en su plantilla de detalle (ya así en `arquitectura-informes-ux.md` §11).

## 26. Criterios de aceptación para 2F-2

- [ ] `no_action` se presenta siempre como alternativa real de primera clase, nunca como ausencia o error.
- [ ] Ninguna alternativa se marca como "mejor opción"; ningún score/probabilidad/porcentaje inventado.
- [ ] El `statement` se muestra verbatim, sin reescritura ni intensificación.
- [ ] El lenguaje de la relación decisión→recomendación sigue exactamente la regla de §11 (verificación de ids, nunca afirmación sin comprobar).
- [ ] `alternatives[].constraints` nunca se presenta como si reflejara las restricciones declaradas en el perfil.
- [ ] Recomendación vigente y version anterior (`superseded`) se distinguen siempre que coexisten en la misma vista.
- [ ] Multiactividad sin fusión ni privilegio a la actividad principal.
- [ ] Cero llamadas nuevas más allá de las ya contratadas por Radar/Situación/Informes; trazabilidad completa permanece lazy.
- [ ] Cero recálculo de evidencia/confianza/relevancia/prioridad en frontend.
- [ ] Estados: los 9 de §9 implementados según su tratamiento definido; el estado B (decisión sin recomendación) NO se simula por ser inalcanzable.
- [ ] Accesibilidad: `<details>/<summary>` nativos, controles focoseables, sin `div` como botón.
- [ ] Responsive en 360/390/768/1024/1440px, un único sistema.
- [ ] Claro/Oscuro/Sistema sin color nuevo.

## 27. GAPs heredados relevantes

| GAP | Relevancia para esta capa | Tratamiento |
|---|---|---|
| 17.7 (decisión↔recomendación por actividad) | Directa — define el lenguaje de §11 | Regla congelada en §11, refinada respecto de Radar/Informes previos |
| 12.2 (constraints sin influencia) | Directa, extendida a `alternatives[].constraints` | Aclaración textual obligatoria, §14 |
| 17.6 (sin `information_value` explícito) | Baja | No se muestra ese campo, no se infiere |
| 17.8 (`defer` catalogado, no alcanzable) | Baja | Fallback de tabla (§7), nunca listado como disponible |
| 12.6 (sin actividades ≡ sin señales) | Indirecta (estado J) | Mensaje único, ya resuelto en Situación/Radar |

Ninguno bloquea el diseño ni la futura implementación de esta capa.

---

**Estado de esta etapa**: diseño completo, sin implementación. Ningún archivo de `web/src/{pages,components,services}` fue creado ni modificado. Ningún archivo de `backend/`/`knowledge/`/contratos existentes fue tocado.
