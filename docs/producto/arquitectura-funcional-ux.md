# Arquitectura funcional y UX/UI — Central de Inteligencia Productiva

> Etapa de **diseño**, no de implementación. Ningún componente visual se construye en esta etapa; el resultado es la especificación funcional y de sistema de diseño que gobernará la implementación posterior en `web/` (y, por reutilización, `desktop/` y `mobile/`).
>
> Regla aplicada en todo el documento: la interfaz **consume** capacidades ya construidas en `backend/` (que a su vez consume `knowledge/` como conocimiento de solo lectura). No se propone ninguna lógica de negocio nueva, ninguna fuente nueva, ninguna taxonomía nueva. Donde la interfaz necesita algo que el backend no expone hoy, se documenta como GAP (sección 11) — no se implementa aquí.

---

## 0. Diagnóstico de la arquitectura actual

### 0.1 Cadena funcional real (verificada en código, no supuesta)

```
FUENTE (knowledge/sources) → MONITOR (knowledge/monitoring) → CAPTURA → NORMALIZACIÓN
  → CAMBIO (change-detection) → SEÑAL (signals) → RELEVANCIA CENTRAL (relevance-engine)
  → INTELIGENCIA (risk/opportunity/impact) → DECISIÓN (alternativas, nunca best_option)
  → RECOMENDACIÓN (statement regulado por escalera de evidencia)
```

Personalización (capa aparte, nunca reprocesa lo anterior):

```
PERFIL PRODUCTIVO (profiles + profile_activities/markets/products/inputs/priorities/constraints)
  → getChanges()/getPersonalizedRelevance() → "¿qué cambió para mí?"
```

Agregación temporal (consume lo anterior, no genera intelligence nueva):

```
RADAR (situations agrupadas por topic_id+actividad, status por evidencia reciente,
        trend solo si ya hay ≥3 observaciones confirmadas, priorización sin score único)
```

Presentación (consume `claims`, nunca genera intelligence nueva):

```
REPORTE (7 tipos, claims deterministas, snapshot+versión+trazabilidad)
  → NARRATIVA (modo determinístico por defecto; modo IA opcional, validado 100% del tiempo)
```

### 0.2 Endpoints existentes (`backend/api/router.js`)

| Método | Ruta | Devuelve |
|---|---|---|
| GET | `/health` | estado del servidor |
| GET | `/pipeline/status`, `/pipeline/runs` | última corrida / historial de corridas |
| POST | `/pipeline/run` | ejecuta el pipeline (uso operativo/test, no de usuario final) |
| GET | `/signals`, `/intelligence`, `/decisions`, `/recommendations` | volcado crudo, últimas 50 filas, **sin filtro por perfil ni por id individual** |
| GET/POST | `/profiles` | listar / crear perfil |
| GET/PUT/DELETE | `/profiles/:id` | leer / actualizar / borrar perfil |
| GET/PUT | `/profiles/:id/activities` | actividades del perfil |
| PUT | `/profiles/:id/{markets,products,inputs,priorities,constraints}` | resto del perfil |
| GET | `/profiles/:id/relevance` | relevancia personalizada |
| GET | `/profiles/:id/changes` | "¿qué cambió para mí?" — objeto completo (señal+inteligencia+decisión+recomendación anidados) |
| GET | `/profiles/:id/radar?view={changes\|situations\|risks\|opportunities\|monitor\|recommendations\|all}` | Radar Productivo |
| GET | `/profiles/:id/intelligence`, `/profiles/:id/recommendations` | subconjuntos derivados de `changes` |
| GET | `/reports` | listar reportes (filtro `type`, `profile_id`) |
| POST | `/reports/generate` | generar reporte `{type, ...params}` |
| GET | `/reports/:id` | reporte completo (`body`, `claims`, `sources`, `snapshot`) — nunca recalcula |
| GET | `/reports/:id/traceability` | cadena claim→…→fuente |
| GET | `/reports/:id/versions` | cadena de versiones |
| GET/POST | `/reports/:id/narrative` | leer última narrativa / generar (`mode: deterministic\|ai`) |
| POST | `/reports/:id/narrative/validate` | validar una narrativa (propia o la última almacenada) |

### 0.3 Lo que el backend garantiza y la interfaz debe respetar

