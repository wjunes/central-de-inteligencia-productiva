# Arquitectura funcional y UX/UI — Radar Productivo (`/radar`)

> Etapa de **diseño** (Paso 2D-1), no de implementación. Ningún componente visual se construye en esta etapa. Referencia contractual obligatoria: `docs/arquitectura/contrato-radar.md` (Paso 2D-0) — toda decisión de este documento cita el campo/regla real que la sustenta; donde el contrato no alcanza, se documenta como GAP (sección 24), nunca se inventa el dato faltante. Este documento es hermano de `docs/producto/arquitectura-funcional-ux.md` (Paso 1, AppShell general) y de la implementación ya construida de Situación (`web/src/pages/home.js`, Paso 2C-1/2C-2) — reutiliza su sistema de diseño íntegro, no propone uno nuevo.

---

## 1. Propósito

Definir qué debe ver, explorar y entender el usuario en `/radar`, con qué jerarquía, qué componentes, qué estados y qué límites reales de trazabilidad — de modo que la implementación (etapa futura, 2D-2) tenga una especificación completa sin decisiones de diseño pendientes ni necesidad de tocar backend/knowledge.

## 2. Rol de Radar dentro del producto

Radar Productivo es la **interfaz de exploración estructurada de la inteligencia ya procesada**. No es:

| No es | Por qué |
|---|---|
| Un segundo chatbot | No hay entrada de lenguaje natural ni generación de texto nueva — todo `statement` viene de plantilla regulada (contrato §15) |
| Un listado plano de noticias | Los datos ya vienen agrupados/clasificados por el backend (situaciones, tipos, relevancia) — aplanarlos a una lista cronológica perdería esa estructura |
| Un dashboard decorativo | Cada elemento visible es accionable hacia su propio detalle/evidencia, no un adorno visual |
| Una copia ampliada de Situación | Situación es un resumen curado de 4-6 categorías fijas; Radar expone la MISMA respuesta (`GET /profiles/:id/radar`) con exploración completa, filtros y trazabilidad — ver diferencia exacta en §3 |
| Un sistema de recomendaciones | Radar muestra recomendaciones ya generadas, nunca genera, prioriza para acción ni permite "aceptar/rechazar" una recomendación (no existe ese concepto en el contrato) |
| Un sistema de decisiones | Las decisiones se muestran como information — alternativas evaluadas, incertidumbre, reversibilidad — nunca como un flujo operativo con estado propio gestionable desde la UI |

## 3. Diferencia Situación / Radar / Informes

```text
SITUACIÓN (/)                    RADAR (/radar)                      INFORMES (/informes)
"¿qué está pasando y qué         "quiero explorar qué está           "análisis elaborado,
 debería observar?"               pasando y entender las               versionado, con narrativa"
                                   relaciones"

resumen curado, 6 secciones      exploración completa del MISMO      síntesis derivada,
fijas, sin filtros                payload, filtrable, expandible,     generada explícitamente
                                   con trazabilidad                    (POST /reports/generate)

misma llamada:                   misma llamada:                      llamada distinta:
GET /profiles/:id/radar          GET /profiles/:id/radar             GET /reports, GET /reports/:id

no muestra: decisiones           muestra: TODAS las recomendaciones  no es una vista en vivo —
completas, todas las              activas (no solo monitor/           es un documento generado,
recomendaciones, historial        seek_information), alternativas     con snapshot y versión
resuelto                          de decisión, situations.resolved
                                   (si se habilita), trazabilidad
```

Ambas pantallas (Situación y Radar) consumen exactamente la misma respuesta de `/radar` (contrato §22: "la diferencia real... es de profundidad de exposición sobre la MISMA respuesta, no de fuente de datos distinta"). Informes es la única de las tres que dispara una acción del servidor (`generateReport`) y produce un artefacto persistente y versionado — Radar nunca genera nada, solo presenta.

## 4. Arquitectura de información

