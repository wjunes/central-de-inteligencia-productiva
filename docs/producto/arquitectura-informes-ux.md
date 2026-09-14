# Arquitectura funcional y UX/UI — Informes (`/informes`)

> Etapa de **diseño** (Paso 2E-1), no de implementación. Ningún componente visual se construye en esta etapa. Referencia contractual obligatoria: `docs/arquitectura/contrato-informes.md` (Paso 2E-0) — toda decisión de este documento cita el campo/endpoint/regla real que la sustenta; donde el contrato no alcanza, se documenta como GAP (sección 33), nunca se inventa la capacidad faltante. Hermano de `docs/producto/arquitectura-funcional-ux.md` (Paso 1) y `docs/producto/arquitectura-radar-ux.md` (Paso 2D-1) — reutiliza su sistema de diseño y sus componentes íntegramente.

---

## 1. Objetivo

Definir qué debe ver, configurar, generar y explorar el usuario en `/informes`, con qué jerarquía, componentes, estados y límites reales de trazabilidad/costos — de modo que 2E-2 tenga una especificación completa sin decisiones de diseño pendientes ni necesidad de tocar backend/knowledge/contrato.

## 2. Principios de diseño

1. **Informes no es Radar.** Radar prioriza y orienta sobre datos ya vigentes; Informes profundiza, estructura y **documenta** un análisis a demanda, generado explícitamente por el usuario, versionado y persistente.
2. **Informes no recalcula nada.** Toda sección del informe proviene de `body`/`claims` ya construidos por `reports/build.js` — el frontend presenta, nunca reclasifica riesgo/oportunidad/relevancia/confianza (mismo principio ya aplicado en Radar).
3. **Generar es una acción explícita del usuario**, nunca automática — cada informe cuesta una escritura real en `reports`/`report_claims`/`report_snapshots` (contrato §5/§23); no se regenera por navegar, filtrar o expandir.
4. **La narrativa (y sobre todo el modo IA) es un enriquecimiento opcional**, nunca el contenido principal — el informe es completo y verificable sin ella (contrato §29.3).
5. **Ningún GAP heredado se oculta**: cuando una sección no tiene datos, o cuando el modelo no soporta algo (comparación de período automática, indicador como entidad, decisión↔recomendación exacta), la interfaz lo dice explícitamente en vez de omitirlo o de sugerir que existe.

## 3. Relación Situación / Radar / Informes

```text
SITUACIÓN (/)          "¿Cuál es mi situación actual?"       resumen curado, sin generación, siempre vigente
RADAR (/radar)         "¿Qué está pasando y qué merece       exploración del MISMO payload vigente, sin persistencia
                         mi atención?"
INFORMES (/informes)   "¿Qué análisis completo y             documento generado a demanda, persistente,
                         verificable puedo consultar?"         versionado, con evidencia/trazabilidad completa
```

Situación y Radar leen `GET /profiles/:id/radar` (dato vigente, recalculado en cada consulta salvo por el efecto de lectura ya documentado en `contrato-radar.md` §17.5). Informes lee/escribe una entidad propia (`reports`) que **no cambia** aunque el estado del sistema siga evolucionando — un informe generado hoy sigue diciendo mañana exactamente lo que decía al generarse (`contrato-informes.md` §21 "reproducibilidad": `GET /reports/:id` nunca recalcula). Esta es la diferencia funcional más importante y la que más debe transmitir la UI: **un informe es un documento, no una vista en vivo.**

## 4. Arquitectura funcional

Las 12 áreas del prompt (A-L) se resuelven así — **no todas requieren pantalla propia**:

| Área | Resuelta como |
|---|---|
| A. Entrada/catálogo | Vista inicial de `/informes` — 2 pestañas: **Generar** (catálogo de 7 tipos) y **Mis informes** (historial) |
| B. Configuración | Panel inline dentro de la tarjeta de tipo seleccionada (no una pantalla nueva, no un wizard de varios pasos) |
| C. Generación | Acción del panel de configuración → `POST /reports/generate` → transición directa a D |
| D. Informe generado | Vista de detalle, misma ruta `/informes` con estado interno (o `?report=<id>`, ver §5) |
| E. Evidencia y fuentes | Progresivo dentro de D: claim → evidencia básica (ya incluida) → trazabilidad completa (bajo demanda, 1 llamada lazy) |
| F-H. Inteligencia/Decisiones/Recomendaciones | Secciones de la vista de detalle, reusando componentes de Radar (§28) |
| I. Historial/versiones | Pestaña "Mis informes" (lista) + panel "Ver versiones" dentro de un informe abierto (bajo demanda) |
| J. Trazabilidad | Panel expandible dentro de cada claim (no una pantalla separada) |
| K. Narrativa | Sección propia dentro de D, colapsada por defecto, con las 2 opciones (determinística/IA) claramente distinguidas |
| L. Estados y errores | Transversal — ver §23 |

**Ninguna de las 12 áreas necesita una ruta propia.** Todo vive dentro de `/informes` como estado interno de una sola página (mismo patrón ya usado en `pages/perfil.js` con `state.viewingActivityId`).

## 5. Navegación

