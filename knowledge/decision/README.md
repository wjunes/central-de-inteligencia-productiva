# knowledge/decision/

## Propósito

`decision/` estructura y evalúa **alternativas** de decisión productiva a partir de la inteligencia ya interpretada por `intelligence/`, preservando incertidumbre, restricciones y condiciones. Responde:

> ¿Qué situación requiere una decisión? ¿Qué alternativas existen? ¿Qué evidencia las sustenta? ¿Qué factores favorecen o perjudican cada alternativa? ¿Qué restricciones existen? ¿Qué incertidumbres permanecen? ¿Qué información falta? ¿Qué condiciones deberían cumplirse?

**Nunca** ejecuta, ordena ni recomienda una acción concreta.

```
activities → ramifications → domain-names → sources → monitoring → cambios → signals → relevance → intelligence → DECISION
```

## Principio fundamental

```
DATO ≠ CAMBIO ≠ SEÑAL ≠ RELEVANCIA ≠ INTELIGENCIA ≠ DECISIÓN ≠ RECOMENDACIÓN ≠ ACCIÓN
```

> **DECISION NO ES EJECUTAR. ES ESTRUCTURAR Y EVALUAR ALTERNATIVAS A PARTIR DE INTELIGENCIA TRAZABLE, PRESERVANDO INCERTIDUMBRE, RESTRICCIONES Y CONDICIONES.**

```
DECISION SUPPORT ≠ AUTONOMOUS DECISION
EVALUAR ALTERNATIVAS ≠ ORDENAR UNA ACCIÓN
```

## Estructura

```
decision/
├── README.md
├── decision-types.json   # 5 tipos (de 10 candidatos) + 4 descartados/fusionados
├── alternatives.json      # esquema de alternativa (no instancias) + familia no_action
├── criteria.json            # 4 criterios de comparación (de 14 candidatos) + por qué no hay scoring numérico
├── constraints.json          # 10 categorías + hard/soft/unknown
├── uncertainty.json           # 7 estados epistémicos + 6 dimensiones de incertidumbre
├── evidence.json                # trazabilidad + clasificación causal (6 valores)
├── rules.json                    # decision_problem, disparador, comparación, valor de información, multiactividad, autonomía, IA
├── gaps.json                      # gap estructural (sin instancias vivas) + limitaciones metodológicas honestas
├── _index.json                     # recuentos
└── _build/                         # generate.py (reproducible, solo lectura)
```

**No se creó `alternatives.json` con instancias, ni `scenarios.json` propio**: no existen intelligence units en vivo sobre los que evaluar alternativas reales (mismo gap estructural que atraviesa todo el proyecto desde `monitoring/`), y la metodología de escenarios ya está completa en `intelligence/scenarios.json` — `decision/` solo necesita **referenciarla** (una alternativa puede declarar `is_contingent` + `trigger_condition`, o depender de un escenario de `intelligence/`), no reimplementarla. Crear un archivo aparte solo para "vacío + referencia" habría sido ruido.

## Los 5 tipos (de 10 candidatos)

`production`, `commercial`, `investment`, `risk_response`, `opportunity_pursuit`. Descartados/fusionados: `operational`/`tactical`/`strategic` → ya existen como `dimensions.scope` en `intelligence/` (reusado, no un tipo de decisión); `market` → se resuelve siempre como una decisión `commercial` concreta; `resource_allocation` → fusionado en `investment`; `contingency` → es un `risk_response` con `trigger_condition` explícito (campo `is_contingent`), no un tipo aparte. Ningún tipo está basado en una actividad (nunca `decision_ganaderia`).

## Los 4 criterios de comparación (de 14 candidatos)

`economic_impact`, `feasibility`, `strategic_alignment`, `evidence_strength` — cada uno con `direction` (`favorable/unfavorable/mixed/neutral/uncertain/not_applicable`) + `evidence[]` + `confidence` + `reason`, **nunca** un score numérico (`criteria.json.no_scoring`): no existe en el repositorio una metodología de ponderación validada entre estos 4 criterios, y fabricarla sería inventar una metodología, no derivarla. `best_option` queda como campo de esquema reservado, **nunca** asignado automáticamente en esta capa.

## Restricciones

10 categorías (`regulatory`, `financial`, `operational`, `technological`, `resource`, `environmental`, `sanitary`, `temporal`, `contractual`, `data_availability`) × 3 severidades (`hard_constraint`, `soft_constraint`, `unknown_constraint`). Una alternativa que viola un `hard_constraint` es `status=infeasible` de inmediato — no una puntuación baja. Una restricción `unknown_constraint` **no** se trata como inexistente.

## Incertidumbre

7 estados (`known/estimated/inferred/projected/scenario_dependent/unknown/conflicting`, mapeados explícitamente a `intelligence/intelligence-types.json.dimensions.epistemic_status` + 2 nuevos: `unknown` — sin evidencia alguna — y `conflicting` — reusa `intelligence/evidence.json.conflicting_evidence`, promovido a estado de primera clase). 6 dimensiones (`data/model/temporal/market/causal/external_uncertainty`) — nunca colapsadas en un único número.

## Caso crítico — ganadería + soja (extiende el caso ya resuelto en `intelligence/README.md`)

**Intelligence unit de origen**: `brote-aftosa` (ramificación real de `ganaderia-bovina-carne`, `category=risks`, `relevance=critical` → `intelligence/` lo clasifica `type=risk`).

`decision_problem` (`type=risk_response`, `scope=strategic`, `primary_activity_id=ganaderia-bovina-carne`), con alternativas **estructuradas, no prescriptas**:

| Alternativa | `kind` | Factores a favor | Factores en contra | Restricción | Reversibilidad | Incertidumbre |
|---|---|---|---|---|---|---|
| `monitorear` (familia `no_action`) | no_action | no hay confirmación oficial de foco activo | la ramificación de origen ya es `relevance=critical` | — | reversible | `unknown` (depende de confirmación de `mgap-dgsg`) |
| `reforzar_verificacion_sanitaria` | no_action (`monitor`) | permite anticipar sin alterar el manejo | requiere atención operativa adicional | `data_availability` (soft): depende de la cadencia real de `mgap-dgsg`, fuente manual en `monitoring/` | reversible | `estimated` |
| `postergar_decisiones_comerciales` | action | evita comprometer una venta bajo estatus sanitario incierto | costo de oportunidad no cuantificable con la evidencia actual | `sanitary` (hard, si se confirma restricción de mercado) → si se confirma, esta alternativa deja de ser `infeasible` y pasa a ser la única viable | partially_reversible | `scenario_dependent` |

Ninguna fila afirma "se debe hacer X": cada una queda como una opción con su propia evidencia, restricción e incertidumbre. La `information_value` asociada: `uncertainty_dimension=data_uncertainty`, `would_affect_alternatives=[postergar_decisiones_comerciales]`, `existing_monitoring_reference=mgap-dgsg::principal` (fuente manual real de `monitoring/monitors.json`) — **no** se crea un monitor nuevo.

**Multiactividad (prompt §18)**: la misma inteligencia sobre precio de soja (ver `intelligence/README.md`) origina un `decision_problem` distinto por actividad: en `cultivo-soja` (`type=commercial`: vender ahora vs. esperar mejor precio, ambas con `relative_cost=unknown`); en `elaboracion-aceites` (`type=production`/`investment`: absorber el mayor costo de insumo vs. buscar proveedor alternativo, esta última con `feasibility=uncertain` por falta de evidencia sobre proveedores alternativos reales).

## Cadena causal (`evidence.json.causal_chain`)

Ejemplo del prompt §13, resuelto con la arista real de `relevance/mappings.json`:

```
soja ↑                                    → observed
costo de alimentación (ganadería bovina)  → correlation, NO structural_dependency
                                              (la única arista real entre cultivo-soja y
                                              ganaderia-bovina-carne es 'related_activity',
                                              heredada por jerarquía — débil, no un vínculo
                                              de insumo declarado en ramifications/)
margen ↓                                  → hypothesis (sin evidencia de que el precio de
                                              venta de la ganadería no se ajustó también)
```

`causal_evidence` existe como valor reservado en el vocabulario pero **ningún mecanismo del repositorio lo produce hoy** — se documenta como gap metodológico, no se fuerza su uso.

## Valor de información

`rules.json.information_value` estructura la dependencia informacional de una decisión (qué incertidumbre, si se resolviera, cambiaría la evaluación) **sin ejecutar monitoreo nuevo**: si ya existe un monitor relevante en `monitoring/monitors.json`, se referencia por id; si no existe, se declara la ausencia explícitamente (no se crea un monitor aquí).

## Autonomía — qué queda explícitamente fuera

`automatic_execution`, `automatic_transaction`, `automatic_purchase`, `automatic_sale`, `automatic_contract`, `automatic_notification_to_third_party`, `automatic_regulatory_submission`, `automatic_financial_operation` (`rules.json.autonomy_prohibited`). `recommendation_basis` define qué sería una recomendación (`decision_support + criterios explícitos + restricciones de usuario/contexto + evidencia suficiente`) — esta capa entrega solo el primer componente; ensamblar una recomendación real requiere restricciones de un usuario concreto, que no existen en `knowledge/`.

## Independencia del proveedor de IA

Esta capa es estructura determinística y referencias a evidencia — **cero dependencias de IA**. La estrategia tecnológica documentada para capas futuras (`DeepSeek API → OpenRouter (fallback) → evaluación futura de OpenAI/Anthropic`) se registra únicamente como contexto de arquitectura en `rules.json.ai_provider_independence`; no hay código ni configuración de ningún proveedor en `knowledge/`.

## Trazabilidad

```
DECISION → ALTERNATIVE → CRITERION/IMPACT/CONSTRAINT → INTELLIGENCE → RELEVANCE →
SIGNAL → CHANGE → CAPTURE → RESOURCE → SOURCE
```

reconstruible por referencia (`evidence.json.traceability_chain`), reusando `intelligence/evidence.json` sin reescribirlo.

## Self-loops (Caso 15)

`agencias-operadores`, `alojamiento`, `cosecha-forestal` siguen sin generar self-loops en `relevance/mappings.json` (verificado automáticamente en `_build/generate.py`, 0 casos) — corregidos durante la tarea de `intelligence/`, sin cambios adicionales en esta tarea.

## Búsqueda externa

Ninguna.

## Gaps (`gaps.json`)

- **Gap estructural** (heredado de todas las capas anteriores): no existen instancias reales de decisión porque no existen instancias reales de señal/cambio en el repositorio.
- **Sin metodología de scoring**: no se fabricó una ponderación numérica inexistente.
- **`causal_evidence` sin mecanismo real**: valor reservado, nunca asignado automáticamente.
- **`relative_cost`/`reversibility` mayormente `unknown`**: ninguna fuente de `sources/` registra costos ni reversibilidad de acciones productivas concretas.
- Se reafirman, sin recorregir, los gaps ya conocidos de `domain-names/`, `signals/`, `relevance/` e `intelligence/`.

## Qué NO contiene

UI, dashboards, notificaciones, ejecución automática, agentes autónomos, workflows de usuario, integración con proveedores de IA, generación narrativa final, `recommendations/`, `actions/`, `notifications/`, perfiles de usuario reales, instancias de decisión.

## Estado

`knowledge/decision/` queda cerrado como capa de estructuración y evaluación de alternativas. No se modificó ninguna capa anterior.