- Una **relevancia central** (nunca inflada) y una **relevancia personalizada** (nunca recalculada al margen de `personalize.js`) son cosas distintas — no colapsar en una sola cifra visual.
- `evidence_level` (`strong/moderate/structural_relationship/limited/insufficient/conflicting`), `confidence`, relevancia y prioridad de recomendación son **cuatro dimensiones independientes** — el backend nunca las combina en un score único y la interfaz tampoco debe hacerlo.
- Una decisión **siempre** incluye una alternativa `no_action` (nunca solo acciones) y nunca trae `best_option`.
- Una recomendación con `evidence_level` débil (`insufficient`/`conflicting`) produce `strength='none'` o `monitoring_only` — el lenguaje ya viene regulado por el backend (`statement`); la interfaz no debe reformular ni intensificar ese texto.
- `radar_situations` distingue `emerging/active/persistent/resolved` por evidencia observada, no por un campo editable.
- Un `trend` solo existe si `radar/trend.js` lo confirmó (≥3 observaciones) — nunca se debe inferir tendencia visualmente a partir de 1-2 puntos.
- La narrativa (modo IA) siempre pasó por `validateNarrative()`; si `status='rejected'` la interfaz **no debe mostrarla** como si fuera contenido válido.

---

## 1. Arquitectura funcional propuesta

Cuatro dominios funcionales, mapeados 1:1 a capacidades de backend ya existentes — ninguno introduce lógica nueva:

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. SITUACIÓN            → Radar Productivo, Cambios, "¿qué cambió    │
│    (qué está pasando)     para mí?"  — GET .../radar, .../changes     │
├─────────────────────────────────────────────────────────────────────┤
│ 2. INTELIGENCIA          → riesgos/oportunidades/impactos/tendencias, │
│    (qué significa)         con evidencia/confianza/horizonte          │
├─────────────────────────────────────────────────────────────────────┤
│ 3. RESPUESTA             → decisiones (alternativas) y recomendaciones│
│    (qué considerar)        (nunca "qué hacer")                        │
├─────────────────────────────────────────────────────────────────────┤
│ 4. SÍNTESIS Y REGISTRO   → informes + narrativa + trazabilidad hasta  │
│    (evidencia, memoria)    la fuente                                   │
└─────────────────────────────────────────────────────────────────────┘
        ↑ todo lo anterior atraviesa PERFIL PRODUCTIVO (quién pregunta)