Se mantiene la navegación de 5 elementos existente (`docs/producto/arquitectura-funcional-ux.md` §2.1) — `/informes` no agrega ningún ítem de navegación de primer nivel. Dentro de `/informes`:

- **Vista inicial**: pestaña "Generar" activa por defecto (el catálogo de 7 tipos).
- **Navegación interna**: pestañas "Generar" / "Mis informes" (mismo patrón `.button--tab[aria-pressed]` ya usado en Radar/Perfil).
- **Retorno**: desde un informe abierto, un enlace "← Volver a Mis informes" (o al catálogo, según de dónde vino) — nunca el botón "atrás" del navegador como único mecanismo.
- **Deep-link liviano**: `/informes?report=<id>` como parámetro de consulta (leído una vez al montar, mismo mecanismo ya especificado — no implementado — para Radar en `arquitectura-radar-ux.md` §25 flujo 1) permite abrir un informe puntual sin nueva entrada en `router.js#ROUTES`. Recargar la página con ese parámetro reabre el mismo informe (`GET /reports/:id`), consistente con que un informe es un documento persistente, no un estado efímero.
- **Historial**: pestaña "Mis informes", lista ordenada por fecha descendente (orden que ya trae `listReports()`, `ORDER BY created_at DESC` — contrato §5, nunca reordenada en frontend).
- **Versiones**: dentro de un informe abierto, un panel "Ver versiones" bajo demanda.

## 6. Catálogo de informes

7 tarjetas fijas (contenido estático del frontend, no requiere llamada — los 7 tipos y sus metadatos descriptivos están ya congelados en el contrato, no en una tabla de backend). Cada tarjeta muestra, en lenguaje llano (nunca "selectScope" ni "claims"):

| Campo de la tarjeta | Ejemplo (tipo `sectorial`) |
|---|---|
| Nombre | "Informe sectorial" |
| Para qué sirve | "Analiza en profundidad una actividad productiva específica" |
| Qué necesita de vos | "Elegir una actividad" |
| Personalizado | No |
| Temporal (compara períodos) | No |
| Relacionado con | Actividad |

Ver matriz completa en §11. Sin terminología interna (`activityId`, `scope`, `snapshot`) visible al usuario en el catálogo — esos términos solo aparecen en comentarios de código, nunca en texto de interfaz.

## 7. Selección

Tarjetas (no lista ni tabla) — 7 elementos es un volumen bajo que no justifica filtros, categorías, búsqueda ni favoritos (mismo criterio ya aplicado a la ausencia de búsqueda en Radar, `arquitectura-radar-ux.md` §14: "no agregar mecanismos que no aporten valor" frente a un volumen bajo). Seleccionar una tarjeta expande su panel de configuración (§8) in situ — no navega a otra vista.

## 8. Configuración — parámetros realmente soportados

**Regla**: todo valor que el usuario elige debe salir de un catálogo/selector real ya existente (perfil activo, `GET /profile/catalogs`, `knowledge.marketDimensions()` ya usado por `profile_markets`) — **nunca un campo de texto libre para un identificador interno** (evita que el usuario dispare el defecto 500-vs-400 documentado en contrato §21, ver además §24 de este documento).

| Tipo | Configuración V1 (real) | Origen del valor |
|---|---|---|
| `sectorial` | 1 actividad (select) | `GET /profile/catalogs` (mismo catálogo que Perfil) |
| `market` | 1 mercado (select) + actividades opcionales (multi-select, default: todas) | mercados: mismo catálogo de `profile_markets`; actividades: `GET /profile/catalogs` |
| `risk` / `opportunity` | actividades opcionales (multi-select, default: todas) | `GET /profile/catalogs` |
| `personalized` | ninguna — usa el perfil activo del dispositivo directamente | `state/active-profile.js` (ya existente) |
| `executive` | alternar "con mi perfil" / "síntesis general del sistema" | perfil activo o ninguno |
| `periodic` | **GAP de configuración real** — ver más abajo | — |

**GAP nuevo de esta etapa**: `periodic` requiere `monitorId` + `field` (identificadores técnicos internos de `knowledge/monitoring/`) que **no tienen catálogo expuesto al frontend** (verificado: `GET /profile/catalogs` no incluye monitores; no existe `GET /monitors`). No es posible ofrecer un selector amigable de "qué indicador comparar" en V1 sin inventar un endpoint nuevo, lo cual esta etapa prohíbe. **Decisión de diseño**: la tarjeta `periodic` se muestra en el catálogo (es un tipo real y útil) pero su configuración en V1 queda limitada a period_start/period_end (selector de fechas real, sin problema) + un mensaje explícito: *"Este informe requiere un identificador de indicador que hoy no tiene un catálogo navegable — disponible próximamente"* — o, alternativamente, ocultar la generación de `periodic` en V1 y dejar la tarjeta como "próximamente" hasta que exista un catálogo real de monitores. **Se congela la segunda opción** (§34, decisión 6): mostrar la tarjeta informativamente, deshabilitar la generación, con el texto de la limitación — es más honesto que ofrecer un campo de texto libre para un id técnico.

Parámetros interesantes para el futuro (NO V1, documentados como propuesta): un catálogo de "indicadores monitoreados por actividad" que resolvería tanto este GAP como el GAP 12.3 (indicador no es entidad) ya congelado.