```text
/radar
 │
 ├── radar-header            (resumen agregado — mismo dato que situation-summary de Situación,
 │                             propósito distinto: aquí es punto de ENTRADA a la exploración,
 │                             no un resumen final)
 │
 ├── radar-filter             (Actividad · Tipo · Relevancia — opera sobre arrays ya recibidos,
 │                             nunca recalcula nada, ver §15)
 │
 ├── SITUACIONES               (situation-card × N, expandible a sus miembros — contexto relacional
 │                             de más alto nivel: "estos N elementos están conectados")
 │
 ├── CAMBIOS                   (una sola lista filtrable — Todos · Riesgos · Oportunidades · Para
 │                             observar — NUNCA 4 listas separadas duplicando los mismos items,
 │                             ver §9 y la decisión de arquitectura que seguí)
 │      └─ (expandido) inteligencia · decisión · recomendación · evidencia — nunca secciones
 │                             globales propias, ver §5
 │
 └── RECOMENDACIONES           (lista plana de radar.recommendations — todos los tipos activos,
                               agrupados por tipo con badge — única sección que NO es un
                               subconjunto de "Cambios": es el único array propio para esto)
```

**Decisión de arquitectura clave**: el contrato (§5.3 de `contrato-radar.md`) confirma que `risks`/`opportunities`/`monitor` son **el mismo tipo de objeto que `changes.items`**, filtrado por contenido, no tres sistemas independientes. Presentarlos como 4 secciones fijas (como hace Situación, correctamente, para un resumen corto) en una pantalla de exploración con más volumen invitaría a pensar que son 4 fuentes de datos distintas — exactamente lo que la sección 9 del prompt pide evitar. Por eso Radar los unifica en **una sola lista con filtro de tipo** (tabs `Todos/Riesgos/Oportunidades/Para observar`, mismo patrón visual que `activity-switcher`/`.button--tab` ya construido para Perfil). "Inteligencia" y "Decisiones" (puntos E/F del prompt) no son secciones de nivel superior: son datos anidados dentro de cada item de Cambios (`item.intelligence[].decisions[]`) y se exponen por expansión progresiva (§5), no como listas globales — crear una sección "Inteligencia" separada obligaría a duplicar visualmente el mismo dato que ya aparece en Cambios. "Recomendaciones" **sí** es una sección propia porque el contrato la expone como un array de nivel superior con valor de exploración independiente (todas las recomendaciones activas del perfil, sin necesidad de recorrer cada cambio).

## 5. Jerarquía de contenido — orden y justificación

Orden vertical de la pantalla, respondiendo progresivamente a los 6 niveles del prompt (sin convertirlos en títulos literales):

1. **`radar-header`** → Nivel 1 ("¿qué está pasando?") — mismo dato agregado que Situación, aquí como punto de entrada.
2. **Situaciones** → sigue respondiendo Nivel 1, a un grano más fino: qué agrupaciones relacionadas existen, antes de bajar a cambios individuales.
3. **Cambios (filtrable)** → Nivel 2/3 ("¿qué cambió?"/"¿qué puede afectarme?") — el filtro de tipo permite bajar directamente a riesgos/oportunidades sin perder el contexto de que son el mismo conjunto.
4. **Dentro de cada Cambio expandido**: inteligencia (Nivel 4, "¿qué significa?") → decisión (Nivel 5, "¿qué alternativas?") → recomendación anidada (Nivel 6, "¿qué respuesta está sustentada?") — progresión que ocurre DENTRO de la tarjeta, no como scroll adicional de página.
5. **Recomendaciones (sección plana)** → repite el Nivel 6 pero como vista independiente para quien quiere explorar "qué se está recomendando" sin pasar por cada cambio uno por uno.

## 6. Situaciones

`situation-card` (colapsada): actividades afectadas (`activity_ids`, como `activity-badge` × N — nunca solo la principal destacada, contrato §21 confirma que no hay privilegio automático), tema (`topic_id`), tipo (`type`: risk/opportunity/impact, mismo badge que ya existe en `intelligence-item.js`), estado (`status`: emerging/active/persistent — badge `SITUATION_STATUS_LABEL` ya construido), relevancia (`personalized_relevance.level`), confianza — **etiquetada explícitamente como "confianza del primer elemento analizado, no un promedio de la situación"** (contrato GAP 17.3: `situation.confidence` no es una agregación real; la UI debe decir esto o algo equivalente, nunca presentarla como certeza global). Tendencia (`trend`): si `status==='confirmed'`, mostrar dirección+observaciones (ya resuelto en `intelligence-item.js`); si `insufficient_evidence`, mostrar el mensaje honesto ya existente, nunca inventar una tendencia.