```

Esto reemplaza la tentación de modelar la navegación por *tabla de base de datos* (una pantalla por `signals`, otra por `intelligence`, otra por `decisions`...) por una organizada según **las cinco preguntas del principio UX central** (sección 4 del prompt). Una misma situación se recorre verticalmente (cambio→significado→impacto→decisión→recomendación→evidencia) sin cambiar de dominio de navegación.

---

## 2. Navegación

### 2.1 Navegación principal (persistente, nivel app)

```
INICIO   RADAR   INFORMES   PERFIL   CONFIGURACIÓN
```

Decisiones explícitas (no todo lo listado en la sección 6 del prompt se vuelve ítem de primer nivel):

- **CAMBIOS** no es un ítem principal separado: `getChanges()` es el insumo del Radar (vista `changes`) y de Inicio; promoverlo a nivel 1 duplicaría el Radar con otro nombre. Queda como **pestaña dentro del Radar** (`?view=changes`).
- **INTELIGENCIA** no es un ítem principal: la inteligencia nunca se consulta "suelta", siempre está anclada a un cambio/situación o a un informe. Se accede desde el detalle de una situación (Radar) o desde un informe — no desde el menú raíz.
- **DECISIONES / RECOMENDACIONES** no es un ítem principal separado: aparecen siempre en el contexto de la situación que las originó (nunca una lista desconectada de "tareas"). El Radar expone una vista `?view=recommendations` como *filtro*, no como sección independiente.
- **INFORMES** sí es principal: tiene identidad propia (generación, versión, vigencia) distinta del flujo de exploración diaria.
- **PERFIL** es principal porque condiciona todo lo demás y el usuario debe poder llegar a él en un clic desde cualquier pantalla.

### 2.2 Navegación secundaria (dentro de una sección)

- Radar: pestañas `Resumen · Situaciones · Riesgos · Oportunidades · Monitorear · Recomendaciones` (mapean 1:1 a `?view=`).
- Informes: pestañas por tipo (`Ejecutivo · Sectorial · Mercado · Riesgo · Oportunidad · Personalizado · Periódico`) + filtro de vigencia (`vigente/superado`).
- Perfil: `Actividades · Mercados · Productos e insumos · Prioridades · Restricciones`.

### 2.3 Navegación contextual (aparece solo cuando hay algo que mostrar)

- Desde cualquier tarjeta de cambio/situación: acceso directo a su **Detalle de Inteligencia** (riesgo/oportunidad/impacto) sin salir del contexto (panel lateral o expansión in-place, no navegación de página completa).
- Desde Inteligencia: acceso a su **Decisión** asociada; desde la Decisión, a su **Recomendación**.
- Desde cualquier claim de un informe o narrativa: **"Ver evidencia"** abre la Trazabilidad (sección 6) sin abandonar la lectura (panel superpuesto, no nueva navegación de primer nivel).
- Multiactividad: si un cambio afecta más de una actividad del perfil, un selector contextual (`Cultivo de soja · Elaboración de aceites · Ganadería bovina`) cambia la interpretación mostrada sin recargar la pantalla.

### 2.4 Breadcrumbs

Solo donde hay jerarquía real de navegación (Informes → tipo → informe → versión). En Radar/Inicio no se usan breadcrumbs: la relación no es de carpetas, es de trazabilidad, y ese recorrido ya tiene su propio componente (`TraceabilityView`, sección 6).

### 2.5 Acciones globales

- Cambio de perfil activo (multiactividad puede implicar más de un perfil, no solo actividades secundarias de uno).
- Selector de tema (Claro/Oscuro/Sistema).
- Acceso directo a Perfil y Configuración.
- **No** hay búsqueda global en la navegación principal (ver sección 8 — deliberado).

---

## 3. Pantallas

| # | Pantalla | Propósito | Endpoint(s) |
|---|---|---|---|
| P1 | **Inicio** | Centro de situación personalizada: qué debería saber ahora | `/profiles/:id/radar?view=all`, `/profiles/:id/changes`, `/reports?profile_id=` |
| P2 | **Radar — Resumen** | Vista agregada de situaciones activas, priorizadas | `/profiles/:id/radar` |
| P3 | **Radar — Situaciones** | Lista de situaciones (emerging/active/persistent) con estado y tendencia | `/profiles/:id/radar?view=situations` |
| P4 | **Radar — Riesgos / Oportunidades / Monitorear** | Filtros semánticos sobre el mismo modelo de situación | `/profiles/:id/radar?view={risks\|opportunities\|monitor}` |
| P5 | **Detalle de situación** | Cambio→significado→impacto→decisión→recomendación→evidencia de una situación, con selector multiactividad | compone datos ya traídos en P2-P4 (sin nueva llamada) |
| P6 | **Detalle de Inteligencia** | Qué se sabe/interpreta/estima, evidencia, confianza, horizonte, actividad | subconjunto embebido en `changes`/situación |
| P7 | **Detalle de Decisión** | Alternativas (incluida `no_action`), factores a favor/en contra, reversibilidad, restricciones | subconjunto embebido |
| P8 | **Detalle de Recomendación** | Statement regulado, fundamento, condiciones, vigencia, prioridad | subconjunto embebido |
| P9 | **Informes — Listado** | Por tipo, con vigencia | `/reports?type=&profile_id=` |
| P10 | **Informe — Lectura** | Cuerpo del informe + narrativa (si existe) + fuentes | `/reports/:id`, `/reports/:id/narrative` |
| P11 | **Informe — Versiones** | Historial de versiones del mismo alcance | `/reports/:id/versions` |
| P12 | **Trazabilidad** (panel, no ruta de primer nivel) | claim → …→ fuente/institución | `/reports/:id/traceability` |
| P13 | **Perfil — Resumen** | Actividad principal/secundarias, mercados, productos, prioridades, restricciones | `/profiles/:id` |
| P14 | **Perfil — Edición** | Formularios por sección (2.2) | `PUT /profiles/:id/*` + **GAP-CRÍTICO** de vocabularios (sección 11) |
| P15 | **Selector/gestión de perfiles** | Alta, cambio y borrado de perfil (multiactividad entre perfiles) | `/profiles` |
| P16 | **Configuración** | Tema (Claro/Oscuro/Sistema), preferencias de accesibilidad locales | sin backend (estado de cliente) |
| P17 | **Estado vacío inicial** (primer acceso) | Onboarding mínimo: crear el primer perfil | `POST /profiles` |

Ninguna pantalla nueva por tipo de dato (`signals`, `intelligence`, `decisions`, `recommendations` sueltos) — esos endpoints de volcado crudo (0.2) son de soporte/depuración, no alimentan pantallas de usuario final.

---

## 4. User journeys

1. **Primer acceso** → P17 (estado vacío) → formulario mínimo (`name` + `main_activity_id`, el resto opcional) → `POST /profiles` → redirige a P1 con el nuevo perfil activo. Si `getChanges()` devuelve `no_relevant_changes`, P1 debe explicarlo como estado normal ("sin cambios relevantes detectados aún"), nunca como error.
2. **Configuración del perfil** → P13 → P14 (por sección) → cada `PUT` exitoso refresca P13; un `ValidationError` (id inexistente en `knowledge/`) se muestra inline, en el campo, con el mensaje ya explicativo que devuelve el backend (no se reformula).
3. **Consulta del resumen** → P1: jerarquía fija — situaciones urgentes primero (riesgo con recomendación de prioridad alta), luego nuevas desde la última visita (timestamp en `localStorage`, sección 9), luego persistentes, luego contexto (mercados sin cambios recientes no se listan, se omiten).
4. **Detección de un cambio** → notificación pasiva en P1 (tarjeta "nuevo") → clic → P5 con el cambio ya expandido.
5. **Exploración de una situación** → P3/P4 → P5 → selector multiactividad si `activity_ids.length > 1` → cada actividad muestra su propia interpretación (riesgo/oportunidad/monitoreo), nunca una fusionada.
6. **Análisis de inteligencia** → P5 → P6: se muestran explícitamente por separado `evidence_level`, `confidence`, relevancia y prioridad (nunca combinados).
7. **Consulta de decisión** → P6 → P7: alternativas listadas incluyendo siempre "No actuar / Monitorear"; ninguna alternativa se marca visualmente como "la elegida".
8. **Consulta de recomendación** → P7 → P8: `statement` se muestra tal cual (texto regulado), con `priority`/`evidence_level`/`valid_from` visibles: nunca un botón "Ejecutar" o "Aceptar" — solo "Marcar como revisada" (estado local de lectura, no cambia `status` en backend).
9. **Lectura de informe** → P9 → P10: cuerpo por secciones (`report.body`), narrativa arriba si `status='validated'`; si no hay narrativa generada, botón "Generar narrativa" (modo determinístico por defecto; modo IA requiere confirmación explícita, ver 5.4/9).
10. **Trazabilidad hasta la fuente** → desde cualquier claim (P10) o desde P6/P7/P8 → P12 (panel) → cadena completa; si `chain.source_id` falta (rama no meteorológica sin captura, o claim sin `signal_id` — p. ej. un claim `decision`/`recommendation` sin señal directa), se muestra el tramo disponible y se rotula explícitamente el punto donde la cadena no continúa, nunca se inventa el eslabón faltante.
11. **Modificación del perfil** → P13/P14, igual que journey 2, en cualquier momento — cambia el resultado de P1/Radar en la siguiente consulta (no reprocesa nada retroactivamente, es un recálculo de personalización en el momento de la consulta, tal como hace `personalize.js`).
12. **Consulta desde mobile** → misma navegación que 2.1 colapsada a barra inferior (5 ítems caben); P5 pasa de panel lateral a pantalla completa con botón "volver"; selector multiactividad pasa de fila de pestañas a menú desplegable (sección 10).

---

## 5. Arquitectura de componentes

### 5.1 Estructura (`web/src/`)

```
components/   — presentacionales, reusables, sin fetch propio
modules/      — por dominio funcional (radar, informes, perfil), orquestan componentes + datos
pages/        — una por ruta de 3
services/     — cliente HTTP hacia backend/api (fetch tipado, sin lógica de negocio)
state/        — perfil activo, tema, cache de lecturas (P1 "nuevo/histórico")
styles/       — tokens (sección 7) + globales
utils/        — formateo (fechas, porcentajes) — nunca cálculo de relevancia/evidencia
```

### 5.2 Componentes semánticos reutilizables (evitan duplicación por tipo)

| Componente | Reemplaza la tentación de crear | Responsabilidad |
|---|---|---|
| `SituationCard` | `RiskCard`, `OpportunityCard`, `TrendCard` separadas | una tarjeta, `kind` deriva del dato (`risk_activities`/`opportunity_activities`/`trend.status`) |
| `EvidenceBadge` | badges de color sueltos por componente | traduce `evidence_level` a texto+ícono+color, nunca solo color (sección 12) |
| `ConfidenceIndicator` | reimplementación de confianza dentro de cada tarjeta | única fuente visual para `confidence.analysis_confidence` |
| `RelevanceIndicator` | mezclar relevancia con prioridad | únicamente relevancia (central u/o personalizada, explícito cuál) |
| `PriorityIndicator` | — | únicamente prioridad de recomendación |
| `DecisionPanel` | un componente por `decision_type` | alternativas + `no_action` siempre visible |
| `RecommendationPanel` | — | `statement` + fundamento + vigencia; nunca un CTA de ejecución |
| `ClaimText` | texto libre embebido por pantalla | único punto que renderiza `claim.text`/plantillas — si cambia el wording del backend, un solo lugar lo hereda |
| `TraceabilityView` | breadcrumbs simulando trazabilidad | recorre `getTraceability()` como cadena, tolera eslabones ausentes |
| `SourceReference` | — | fuente/institución + tipo (primaria/institucional/secundaria) |
| `MultiActivitySelector` | duplicar la tarjeta por actividad | una interpretación visible a la vez, cambia el contexto, no el dato |
| `ActivityContext` / `ProfileContext` (React context o equivalente) | pasar `profileId` prop a mano por todo el árbol | perfil activo disponible donde se necesite |
| `FilterBar`, `TimeRangeSelector` | — | solo en Informes/Radar donde el filtrado tiene sentido real |
| `StatusIndicator` | — | estados de interfaz (sección 9), no de dominio |
| `EmptyState`, `LoadingState`, `ErrorState` | mensajes ad-hoc por pantalla | únicos, parametrizados por texto/acción |

### 5.3 Separación componente/datos/estado/contexto

- **Componente**: solo recibe props ya resueltas (`evidence_level: 'moderate'`), nunca hace fetch ni conoce rutas de API.
- **Datos**: los `modules/` llaman a `services/` y le dan al componente la forma exacta que espera.
- **Estado**: perfil activo, tema y "última visita" (para nuevo/histórico) viven en `state/`, no en cada página.
- **Contexto**: `ProfileContext` resuelve multiactividad (perfil activo + actividad seleccionada dentro de una situación) — un componente nunca decide por sí mismo cuál actividad mostrar.

---

## 6. Sistema de diseño

### 6.1 Principios (ya fijados por el prompt, no se reinterpretan)

`INFORMACIÓN > DECORACIÓN`, `CLARIDAD > EFECTOS`, `JERARQUÍA > ORNAMENTO`, `LEGIBILIDAD > ESTÉTICA`, `CONTEXTO > DENSIDAD`, `EVIDENCIA > OPINIÓN`.

### 6.2 Tipografía

- Fuente del sistema (`system-ui`, sin fuente web para no depender de una red externa ni de licencias): rendimiento y disponibilidad offline.
- Escala modular limitada (evita "sopa de tamaños"): `xs 12 / sm 14 / base 16 / lg 18 / xl 20 / 2xl 24 / 3xl 30`.
- Peso: texto de cuerpo `400`; texto que debe destacar jerarquía (título de sección, `evidence_level` crítico, prioridad alta) `600`/`700` — nunca color pastel como sustituto de peso (sección 19 del prompt).

### 6.3 Espaciado y bordes

- Escala de espaciado en base 4px (`4/8/12/16/24/32/48`), sin valores libres.
- Radios discretos: `sm 4px` (controles), `md 8px` (tarjetas), `lg 12px` (paneles/modales) — nunca radios grandes decorativos que reduzcan el área de lectura.
- Bordes de 1px como mecanismo principal de separación de superficies (más barato en rendimiento que sombras difusas, más nítido en pantallas de baja densidad).

### 6.4 Iconografía

- Un set único, monocromo, heredando `currentColor` (para que funcione en ambos temas sin duplicar assets).
- El ícono **nunca** es el único portador de significado — siempre acompaña texto (sección 12).

### 6.5 Tablas e indicadores

- Tablas para comparación (versiones de informe, período vs período) — nunca para lo que ya es una tarjeta de situación.
- Indicadores de evidencia/confianza/relevancia/prioridad: **cuatro componentes visualmente distintos** (forma o posición, no solo color), consistente con que son cuatro dimensiones distintas en el backend (0.3).

### 6.6 Tokens semánticos

```
--color-background          --color-surface           --color-surface-elevated
--color-text-primary        --color-text-secondary     --color-text-inverse
--color-border              --color-focus
--color-interactive         --color-interactive-hover  --color-interactive-active
--color-success  --color-warning  --color-danger  --color-info
--color-risk     --color-opportunity   --color-neutral
```

Regla explícita: **ningún componente usa un valor de color hardcodeado**; todo pasa por estos tokens. `--color-risk` y `--color-opportunity` son tokens propios, distintos de `--color-danger`/`--color-success` — un riesgo no es un "error de formulario" y una oportunidad no es un "éxito de operación"; comparten intención de color pero no de significado, y esa distinción debe ser posible de ajustar sin tocar el resto del sistema.

No se asume `success=verde`/`danger=rojo` sin pasar por verificación de contraste (sección 7) al momento de asignar valores concretos — eso ocurre en la implementación, no en esta etapa.

---

## 7. Temas y accesibilidad

### 7.1 Claro / Oscuro / Sistema

- Tres estados: `light`, `dark`, `system` (usa `prefers-color-scheme` cuando `system` está activo). Preferencia persistida en `localStorage` (per-dispositivo; no es un dato de perfil productivo — no se envía al backend).
- El modo oscuro se diseña como paleta propia (superficies, bordes, estados de foco y de los cuatro indicadores de la sección 6.5 recalculados para contraste), no como inversión de la clara.
- Precisión obligatoria en cualquier copy sobre el tema oscuro: el ahorro energético depende del panel (relevante en OLED/AMOLED, marginal o nulo en LCD) — nunca se presenta como "ahorro garantizado".

### 7.2 Contraste

- Objetivo por encima del mínimo WCAG AA donde sea razonable; texto principal en negro/blanco puro según tema, nunca grises intermedios "elegantes" (sección 19 del prompt, tomada literal).
- Los cuatro indicadores semánticos (6.5) se validan en contraste **en sus dos temas**, no solo en claro.

### 7.3 Accesibilidad como requisito, no etapa posterior

- Foco visible siempre (outline propio, nunca solo un cambio sutil de fondo).
- Toda la navegación operable por teclado (incluye `MultiActivitySelector` y paneles contextuales tipo `TraceabilityView`).
- Marcado semántico (encabezados jerárquicos reales, `nav`/`main`/`aside`, `aria-live` para actualizaciones de P1 que no son producto de una navegación).
- Ningún estado (riesgo/oportunidad/incertidumbre/vigente-superado) depende solo de color: siempre texto y/o ícono (sección 23 del prompt — reiterado porque es una regla que se rompe fácilmente en el detalle de implementación, no en el diseño).
- Zoom de texto del navegador soportado sin romper layout (unidades relativas, sin alturas fijas en contenedores de texto).

---

## 8. Responsive

- Una sola base funcional (web) reorganizada, no tres apps distintas — luego Electron/Capacitor envuelven la misma base (sección 24/33 del prompt).
- **Desktop**: navegación lateral fija, panel de detalle (P5-P8, P12) como panel lateral sin perder la lista.
- **Tablet**: navegación lateral colapsable a íconos; panel de detalle reemplaza la lista con botón "volver" (no hay ancho para ambos).
- **Mobile**: navegación inferior (los 5 ítems de 2.1 caben); toda pantalla de detalle es pantalla completa; `MultiActivitySelector` pasa de pestañas a `select`; tablas de Informes-Versiones colapsan a lista de tarjetas con scroll horizontal solo si es estrictamente una tabla comparativa.
- Qué se oculta primero en mobile (nunca información crítica): metadatos de trazabilidad secundarios (ids técnicos) — nunca `evidence_level`, `priority` ni el texto de la recomendación.

---

## 9. Estados de interfaz

| Estado | Regla |
|---|---|
| `loading` | esqueleto de la forma del contenido esperado, nunca un spinner genérico de pantalla completa para actualizaciones parciales |
| `empty` | mensaje explicando la causa real del backend (`no_relevant_changes`, `no_active_situations`) — nunca un genérico "no hay datos" |
| `error` | distingue error de red/servidor (`5xx`) de error de validación (`400`, mensaje del backend mostrado tal cual) |
| `stale/outdated` | recomendación con `status='superseded'` o informe con `status='superseded'` — se muestra atenuado con etiqueta explícita "superado", con enlace a la versión vigente |
| `unavailable` | narrativa en `mode='ai'` sin proveedor configurado → la interfaz debe mostrar el motivo (`503` + `hint` que ya devuelve el backend) y ofrecer el modo determinístico, nunca fallar en silencio |
| `nuevo` vs `histórico` | comparación cliente (`localStorage.lastVisit` por perfil) contra `detected_at`/`created_at`/`first_seen_at` — es una conveniencia de UI, no se persiste en backend (sección 35: no confundir estado de interfaz con dato de dominio) |
| `focus/hover/active/selected/disabled` | tokens de interactive-* (6.6), nunca solo opacidad como único cambio |

---

## 10. Búsqueda

No hay búsqueda global en esta etapa. Justificación: el Radar ya es el mecanismo de "recibir inteligencia" (empuje, no consulta); una búsqueda de texto libre sobre `signals`/`intelligence` competiría con esa función y podría dar la falsa impresión de que "lo que no aparece en la búsqueda no existe". Cuando exista un caso de uso real (p. ej. localizar un informe antiguo por texto), se acota a **búsqueda dentro de Informes** (filtro sobre `listReports`, ya indexable por `type`/`profile_id`), nunca una búsqueda que reemplace al Radar.

---

## 11. Integración con backend y GAPs

### 11.1 Cobertura: pantalla ↔ endpoint

Ya cubierta en la tabla de la sección 3 — todas las pantallas del alcance de esta etapa tienen un endpoint existente que las alimenta, **excepto** los casos listados abajo.

### 11.2 GAPs detectados

| Severidad | GAP | Por qué es necesario | Alternativa mientras no se resuelve |
|---|---|---|---|
| **CRÍTICO** | No existe ningún endpoint de lectura para los vocabularios de `knowledge/` que `core/profile/store.js` usa para **validar** (`activities()`, `marketDimensions()`, `topicCatalog()`, `decisionConstraintCategories/Severities()`, `effectiveRamifications(activityId)`). Sin esto, P14 (edición de perfil) no puede poblar sus selectores sin **duplicar** ese vocabulario en el frontend — justo lo que la sección 3 del prompt prohíbe. | El perfil es referencia pura a ids de `knowledge/`; el frontend necesita listarlos para que el usuario elija, no para inventarlos. | Ninguna razonable sin violar "no duplicar conocimiento"; se documenta, no se resuelve aquí. Wrappers de solo lectura sobre `knowledge.*` ya existente (p. ej. `GET /knowledge/activities`, `GET /knowledge/markets`, `GET /knowledge/topics`, `GET /knowledge/constraints`, `GET /knowledge/activities/:id/ramifications`) serían la extensión mínima — 0 lógica nueva, solo exposición. |
| **IMPORTANTE** | No hay endpoint para obtener una `decision`/`recommendation`/`intelligence`/`signal` **individual por id** (solo volcado de últimas 50 filas o anidado dentro de `getChanges()`). Al navegar desde un claim de **informe** (que referencia ids en `references_json`, ver `reports/claims.js`) hacia el detalle completo (P6-P8) fuera del contexto de un perfil, no hay forma de resolverlo. | La Trazabilidad (P12) y la lectura de informes (P10) deben poder mostrar el detalle de una decisión/recomendación citada aunque el usuario no esté navegando "desde" un perfil en ese momento. | Mientras tanto, la interfaz solo puede mostrar el detalle cuando llega desde P5 (contexto de perfil, datos ya en memoria); desde un informe, se limita a mostrar el `claim.text` + la cadena de ids sin poder "abrir" el objeto completo. |
| **IMPORTANTE** | No hay una noción de "comparación automática vs. período anterior" para el Inicio (P1) — el tipo de informe `periodic` existe pero requiere parámetros explícitos (`monitorId`, `field`, `periodStart/End`), no una comparación genérica de perfil. | La sección 7 del prompt pide "evolución respecto al período anterior" en Inicio. | Se aproxima con `radar_situations.first_seen_at`/`observation_count` (ya disponible) para mostrar antigüedad/persistencia, sin ser estrictamente una comparación de período. |
| **MEJORA** | No hay endpoint para una **situación individual** por id (`/profiles/:id/radar?view=situations` siempre trae la lista completa). | Deep-linking directo a una situación (compartir un enlace) requeriría filtrar client-side. | Aceptable: el volumen esperado por perfil es bajo; filtrar client-side no es costoso. |
| **FUTURO** | No hay autenticación/sesión de usuario — cualquier cliente puede leer/editar cualquier `profile_id`. | Fuera del alcance de esta etapa (el prompt no la pide, y el uso actual es de un solo operador/tenant); pero un despliegue multiusuario real la necesitaría antes de exponerse fuera de una red controlada. | No se implementa; se deja constancia para cuando exista ese requisito. |
| **FUTURO** | Sin notificaciones (deliberado, sección 29 del prompt) — se documentan como candidatas futuras los mismos eventos que ya son detectables hoy: nueva situación `emerging`, riesgo con recomendación `priority=high`, informe recién generado, recomendación `superseded`. | — | No se diseña ni se implementa ahora. |

Ningún GAP requirió tocar `knowledge/` ni la lógica de inteligencia — todos son, en el peor caso, wrappers de lectura sobre datos/funciones que ya existen.

---

## 12. Plan de implementación posterior (no ejecutado en esta etapa)

1. Resolver el GAP crítico (11.2) — endpoints de solo lectura sobre `knowledge.*` — antes de tocar P14, porque P14 depende de eso para no duplicar vocabulario.
2. Sistema de diseño primero como código (tokens CSS + los ~10 componentes semánticos de 5.2), sin conectar a datos reales — permite validar contraste/temas/accesibilidad de forma aislada.
3. P1 (Inicio) + P2-P4 (Radar) sobre datos reales de fixtures/backend — es la ruta crítica de valor (principio UX central, sección 4 del prompt).
4. P5-P8 (detalle de situación → inteligencia → decisión → recomendación) como panel único reutilizado desde Radar e Inicio.
5. P9-P12 (Informes + Trazabilidad).
6. P13-P15 (Perfil), una vez resuelto el GAP crítico.
7. Responsive + temas + accesibilidad no se dejan para el final: se verifican en cada paso anterior, no como fase 8 separada.
8. Electron/Capacitor: envoltorio sobre la misma base web, solo después de que la base web esté funcional (secciones 24/33 del prompt).

---

## 13. Validación de esta etapa

| Criterio | Resultado |
|---|---|
| Cobertura funcional (todas las capacidades de backend tienen pantalla) | Cumple |
| Coherencia de navegación (sin duplicar Radar/Cambios/Inteligencia/Decisiones como secciones independientes) | Cumple — justificado en sección 2.1 |
| Ausencia de duplicación de conocimiento/lógica | Cumple, con el GAP crítico de vocabularios explícitamente señalado para no resolverlo mediante duplicación |
| Consistencia multiactividad | Cumple — `MultiActivitySelector` como componente único, ninguna fusión de interpretaciones |
| Trazabilidad completa | Cumple para lo alcanzable hoy; limitación real documentada como GAP importante (11.2), no ocultada |
| Separación inteligencia/decisión/recomendación | Cumple — tres componentes distintos, ningún lenguaje de ejecución automática |
| Personalización correcta | Cumple — relevancia central vs. personalizada nunca colapsadas |
| Representación de incertidumbre | Cumple — evidencia/confianza/relevancia/prioridad como 4 indicadores distintos, estados `stale`/`conflicting`/`insufficient` explícitos |
| Accesibilidad y contraste | Especificado (sección 7); pendiente de verificación real una vez exista implementación visual |
| Temas claro/oscuro | Especificado, incluida precisión sobre eficiencia energética |
| Responsive | Especificado para desktop/tablet/mobile con una sola base |
| Eficiencia (sección 34 del prompt) | Especificado: nada de polling — el estado "nuevo" se calcula localmente contra timestamps ya presentes en las respuestas, no una consulta adicional |
| Reutilización de componentes | Cumple — 5.2 evita componentes duplicados por tipo de intelligence/decision/recommendation |
| Compatibilidad Web/Electron/Capacitor | Base única, sin dependencia de plataforma en el diseño funcional |
| No incorporación innecesaria de dependencias | No se propuso ninguna dependencia nueva en esta etapa |

### Veredicto: **GREEN WITH GAPS**

Los GAPs documentados (11.2) son reales, mínimos y no bloquean el diseño funcional en sí — bloquean específicamente una pantalla (P14, edición de perfil) hasta que se resuelva el GAP crítico, y limitan parcialmente la profundidad de la Trazabilidad desde Informes hasta que se resuelva el GAP importante de "objeto por id". Ningún GAP requiere modificar `knowledge/` ni la lógica de inteligencia/decisión/recomendación ya validada. No se realizó ninguna modificación de código en esta etapa — es exclusivamente un documento de diseño. No se hizo commit.