## 9. Generación

Un botón único "Generar informe" dentro del panel de configuración expandido, deshabilitado hasta que los campos obligatorios del tipo estén completos (validación puramente de presencia, en frontend, sobre campos que YA vienen de catálogos reales — nunca una validación de reglas de negocio nueva). Al generar: estado "Generando…" (`role="status"`), 1 sola llamada `POST /reports/generate`, transición directa a la vista de detalle con el informe recién creado (sin pasar por una pantalla intermedia de "reporte listo, hacé clic para verlo").

## 10. Visualización

Ver estructura completa en §11 y componentes en §28. La vista de detalle es una sola página larga con secciones colapsables (no pestañas internas) — cada sección usa `<details>` para el contenido secundario (evidencia, trazabilidad, versiones) y permanece expandida por defecto para el contenido primario (resumen ejecutivo, cambios/riesgos/oportunidades reales) — mismo criterio de progresividad ya aplicado en Radar.

## 11. Estructura por tipo de informe + Matriz de los 7 tipos

Estructura visual general (cuando la sección tiene contenido real):

```text
ENCABEZADO (título, tipo, fecha de generación, alcance en lenguaje llano)
  ↓
RESUMEN EJECUTIVO (claims de importancia alta/crítica, máx. 10 — SIEMPRE presente en los 6 tipos estándar, contrato §5)
  ↓
SITUACIÓN ACTUAL (solo si el tipo pasa por perfil: personalized, executive-con-perfil)
  ↓
CAMBIOS RELEVANTES / TENDENCIAS / IMPACTOS
  ↓
RIESGOS  /  OPORTUNIDADES
  ↓
DECISIONES CONSIDERADAS
  ↓
RECOMENDACIONES
  ↓
INCERTIDUMBRE (si existe evidencia débil o contradictoria)
  ↓
COMPARACIÓN DE PERÍODO (solo `periodic` — reemplaza TODO lo anterior, ver más abajo)
  ↓
EVIDENCIA (resumen por nivel) + FUENTES
  ↓
NARRATIVA (colapsada, opt-in)
```

**Hallazgo de diseño importante**: `periodic` NO comparte la estructura anterior de forma útil — `reports/build.js#generatePeriodicReport()` genera un `body` donde `changes/risks/opportunities/decisions/recommendations/current_situation` son SIEMPRE marcadores vacíos (`claims:[]` fijo, contrato §16) y el contenido real vive exclusivamente en `body.comparisons`. Mostrar `periodic` con el mismo layout que los demás lo haría ver "vacío/roto". **Decisión de diseño**: `periodic` usa una plantilla de detalle propia y más corta — Encabezado → Comparación de período (destacada) → Fuentes — sin renderizar las secciones estándar vacías.

### Matriz de los 7 tipos (contrato §4/§6/§8/§16, verificado por código y ejecución)

| Tipo | Objetivo | Entrada | Alcance | Personalización | Temporalidad | Secciones con contenido posible | Inteligencia | Decisiones | Recomendaciones | Evidencia | Trazabilidad | Narrativa | Estados especiales |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `sectorial` | Analizar 1 actividad en profundidad | `activityId` | 1 actividad | No | No | resumen, cambios, tendencias, impactos, riesgos, oportunidades, decisiones, recomendaciones, incertidumbre | Sí | Sí | Sí | Sí | Sí (completa) | Sí (ambos modos) | vacío total si la actividad no tiene señales |
| `market` | Analizar un mercado destino | `marketId` (+ `activityIds?`) | 1 mercado × N actividades | No | No | igual que `sectorial`, filtrado por `source.markets` | Sí | Sí | Sí | Sí | Sí | Sí | `marketId` inválido → error (ver §24) |
| `risk` | Concentrar solo riesgos | `activityIds?` | N actividades (default: todas) | No | No | resumen, riesgos, decisiones, recomendaciones, incertidumbre (`opportunities`/`changes` no se completan con ese foco) | Sí (solo `type=risk`) | Sí | Sí | Sí | Sí | Sí | típicamente disperso si "todas las actividades" es muy amplio (GAP UX, §33) |
| `opportunity` | Concentrar solo oportunidades | `activityIds?` | N actividades | No | No | simétrico a `risk` | Sí (solo `type=opportunity`) | Sí | Sí | Sí | Sí | Sí | igual que `risk` |
| `personalized` | "¿Qué cambió para mí?" con todo mi perfil | `profileId` | actividades del perfil | **Sí, completa** | No | resumen, situación actual, cambios, tendencias, impactos, riesgos, oportunidades, decisiones, recomendaciones, incertidumbre | Sí | Sí | Sí | Sí | Sí | Sí | GAP 12.6 (sin actividades ≡ sin señales, mismo mensaje que Radar) |
| `executive` | Síntesis compacta (con o sin perfil) | `profileId?` | perfil o global (solo `high`/`critical`) | Opcional | No | igual que `sectorial`, naturalmente disperso por scope acotado (§14) | Sí | Sí | Sí | Sí | Sí | Sí | sin perfil, puede recorrer TODA la base de actividades (costo de lectura variable, §26) |
| `periodic` | Comparar 2 períodos de un indicador | `monitorId`, `field`, `periodStart`, `periodEnd` (+`activityId?`) | 1 indicador | No | **Sí — el único con comparación real** | **solo comparación** (resto = NO DISPONIBLE por diseño del tipo) | No (no pasa por `intelligence`) | No | No | No (sin evidence_level propio) | Limitada — sin `claims` no personalizados, la trazabilidad de `getTraceability()` no tiene nada que recorrer para este tipo (`sourceIds:[]`) | Sí (pero sobre una sola sección) | requiere `monitorId`/`field` sin catálogo (GAP §8); `periodEnd<=periodStart` → error de validación |