**Dirección por miembro sin llamada adicional**: `situation` no trae un campo `direction` propio (contrato §5.2 — no está en la lista de campos). Como Radar carga TODO en una sola respuesta, la dirección de cada miembro se resuelve por **cruce en memoria**: `situation.members[].signal_id` contra `radar.changes.items[].signal.id` (ambos ya están en el mismo payload) — nunca una segunda petición, nunca un cálculo de negocio, solo una búsqueda de referencia dentro de los datos ya recibidos. Expandida, la tarjeta lista sus `members` con esta dirección resuelta.

`radar.situations.resolved`: **decisión UX — no se muestra en V1**. Su utilidad (historial de situaciones que dejaron de tener evidencia reciente) es real pero secundaria frente al volumen y complejidad de diseño que exige distinguir visualmente, sin ambigüedad, "resuelta" de "activa" (riesgo de leer una situación resuelta como vigente). Se documenta como decisión UX deliberada, no como GAP — el campo queda disponible en el contrato para una iteración futura si se decide incorporar un historial.

## 7. Cambios

`change-item`, dos niveles:

**Resumen (colapsado, `<summary>`)**: actividad (`activity_badge`), tipo(s) de inteligencia contenida (badges, reusando `TYPE_LABEL`), relevancia (`personalized_relevance.level`), dirección de la señal (`signal.direction`), fecha (`signal.detected_at`). Sin `previous_value`/`new_value` — no existen en el payload (contrato §7/12.1, GAP heredado, no se calcula en frontend).

**Detalle expandido (`<details>` nativo, ver §19)**: por cada `intelligence` unit — tipo, `evidence_level` (siempre `structural_relationship` hoy, mostrado tal cual, sin fingir granularidad que el motor no produce — contrato §11), las 4 subdimensiones de `confidence` por separado (nunca combinadas en un número); por cada `decision` anidada — las 2 alternativas reales (`no_action` + una accional), `uncertainty.status`, `reversibility`, `trigger_condition` si es contingente, **sin ningún indicador de "mejor opción"** (el backend no produce `best_option`, contrato §14); la `recommendation` de esa decisión (`statement` verbatim, `priority`, `evidence_level` de la recomendación — distinto del de la intelligence, contrato §11); y el panel de evidencia (§13).

## 8. Riesgos y oportunidades

Presentados como **filtro de tipo sobre la misma lista de Cambios** (tabs `Todos · Riesgos · Oportunidades · Para observar`, patrón `.button--tab[aria-pressed]` ya existente), no como secciones/sistemas independientes — ver justificación en §4. El filtro solo decide qué subconjunto de `changes.items` mostrar, usando la misma pertenencia que el backend ya calculó (un item de `radar.risks` sigue siendo un item de `changes.items`, comparado por `id`) — nunca se reclasifica un item por lógica de frontend. Dentro de un item con más de un tipo de `intelligence` (p. ej. contiene tanto una unidad `risk` como una `impact`), la pestaña "Riesgos" solo resalta esa unidad, sin ocultar que el item también tiene otro contenido (mismo criterio ya usado en `web/src/utils/situation.js#itemsByIntelligenceType`, reutilizable tal cual).

## 9. Recomendaciones

Sección plana desde `radar.recommendations` (todos los tipos activos, no solo `monitor`/`seek_information`). Cada `recommendation-item` muestra: `statement` (verbatim, plantilla regulada — nunca reformulado), badge de `type` con etiqueta aprobada y neutra (tabla §21 más abajo — ninguna se redacta como orden), `priority`, `evidence_level`, actividad. **Vínculo con la decisión de origen**: se intenta resolver `recommendation.decision_id` contra las `decisions[].id` ya presentes en `changes.items` (mismo payload, sin nueva llamada); si se encuentra, se ofrece "ver decisión relacionada" con expansión hacia ese item; si no se encuentra (puede pertenecer a una corrida anterior cuya intelligence ya no es "relevante" hoy y por tanto no está en `changes.items`), se muestra la recomendación sola, sin fabricar un enlace. En cualquier caso, la etiqueta usada es **"recomendación relacionada con esta actividad"**, nunca "generada específicamente por esta decisión" (GAP 17.7 — el contrato resuelve esa relación por `activity_id`, no siempre por `decision_id` exacto).