## 12. Personalización

`personalized` (y `executive` con perfil) son los únicos que aplican `CENTRAL RELEVANCE + CONTEXT = PERSONALIZED RELEVANCE`. La vista de detalle debe mostrar explícitamente, en el encabezado, qué perfil generó el informe (nombre del perfil, no solo su id) y qué dimensiones influyeron: actividad principal/secundarias, mercados, productos/insumos declarados. **Prioridades**: se muestran como criterio de orden ya aplicado (el resumen ejecutivo ya viene ordenado por importancia — nunca se re-explica "esto se muestra primero porque tenés esta prioridad", ya que `priority_match` no es booleano visible en los claims de un reporte, contrato §8 — no inventar esa explicación). **Restricciones**: si el perfil tiene restricciones declaradas, la interfaz puede mostrarlas como referencia del perfil (dato real, ya visible en Perfil Productivo) pero **nunca** debe insinuar que influyeron en qué apareció en el informe — mismo texto de honestidad ya usado en Radar para este GAP.

## 13. Multiactividad

Igual criterio que Radar (`arquitectura-radar-ux.md` §12): cada claim lleva su propio `activity_id` real, mostrado con el mismo `activity-badge` reutilizado (§28) — sin agrupar ni fusionar. Con el perfil de prueba (ganadería+soja+aceites), un informe `personalized` mostraría 3 grupos de claims por actividad dentro de cada sección (riesgos, oportunidades, etc.), cada uno con su badge — nunca "la actividad principal primero" por diseño (contrato §9, sin privilegio verificado). Las relaciones cruzadas (una señal afecta 3 actividades) se perciben porque los 3 claims comparten `references.signal_id` — no se construye una vista de "grafo de relaciones" nueva (fuera de alcance, no pedido).

## 14. Narrativa determinística / IA

Sección "Narrativa" al final del informe, **colapsada por defecto** (no es el contenido principal, principio 4 de §2). Dos botones claramente distintos, nunca uno seleccionado por omisión de forma ambigua:

- **"Generar narrativa" (determinística, por defecto)**: sin advertencia adicional (0 costo externo, ya lo dice el contrato). Un clic, `POST {mode:'deterministic'}`, se muestra el texto corrido con cada párrafo enlazable a su(s) claim(s) de origen.
- **"Generar narrativa con IA (opcional)"**: visualmente separado (no un simple toggle al lado del anterior), requiere una confirmación explícita con este texto exacto (o equivalente): *"Esto envía la información de este informe — incluyendo datos de tu perfil productivo si es un informe personalizado — a un proveedor de inteligencia artificial externo (DeepSeek u OpenRouter). No se activa automáticamente ni se usa para generar el contenido del informe, solo para redactarlo en lenguaje corrido."* Solo tras confirmar, `POST {mode:'ai'}`. Si el backend responde `503 ai_unavailable` (sin API key configurada), se muestra tal cual el mensaje + el `hint` ya provisto por el backend — no se oculta ni se reinterpreta.

Ninguna narrativa se acepta sin pasar por `validation` (ya la hace el backend, `status:'validated'|'rejected'`) — si `status==='rejected'`, la interfaz lo muestra explícitamente (badge de estado, nunca oculto) en vez de presentar el texto como si fuera confiable.

## 15. Evidencia

Patrón progresivo de 3 niveles, igual principio que `evidence-panel` de Radar pero con un nivel más (Informes SÍ llega hasta la fuente real):

```text
Claim (siempre visible)
   ↓ "Ver evidencia" (expande in situ, 0 llamadas — ya viene en el claim: evidence_level, confidence, references)
   ↓ "Ver trazabilidad completa" (1 llamada lazy, GET /reports/:id/traceability, UNA vez por informe abierto — cacheada en memoria de la página, no una llamada por claim)
   ↓ Fuente (institución, nombre, tipo — ya resuelta en la respuesta de traceability)
```

## 16. Confianza

Reutiliza exactamente `CONFIDENCE_LABEL`/`EVIDENCE_LABEL`/`RELEVANCE_LABEL` de `web/src/utils/labels.js` (ya centralizados desde Radar) — nunca una escala nueva, nunca combinada en un número. Un claim puede mostrar hasta 3 dimensiones simultáneas y distintas (relevancia del claim, evidence_level, y las 4 subdimensiones de `confidence` cuando estén presentes) — cada una con su propio badge de texto, nunca un solo indicador fusionado. Ninguna reemplaza a otra.

## 17. Naturaleza epistémica

`epistemic_status` (GAP 14.1 del contrato) **no se usa** en esta etapa — no existe en ningún claim real. No se diseña ningún control ni badge que dependa de ese campo. Se documenta como mejora V2 potencial si el motor llegara a poblarlo (§33), sin comprometer el diseño actual a su existencia futura.

## 18. Trazabilidad

Ver §15. Cadena completa disponible: `claim → signal → change → capture → source` (contrato §15) — más profunda que Radar. Se presenta como una lista simple de pasos con sus ids/nombres reales (mismo formato que `evidence-panel`), nunca como un grafo interactivo (fuera de alcance, no aporta valor proporcional al esfuerzo). Decisión→recomendación: mismo hedge ya establecido en Radar ("recomendación relacionada con esta actividad", nunca "generada por esta decisión exacta" — GAP 17.7, contrato §15 lo reconfirma para Informes).

## 19. Inteligencia

Cada claim de riesgo/oportunidad/impacto se presenta con el mismo componente `intelligence-item` ya construido (tipo, evidencia, confianza, relevancia) — sin una vista "Inteligencia" separada (mismo criterio que Radar: es un atributo del claim, no una sección independiente de nivel superior).

## 20. Decisiones y recomendaciones

Reusa `decision-detail`/`recommendation-item` de Radar tal cual — mismos 2-alternativas-siempre (`no_action`+accional), mismo "sin best_option". El vínculo decisión→recomendación, cuando el claim de recomendación está anidado bajo un claim de decisión en la misma sección, se etiqueta igual que en Radar (§18). Los 7 tipos de recomendación reales (`monitor/seek_information/prepare/mitigate/pursue_opportunity/adjust/evaluate`) se muestran con la misma tabla de etiquetas ya centralizada.

## 21. Versiones

Panel "Ver versiones" (bajo demanda, `GET /reports/:id/versions`) muestra la cadena real: versión, fecha, estado (`generated`/`superseded`), con la versión actualmente abierta resaltada (no reordenada — mismo orden que entrega el backend). Un informe `superseded` se puede seguir abriendo (no se oculta el historial) pero con un aviso claro: "Esta es una versión anterior — existe una versión más reciente con el mismo alcance" + enlace a la vigente. **No se diseña comparación visual campo-a-campo entre versiones** — el backend no expone un diff, solo la cadena de ids/fechas/estados (no inventar esa capacidad).

## 22. Historial

Pestaña "Mis informes": tabla/lista de `listReports()` con las columnas reales disponibles — tipo, título, estado, versión, fecha (**no** actividad/período como columnas propias, porque `listReports()` no las devuelve; si se necesitaran, requerirían abrir cada informe, lo cual no se hace en la lista por costo). Filtro por tipo (`?type=`, ya soportado) como `<select>` simple — **sin filtro por estado ni paginación** (GAP 25.1 del contrato, documentado, no inventado). Si no hay perfil activo, la pestaña muestra un estado honesto ("Necesitás un perfil activo para ver tu historial") en vez de listar informes de cualquier perfil (mitigación de diseño frente a la ausencia de auth, §25).

## 23. Estados

| Estado | Qué muestra | Qué puede hacer el usuario | Llamada | ¿Nueva generación? | ¿IA? | ¿Search? |
|---|---|---|---|---|---|---|
| A. Sin perfil | catálogo igual (7 tarjetas), pestaña "Mis informes" deshabilitada con CTA a `/perfil` | ir a `/perfil`, generar tipos no personalizados (`sectorial`/`market`/`risk`/`opportunity`) | ninguna | — | No | No |
| B. Sin actividades (perfil vacío) | igual que A pero `personalized`/`executive-con-perfil` muestran aviso antes de generar | completar perfil o generar igual (resultará en GAP 12.6, ver I) | ninguna hasta generar | — | No | No |
| C. Sin informes (historial vacío) | "Todavía no generaste ningún informe" + CTA a "Generar" | generar uno | `GET /reports?profile_id=` (0 resultados) | — | No | No |
| D. Catálogo disponible | 7 tarjetas | seleccionar una | ninguna | — | No | No |
| E. Configurando | panel expandido con campos reales | completar y confirmar | ninguna | — | No | No |
| F. Generando | `role="status"`, "Generando informe…" | esperar | `POST /reports/generate` en curso | Sí (esta es la generación) | No | No |
| G. Informe generado | estructura completa (§11) | explorar, expandir evidencia, generar narrativa | 0 adicionales | No | No | No |
| H. Informe vacío (todas las secciones sin contenido) | documento real con marcadores honestos (`no_relevant_information` etc.) en cada sección, nunca "error" | volver, probar otro alcance | 0 | No | No | No |
| I. Información insuficiente (GAP 12.6 en `personalized`/`executive`) | mensaje único, honesto, sin distinguir "sin actividades" de "sin señales" | igual que Radar/Situación | 0 | No | No | No |
| J. Evidencia contradictoria | claim de incertidumbre visible + recomendación no categórica, nunca oculto | leer, expandir evidencia | 0 | No | No | No |
| K. Error de validación (400 real, o 500 reclasificado por mensaje conocido — §24) | mensaje claro sobre qué corregir en la configuración | corregir y reintentar | — | No (no se generó) | No | No |
| L. Error de servidor (500 genuino) | mensaje genérico, sin detalle interno | reintentar más tarde | — | No | No | No |
| M. Error de red | "no se pudo conectar" (reusa `describeApiError`) | reintentar | — | No | No | No |
| N. Informe inexistente (404 al abrir por `?report=`) | mensaje + vuelta al catálogo/historial | volver | `GET /reports/:id` → 404 | No | No | No |
| O. Informe superseded | ver §21 | abrir la versión vigente | 0 adicionales (ya viene marcado en el objeto) | No | No | No |
| P. Historial disponible | lista real | abrir cualquiera | `GET /reports/:id` al abrir | No | No | No |
| Q. Narrativa IA opt-in | botón + texto de advertencia, sin generar hasta confirmar | confirmar o cancelar | 0 hasta confirmar | No | No (hasta confirmar) | No |
| R. Narrativa IA rechazada/no disponible | `503 ai_unavailable` mostrado tal cual + hint | usar modo determinístico | — | No | No (falló antes de llamar) | No |