Tabla de tipos reales y su etiqueta (neutra, no imperativa — ninguna reformula el `statement`, solo lo clasifica):

| `type` real | Etiqueta de badge |
|---|---|
| `monitor` | Monitorear |
| `seek_information` | Buscar información |
| `prepare` | Prepararse |
| `mitigate` | Mitigar |
| `pursue_opportunity` | Evaluar oportunidad |
| `adjust` | Ajustar |
| `evaluate` | Evaluar |
| *(cualquier otro, p. ej. `defer` si el motor llegara a producirlo — GAP 17.8)* | el propio valor de `type`, sin traducir (mismo principio ya usado para valores desconocidos en `intelligence-item.js`) |

## 10. Decisiones

No hay sección propia (ver §4/§5). Se muestran únicamente anidadas dentro de un `change-item` expandido, con las 2 alternativas reales (siempre `no_action` primero — refuerza visualmente que "no actuar" es una alternativa legítima, nunca implícita), sus campos reales (`uncertainty`, `reversibility`, `is_contingent`, `trigger_condition`, `factors_for`/`factors_against`) y, si existe, su recomendación asociada. Nunca un score, nunca una alternativa resaltada como "recomendada" más allá de lo que la propia `recommendation` ya indica explícitamente.

## 11. Trazabilidad

Panel "Ver evidencia" (`evidence-panel`, `<details>` dentro de cada `change-item`/`recommendation-item`), mostrando **exactamente lo que el payload de `/radar` contiene** — nunca prometiendo más:

```text
RADAR ─ intelligence.id ─→ signal.id, signal.source_id, signal.monitor_id, signal.detected_at, signal.topic_id
```

**Límite real, confirmado por el contrato (§16 de `contrato-radar.md`)**: el objeto `signal` que llega al frontend **no incluye `change_id` ni `capture_id`** — esos campos existen en la base de datos y son recorribles (verificado, Caso 21 de `radar.test.js`) pero solo del lado del servidor. La cadena completa `SIGNAL → CHANGE → CAPTURE → RESOURCE → SOURCE` **no es reconstruible desde el frontend con el contrato actual** — no existe un endpoint de trazabilidad para Radar (a diferencia de Informes, que sí tiene `GET /reports/:id/traceability`). El panel de evidencia de V1 debe detenerse honestamente en el nivel de señal (`source_id`/`monitor_id`/`detected_at`, mostrados como identificadores, sin resolver un nombre legible de fuente — no existe catálogo de fuentes expuesto al frontend) y **no debe insinuar** que se puede "ver la captura original" o "ver el documento fuente". Si se decide en el futuro ofrecer eso, requiere un endpoint nuevo — se documenta como GAP-UX (§24), no se resuelve aquí.

```text
RADAR ─ intelligence.id ─→ decision.id (triggered_by_intelligence_id) ─→ recommendation (ver GAP 17.7, §9)
```

## 12. Multiactividad

Cada `activity_badge` es real e independiente — el perfil de prueba (ganadería + soja + aceites) demuestra que la MISMA señal produce 3 `changes.items` distintos con clasificaciones distintas (`elaboracion-aceites`=riesgo, `cultivo-soja`=oportunidad, `ganaderia-bovina-carne`=solo impacto/monitor, contrato §10). La UI nunca fusiona estos 3 items en uno ni asume que afectan igual a cada actividad — se muestran como 3 `change-item` independientes. Una `situation-card` que agrupa las 3 muestra sus 3 `activity_badge` sin jerarquía visual por ser la actividad principal (contrato §21: "sin privilegio automático" — mismo tamaño/orden de badge para las 3, orden = el que ya trae `activity_ids`, nunca "principal primero" artificialmente).

## 13. Filtros (V1)

| Filtro | Fuente | Implementación |
|---|---|---|
| **Actividad** | `activity_id` únicos presentes en `changes.items` de la respuesta ya cargada | `<select>` (mismo componente visual que `.field select`), opciones = solo las actividades realmente presentes, nunca el catálogo completo de `/profile/catalogs` (evita ofrecer un filtro vacío) |
| **Tipo** | pertenencia a `risks`/`opportunities`/`monitor`/`changes.items` (comparación por id, no recálculo) | tabs `.button--tab[aria-pressed]`, mismo patrón que `activity-switcher` |
| **Relevancia** | `personalized_relevance.level` presente en los items cargados | tabs u opciones de `<select>`, solo niveles realmente presentes en el dataset actual |
| **Estado** (situación) | `status` de `situations.items` | aplica solo dentro de la sección Situaciones, mismos valores ya catalogados (`emerging/active/persistent`) |

**Fuera de V1**: filtro de período (contrato 12.5/12.4 — sin comparación de período disponible más allá de ordenar por fecha, que ya es el orden contractual) y búsqueda textual (§14 del prompt / §15 más abajo). Todos los filtros **narrowean** el array ya recibido — ninguno dispara una nueva petición ni reordena con un criterio propio (respetan §16).

## 14. Búsqueda

**Fuera de V1.** El volumen esperado en esta etapa del producto (un perfil típico produce, en las pruebas reales, entre 3 y una docena de `changes.items` por corrida) no justifica una búsqueda textual — los filtros de actividad/tipo/relevancia ya cubren la necesidad real de acotar. Agregar búsqueda ahora sería completitud estética, prohibida explícitamente (prompt §14). Si el volumen crece en producción real, se reevaluará como una etapa propia — nunca implicando Search externo, IA ni una fuente de datos nueva.

## 15. Ordenamiento

Radar respeta íntegramente el orden contractual documentado en `contrato-radar.md` §17 — nunca crea un ranking propio:

- `changes`/`risks`/`opportunities`/`monitor`: orden de `getChanges()` (relevancia desc → `priority_match` desc → fecha desc).
- `situations.items`: orden de `radar/prioritize.js#sortByPriority` (6 criterios, `priorityKeyOf` confirmado que NO usa `is_primary_activity` — contrato §10/§21, sin privilegio por actividad principal).
- `recommendations`: orden de inserción (sin sort propio).

Los filtros de §13 solo esconden elementos, nunca reordenan los que quedan visibles.

## 16. Estados

| Estado | Tratamiento |
|---|---|
| Carga | `role="status"`, mensaje "Cargando tu Radar…" — mismo patrón que Situación |
| Sin perfil | CTA a `/perfil`, reusa `renderNoProfileState` (o su equivalente) |
| Perfil eliminado | 404 real, reusa `isNotFoundError()` |
| Radar sin información relevante | mensaje único y honesto (GAP 12.6, §18) — nunca afirma cuál de los dos casos reales ocurrió |
| Solo cambios / solo riesgos / solo oportunidades / solo recomendaciones | **no son estados globales distintos** — cada sección (Situaciones/Cambios-por-tab/Recomendaciones) resuelve su propio vacío de forma independiente y honesta (mismo patrón `renderStatusMessage({kind:'empty'})` ya construido), sin necesidad de una máquina de estados combinada |
| Radar completo | render normal de todas las secciones con datos |
| Error de red | `ApiError(status:null)`, reusa `describeApiError()` |
| Error de servidor | 500 genérico, reusa `describeApiError()` (nunca expone detalle interno) |
| Datos incompletos (campo opcional ausente) | fallback seguro ya establecido (valores desconocidos muestran su propio valor crudo, nunca rompen el render — mismo principio de `intelligence-item.js`) |
| Situaciones resueltas | fuera de V1 (decisión UX, §6) |

## 17. Responsive

Un único sistema (no 3 interfaces distintas), igual que el resto de la app:

- **Móvil**: filtros colapsan a un `<select>`/fila horizontal con scroll (no un menú oculto adicional); `change-item`/`situation-card` en columna única; `<details>` nativo ya es 100% funcional táctil sin JS extra; trazabilidad y recomendaciones accesibles sin paneles laterales.
- **Tablet**: mismo layout de móvil con más aire (`--space-lg`/`--space-xl`), posible 2 columnas para `recommendation-item` cortas.
- **Escritorio**: puede permitir 2 columnas para `change-item` (lectura) sin perjudicar comprensión — nunca oculta información que en móvil sí se ve, solo la distribuye distinto. Reusa exactamente el sistema `flex-wrap`/`stack` ya construido, sin `min-width` fijo mayor a pantalla.

## 18. Accesibilidad