## 24. Errores

**Estrategia frente al defecto documentado (contrato §21, GAP 21.1: `POST /reports/generate` responde 500 en vez de 400 para params inválidos)**:

1. **Prevención primaria**: todo valor enviado a `/reports/generate` sale de un catálogo/selector real (§8) — el frontend, bien construido, **nunca** debería producir el caso "activityId ausente" o "type desconocido" en operación normal.
2. **Reconocimiento secundario**: si pese a eso llega un 500 desde específicamente `/reports/generate`, el frontend inspecciona el `message` recibido (ya en texto llano, nunca un stack trace) por los prefijos reales y conocidos que emiten los `selectScope()` (`"reporte sectorial:"`, `"reporte de mercado:"`, `"reporte periódico:"`, `"reporte personalizado:"`, `"generateReport: tipo de reporte desconocido"`, etc.) — si coincide, se muestra como **estado K (error de validación)** con el mensaje tal cual (ya es humano-legible), nunca como "error del servidor". Esto NO es una revalidación de reglas de negocio en frontend — es una clasificación de PRESENTACIÓN sobre un mensaje que el backend ya generó y devolvió.
3. **Cualquier 500 sin ese patrón** (o de cualquier otro endpoint) se trata como **estado L**, genérico, reusando `describeApiError()` sin exponer el mensaje crudo — un 500 real no debe disfrazarse de simple error de configuración.

Esta estrategia es puramente de PRESENTACIÓN (interpretar un mensaje de texto ya recibido), no de lógica de negocio — no reimplementa las validaciones del backend, solo decide cómo mostrarlas.

## 25. Seguridad

- Sin autenticación (heredado, todo el sistema) — mitigación de diseño ya aplicada en §22 (no listar informes sin un perfil activo elegido explícitamente por el dispositivo).
- **Narrativa como texto no confiable**: todo párrafo de narrativa (determinística o IA) se inserta vía `el()`/`textContent` (mismo mecanismo ya usado en toda la app, nunca `innerHTML`) — un párrafo de IA nunca se interpreta como HTML/markdown, siempre como texto plano, incluso si contuviera caracteres que parezcan marcado. No se introduce ninguna librería de sanitización porque no se renderiza HTML en ningún punto (mismo principio ya aplicado y verificado en Situación/Radar).
- Ninguna URL de fuente se construye dinámicamente a partir de datos del backend para navegación automática (las fuentes se muestran como texto — nombre/institución —, no como enlaces salientes, salvo que `knowledge/sources/` ya declare una URL propia y estable, en cuyo caso es un `<a>` real con `rel="noopener"`, mismo criterio que cualquier enlace externo de la app — no implementado en esta etapa, solo especificado si se decide agregar).
- API keys/config de IA nunca viajan al frontend (confirmado en el contrato, server-side únicamente).

## 26. Costos

```text
Entrar a /informes (con perfil activo): 1 × GET /reports?profile_id= (historial) — 0 IA, 0 search, 0 HTTP externo
Generar cualquier tipo: 1 × POST /reports/generate — 0 IA, 0 search, 0 HTTP externo
Abrir un informe del historial: 1 × GET /reports/:id
Ver evidencia básica: 0 llamadas (ya en el claim)
Ver trazabilidad completa: 1 × GET /reports/:id/traceability (lazy, una vez por informe, cacheada)
Ver versiones: 1 × GET /reports/:id/versions (lazy)
Narrativa determinística: 1 × POST .../narrative {mode:'deterministic'} — 0 IA, 0 search, 0 HTTP externo
Narrativa IA (opt-in, confirmado): 1 × POST .../narrative {mode:'ai'} — 1 HTTP externo, 1 IA, 0 search
Cambiar filtros/expandir secciones ya cargadas: 0 llamadas
```

Ninguna interacción de exploración (filtrar, expandir, cambiar de sección) regenera ni vuelve a pedir el informe — todo el `body`/`claims` ya está en memoria tras la primera carga.

## 27. Arquitectura de llamadas

Resumen explícito por interacción (detalle en §26):