- Jerarquía: `<h1>Radar Productivo</h1>` → `<h2>` por sección (Situaciones/Cambios/Recomendaciones), igual que Situación.
- Landmarks: el contenido vive dentro del `<main>` ya existente del AppShell (sin landmark propio adicional).
- Expansión: `<details>/<summary>` nativos para el detalle de cada `change-item`/`situation-card`/panel de evidencia — da `aria-expanded` semánticamente correcto sin JS ni ARIA manual (decisión explícita: evita "accordions complejos" que el prompt §29 pide evitar si no aportan valor).
- Filtros de tipo: botones reales con `aria-pressed`, mismo patrón ya auditado (`.button--tab`, usado en `activity-switcher`).
- `aria-current`: no aplica dentro de Radar mismo (no es navegación de rutas); sí se mantiene en la navegación global ya existente.
- Estados: `role="status"` (carga/vacío/info) y `role="alert"` (error) — mismos componentes reutilizados, ya verificados.
- Teclado: todo control (`<details>`, `<select>`, botones de filtro, enlaces de evidencia) es un elemento nativo enfocable — sin ningún `onClick` sobre un `<div>`.
- Contraste: reusa tokens ya medidos (`tests/contrast.test.js`, incluida la extensión de badges de Paso 2C-2) — ningún color nuevo se introduce (§20).

## 19. Temas

Claro/Oscuro/Sistema: sin cambios de sistema — Radar reusa los mismos tokens (`--color-risk/opportunity/info/interactive/neutral`, `--color-surface`, `--color-background`) ya definidos y verificados en `tokens.css`/`themes.css`. Ningún color literal nuevo. El tema Oscuro sigue sin ser una inversión automática (regla ya vigente, no se toca).

## 20. Color semántico

Mismo criterio ya establecido: cada badge de tipo/estado/relevancia lleva SIEMPRE texto (nunca solo color) — reutiliza `TYPE_LABEL`/`RELEVANCE_LABEL`/`SITUATION_STATUS_LABEL`/`CONFIDENCE_LABEL`/`EVIDENCE_LABEL` de `intelligence-item.js` tal cual, sin duplicarlos. Ninguna sección de Radar depende exclusivamente de rojo/verde para transmitir riesgo/oportunidad — el texto del badge ("Riesgo"/"Oportunidad") es la fuente primaria de significado, el color es refuerzo.

## 21. Componentes

| Componente | Responsabilidad | Estado |
|---|---|---|
| `radar-header` | resumen agregado de entrada (conteos reales) | **Reutiliza** `situation-summary.js` tal cual (mismo dato, mismo componente, distinto contexto de uso) |
| `radar-filter` | tabs de tipo + selects de actividad/relevancia, sin lógica de negocio, solo emite el criterio elegido | Nuevo, pero compone patrones ya existentes (`.button--tab`, `.field select`) |
| `situation-card` | presentar una situación agrupada + sus miembros con dirección resuelta por cruce en memoria | Nuevo (usa `renderIntelligenceItem` internamente para cada miembro) |
| `change-item` | presentar un item de cambio en 2 niveles (resumen/expandido) | Nuevo, compone `renderIntelligenceItem` para cada `intelligence` unit + un bloque propio de decisión |
| `decision-detail` | mostrar las 2 alternativas reales de una decisión, sin score | Nuevo, pequeño, usado solo dentro de `change-item` expandido |
| `evidence-panel` | mostrar lo trazable real (signal/source_id/monitor_id), con el límite de §11 explícito en su propio texto | Nuevo |
| `recommendation-item` | presentar una recomendación con su badge de tipo real y su vínculo (si existe) a una decisión | Nuevo, pero reusa `renderIntelligenceItem`'s patrón de badges |
| `activity-badge` | mostrar un `activity_id` como elemento visual consistente | **Ya existe implícitamente** como parte de `intelligence-item.js` (título) — se extrae como sub-componente propio solo si más de 2 lugares lo necesitan de forma independiente (situation-card lo necesita para N badges, no solo 1) |
| `radar-empty-state` | estado vacío de cada sección | **Reutiliza** `status-message.js` tal cual, sin componente nuevo |

**No se crean**: `risk-item`/`opportunity-item` como componentes separados de `change-item` (serían el mismo componente con un dato distinto — crear dos sería fragmentar HTML sin responsabilidad propia, prohibido por el prompt §26), ni `traceability-panel` como algo distinto de `evidence-panel` (mismo concepto, un nombre).

## 22. Performance

Con el volumen real observado (perfil de prueba: 3 `changes.items`, 1 situación, 3 recomendaciones), no hay necesidad de paginación ni virtualización en V1 — decisión explícita de **no optimizar prematuramente** (prompt §31). Se evita:

- **Requests adicionales**: ninguno — una sola `GET /profiles/:id/radar` carga TODA la pantalla (igual que Situación).
- **Recalculo por tarjeta**: los filtros son un `.filter()` sobre arrays ya en memoria, sin recorrer el backend de nuevo.
- **Renderizado innecesario**: el detalle expandido de cada `change-item` usa `<details>` nativo — el navegador no re-renderiza contenido colapsado con costo de framework (no hay framework), y no requiere gestionar el estado de "qué está expandido" en JS.

Si un perfil real llegara a producir un volumen mucho mayor (decenas de situaciones/cambios), la primera medida sería colapsar por defecto (ya es el comportamiento nativo de `<details>` sin el atributo `open`) antes que paginar — evaluado como mejora futura, no bloqueante para V1.

## 23. API utilizada

**Exclusivamente** `GET /profiles/:id/radar` (sin `view=`, igual que Situación — se pide el objeto agregado completo en una sola llamada, coherente con el "costo esperado" del contrato §15/20). `web/src/services/api.js#getProfileRadar()` ya existe y no requiere ningún cambio. No se agrega ningún endpoint, no se agrega ningún parámetro nuevo, no se realizan requests paralelos.

## 24. GAPs

### Heredados (12.1–12.6) — impacto UX en Radar

| GAP | Impacto en presentación | ¿Bloquea? | Tratamiento en V1 |
|---|---|---|---|
| 12.1 (previous_value/new_value) | `change-item` no puede mostrar "de X a Y", solo dirección | No | Se omite, no se calcula |
| 12.2 (constraints sin influencia) | Ninguno visible — Radar no expone restricciones en absoluto | No | N/A |
| 12.3 (indicador no es entidad) | No se puede listar "todos los indicadores monitoreados" como panel propio | No | No se ofrece esa vista |
| 12.4 (sin vista de mercado en vivo) | Ninguna — fuera del alcance de Radar | No | N/A |
| 12.5 (sin comparación de período) | No hay filtro de período en V1 (§13) | No | Documentado, no implementado |
| 12.6 (sin actividades ≡ sin señales) | Mensaje único y honesto para el estado "sin información relevante" (§16) | No | Igual que Situación, sin llamar a `/changes` |

### Radar (17.2–17.8) — impacto UX

| GAP | Impacto en presentación | ¿Bloquea? | Tratamiento en V1 |
|---|---|---|---|
| 17.2 (`trend` no se genera como intelligence) | Ningún badge de tipo "Tendencia" aparece a nivel de `intelligence` — la tendencia solo se muestra a nivel de `situation.trend` (ya resuelto en `intelligence-item.js`) | No | Ya contemplado, sin cambios |
| 17.3 (confidence de situación no es agregación real) | Etiqueta explícita distinta de "confianza global" (§6) | No | Redacción cuidada, sin gauge/porcentaje |
| 17.4 (`view` desconocido → 200) | Ninguno — Radar V1 nunca envía `view=`, solo consume vistas válidas documentadas | No | N/A para esta pantalla |
| 17.5 (`last_seen_at` se actualiza con la sola lectura) | La UI **no debe** mostrar `last_seen_at` como "última actualización" sin calificarlo, o directamente omitirlo y mostrar solo `first_seen_at`/`observation_count` (confiables) | No | Se usa `first_seen_at`/`observation_count`; si se muestra `last_seen_at`, con una etiqueta que no implique "nueva evidencia" |
| 17.6 (sin `information_value` explícito) | Ninguna sección lo necesita mostrar como campo propio — se infiere solo de `uncertainty`/`is_contingent` ya mostrados | No | N/A |
| 17.7 (decision↔recommendation por actividad) | Vínculo etiquetado como "relacionada", nunca "generada por" (§9/§11) | No | Redacción cuidada |
| 17.8 (`defer` no alcanzable) | Tabla de tipos (§9) incluye un fallback seguro por si apareciera | No | Fallback ya definido |