| Interacción | Llamada |
|---|---|
| Entrar en `/informes` | 1 (historial, solo si hay perfil activo) |
| Seleccionar tipo / configurar | 0 |
| Generar | 1 |
| Abrir informe (historial o deep-link) | 1 |
| Consultar evidencia básica | 0 |
| Consultar trazabilidad | 1 (lazy, cacheada) |
| Consultar versiones | 1 (lazy, cacheada) |
| Cambiar filtro/sección/expandir | 0 |
| Generar narrativa (cualquier modo) | 1 |

## 28. Componentes reutilizables

| Componente | Reuso |
|---|---|
| `intelligence-item` | Claims de riesgo/oportunidad/impacto/tendencia — mismo shape de props |
| `recommendation-item` | Claims de recomendación |
| `decision-detail` | Claims de decisión con sus alternativas |
| `evidence-panel` | Base conceptual para el nivel 1 de evidencia (adaptado, ver §29, porque Informes SÍ llega a capture/source) |
| `situation-summary` | Conteos del resumen ejecutivo (adaptado a "claims de alta importancia" en vez de "situaciones/riesgos/oportunidades/monitor") |
| `activity-badge` | Identificación de actividad en cada claim |
| `status-message` | Todos los estados de §23 |
| `.button--tab` / `activity-switcher` | Pestañas Generar/Mis informes, filtro de tipo en historial |
| `RECOMMENDATION_TYPE_LABEL`, `EVIDENCE_LABEL`, `CONFIDENCE_LABEL`, `RELEVANCE_LABEL`, `TYPE_LABEL` (`utils/labels.js`) | Directamente, sin cambios |

## 29. Nuevos componentes

| Componente | Responsabilidad | Por qué es nuevo |
|---|---|---|
| `report-catalog-card` | Presentar 1 de los 7 tipos con su ficha descriptiva + panel de configuración inline | No existe un equivalente — Radar no tiene "tipos configurables" |
| `report-config-panel` | Formulario específico por tipo (usa selects de catálogos reales) | Configuración previa a generación es exclusiva de Informes |
| `report-header` | Título, tipo, fecha, alcance en lenguaje llano, badge de estado (`generated`/`superseded`) | Encabezado de documento, distinto del `radar-header` (que resume un estado vigente, no un documento cerrado) |
| `report-comparison` | Presentar el claim único de `periodic` (previous_value→new_value, período, dirección) | `periodic` es estructuralmente distinto (§11), amerita su propio renderer, no forzar `change-item` |
| `traceability-panel` | Nivel 3 de evidencia (capture/source real) — distinto de `evidence-panel` de Radar porque SÍ puede llegar hasta la fuente | Informes tiene más profundidad de trazabilidad que Radar (contrato §15) |
| `narrative-section` | Las 2 opciones (determinística/IA), confirmación de IA, render de párrafos con `claim_ids` enlazables | No existe hoy nada equivalente a "narrativa" en Situación/Radar |
| `report-history-list` | Lista de `listReports()` con filtro por tipo | Específico del historial de Informes |
| `report-versions-panel` | Cadena de versiones (§21) | Específico de Informes (Radar/Situación no versionan nada visible al usuario) |

**No se crean**: componentes separados por tipo de informe (serían 7 variantes de lo mismo — un solo `report-catalog-card`/vista de detalle parametrizada cubre los 6 tipos estándar; solo `periodic` amerita su propio `report-comparison` por ser estructuralmente distinto, no por ser "otro tipo más").

## 30. Responsive

Mismo sistema único ya validado (Radar/Situación/Perfil), sin una interfaz de escritorio distinta de la móvil:

- **Móvil (360-390px)**: catálogo en 1 columna, panel de configuración ocupa el ancho completo al expandirse, secciones del informe en columna única, `<details>` para todo lo secundario.
- **Tablet (768px)**: catálogo en 2 columnas, resto igual.
- **Escritorio (1024-1440px)**: catálogo en 3 columnas; la vista de detalle puede usar 2 columnas para (contenido principal | panel de evidencia/trazabilidad) **solo si eso no oculta información en ningún ancho menor** — decisión final de layout de 2 columnas se posterga a 2E-2 si el volumen real de contenido lo justifica, no es un requisito de V1.

## 31. Accesibilidad

Mismo estándar ya construido y auditado en Radar (Paso 2D-2/2D-3): `<h1>`→`<h2>` por sección, `<details>/<summary>` nativos, `role=status`/`role=alert`, `aria-pressed` en tabs, controles nativos únicamente, foco preservado tras interacciones que reconstruyen el árbol (mismo mecanismo de `data-key`/`data-filter-key` ya corregido en Radar — reutilizado, no reinventado). Un informe debe poder leerse y explorarse completo solo con teclado (tab a través de tarjetas → Enter para expandir configuración → completar selects → generar → tab a través de secciones/`<details>`).

## 32. Claro/Oscuro/Sistema

Cero tokens/colores nuevos — mismo set ya verificado con tests de contraste (`web/tests/contrast.test.js`, incluida la extensión de Paso 2C-2 para badges sobre `--color-surface`). El objetivo de "autoridad + claridad" (prompt §29) se logra con jerarquía tipográfica (pesos 600/700 ya definidos en tokens) y estructura, no con decoración nueva — ninguna tarjeta con sombras/gradientes fuera del sistema ya construido.

## 33. GAPs conocidos