Ningún GAP bloquea la implementación de Radar V1 tal como está diseñado aquí.

## 25. Flujos principales

1. **Situación → Radar**: enlace desde Situación (a construir en una etapa de implementación) hacia `/radar`, opcionalmente con `?activity=<id>` como parámetro de consulta simple (leído una vez al montar la página, sin nueva ruta ni cambio en `router.js#matchRoute` — mismo patrón de estado ambiental que ya usa `active-profile.js` vía localStorage) para preseleccionar el filtro de Actividad. **No implementado en este paso**, solo especificado.
2. **Radar → situación → elementos relacionados**: expandir `situation-card` revela sus `members`, cada uno enlazable (scroll/anchor interno) al `change-item` correspondiente en la lista de Cambios.
3. **Radar → cambio → evidencia**: expandir `change-item` revela su `evidence-panel` (§11), con el límite de trazabilidad explícito.
4. **Radar → riesgo → inteligencia**: filtrar por tipo "Riesgos" y expandir cualquier item muestra su(s) unidad(es) `intelligence` con `evidence_level`/`confidence`.
5. **Radar → oportunidad → inteligencia**: simétrico al anterior.
6. **Radar → inteligencia → decisión**: dentro del mismo `change-item` expandido, la(s) `decision(es)` de esa `intelligence` unit aparecen inmediatamente debajo (sin navegación adicional).
7. **Radar → recomendación → trazabilidad**: desde la sección plana de Recomendaciones, expandir una `recommendation-item` intenta resolver su decisión relacionada (§9) y, si se encuentra, expone el mismo `evidence-panel` que un `change-item`.
8. **Radar → actividad → filtro**: seleccionar una actividad en `radar-filter` reduce Situaciones/Cambios/Recomendaciones a los que la involucran — sin petición nueva.
9. **Radar → error → recuperación**: estado de error (`role="alert"`, mensaje reusado de `describeApiError()`) con un botón "Reintentar" que vuelve a invocar `getProfileRadar()` — no es una acción nueva del backend, es la misma llamada repetida a pedido del usuario.

## 26. Criterios de aceptación

- [ ] Radar tiene una jerarquía comprensible (header → situaciones → cambios filtrables → recomendaciones).
- [ ] Cambios, riesgos y oportunidades se presentan como una sola lista filtrada, nunca como 3 sistemas independientes.
- [ ] Una situación puede explorarse hasta sus miembros (actividad + dirección resuelta por cruce en memoria).
- [ ] Toda actividad se identifica con `activity_badge`, sin privilegio visual automático para la actividad principal.
- [ ] Multiactividad es comprensible: una misma señal con 3 clasificaciones distintas se ve como 3 `change-item` independientes, nunca fusionados.
- [ ] Ningún dato es inventado (`previous_value`/`new_value`, título de situación, dirección agregada, best_option, información sobre capturas/fuentes no expuestas).
- [ ] No se recalcula relevancia, inteligencia, riesgo, oportunidad, prioridad ni confianza en frontend.
- [ ] Ninguna alternativa de decisión se presenta como "mejor opción".
- [ ] Ninguna trazabilidad se afirma más allá de lo que el payload permite (§11, GAP 17.7 respetado en el copy).
- [ ] Todos los estados vacíos son honestos y no ambiguos (GAP 12.6 respetado con mensaje único).
- [ ] Los errores son comprensibles y reutilizan `describeApiError()`/`isNotFoundError()` existentes.
- [ ] Claro/Oscuro/Sistema funcionan con los tokens ya existentes, sin color nuevo.
- [ ] Teclado y foco: todo control es nativo (`<details>`, `<select>`, `<button>`, `<a>`), sin `onClick` sobre `<div>`.
- [ ] Responsive: un único sistema de layout para móvil/tablet/escritorio.
- [ ] No se agrega ninguna llamada de red más allá de `GET /profiles/:id/radar` (una por carga de página, más "Reintentar" a pedido del usuario).
- [ ] No se agrega ningún servicio externo, IA ni Search.

---

**Estado de esta etapa**: diseño completo, sin implementación. Ningún archivo de `web/src/pages|components|services` fue creado ni modificado. Ningún archivo de `backend/`/`knowledge/` fue tocado.