### Heredados (reconfirmados, sin corregir)

12.1 (matizado: `periodic` sí tiene valores reales, contrato §16), 12.2 (constraints sin influencia), 12.3 (indicador no es entidad — agrava la configuración de `periodic`, ver abajo), 12.5 (sin comparación automática de todo el perfil — solo `periodic` puntual), 12.6 (sin actividades ≡ sin señales en `personalized`/`executive`), 17.2 (trend no es intelligence unit), 17.3 (confianza de situación no agregada), 17.5 (last_seen_at no es "última actualización"), 17.6 (sin information_value explícito), 17.7 (decisión↔recomendación por actividad), 17.8 (defer no alcanzable).

### De Informes (2E-0, reconfirmados con impacto de diseño)

21.1 (500 en vez de 400 en `/reports/generate` — tratamiento en §24), 14.1 (`epistemic_status` no usado — sin impacto en diseño, §17), 22.1 (privacidad del modo IA sobre datos de perfil — comunicado explícitamente, §14), 25.1 (sin filtro por estado/paginación en `GET /reports` — V1 sin esos filtros, §22).

### Nuevo de esta etapa (2E-1)

**GAP-UX-1**: no existe catálogo navegable de `monitorId`/`field` para configurar `periodic` desde la interfaz (agrava 12.3). **Decisión**: tarjeta visible, generación deshabilitada con mensaje explícito hasta que exista tal catálogo (propuesta de una etapa futura de backend, fuera de alcance de 2E-1/2E-2).

## 34. Decisiones de diseño congeladas

1. `/informes` es una sola página con estado interno (pestañas + panel de detalle) — no se agregan rutas nuevas a `router.js`.
2. Deep-link liviano vía `?report=<id>`, leído una vez al montar (mismo patrón ya especificado para Radar, tampoco implementado allí todavía).
3. Riesgo/oportunidad/cambios/decisiones/recomendaciones de un informe NO se dividen en secciones globales de nivel superior salvo Recomendaciones (mismo criterio que Radar) — con la salvedad de que aquí SÍ hay "Situación actual" como sección propia cuando el tipo pasa por perfil, porque el contrato la expone explícitamente (`current_situation`) a diferencia de Radar, que la resume de otra forma.
4. `periodic` usa un renderer de detalle propio y más corto (`report-comparison`), no la plantilla estándar de secciones.
5. Configuración exclusivamente por catálogos reales — nunca campos de texto libre para identificadores internos.
6. `periodic` visible en catálogo pero con generación deshabilitada en V1 (GAP-UX-1) hasta que exista un catálogo de indicadores.
7. Narrativa siempre colapsada por defecto; modo IA requiere confirmación explícita con el texto de advertencia de §14, nunca activación automática.
8. Trazabilidad completa es una llamada lazy y cacheada por informe abierto, nunca prefetched por claim.
9. Estrategia de error 500-vs-400 (§24): reconocimiento por prefijo de mensaje conocido, sin reimplementar validación.
10. Historial (`GET /reports`) solo se consulta con un perfil activo elegido — nunca se listan informes de "cualquier perfil" por la ausencia de autenticación.

## 35. Criterios de aceptación para 2E-2

**Funcional**: navegación correcta dentro de `/informes` sin rutas nuevas; los 7 tipos seleccionables y generables (excepto `periodic`, deshabilitado por GAP-UX-1); configuración usando solo catálogos reales; generación produce un informe real persistido; visualización respeta la matriz de §11 (incluida la plantilla especial de `periodic`); historial lista informes reales; versiones se muestran sin inventar comparación; evidencia progresiva de 3 niveles; trazabilidad real hasta la fuente; multiactividad sin fusionar ni privilegiar la actividad principal; personalización usa el perfil activo real.

**Integración**: cero endpoints nuevos (los 8 ya documentados alcanzan); cero recálculo de relevancia/inteligencia/decisión/recomendación en frontend; cero llamadas innecesarias (arquitectura de §27 respetada al pie de la letra, verificable con un `fetchImpl` contador igual que en Radar); narrativa IA nunca se dispara sin confirmación explícita del usuario.

**UX**: los 18 estados de §23 implementados y distinguibles; errores comprensibles según la estrategia de §24; navegación coherente con Situación/Radar (mismo lenguaje visual); responsive en los 5 anchos de referencia; Claro/Oscuro/Sistema sin color nuevo.

**Accesibilidad**: navegable 100% por teclado; foco preservado tras reconstrucciones de árbol (reusar el mecanismo ya corregido en Radar); `<details>/<summary>` para todo contenido secundario; `role=status`/`role=alert` correctos; contraste ya verificado, sin necesidad de nueva medición salvo que se introduzca una superficie de color realmente nueva (no prevista).

**Seguridad**: toda narrativa tratada como texto plano no confiable (nunca `innerHTML`); ningún dato interno (SQL, stack traces, API keys) expuesto en ningún estado de error; historial nunca expuesto sin perfil activo elegido.

---

**Estado de esta etapa**: diseño completo, sin implementación. Ningún archivo de `web/src/{pages,components,services}` fue creado ni modificado. Ningún archivo de `backend/`/`knowledge/`/`docs/arquitectura/contrato-informes.md` fue tocado.
