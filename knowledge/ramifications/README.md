# knowledge/ramifications/

## Propósito

`ramifications/` es el **mapa estructurado de relaciones productivas** de cada actividad definida en `knowledge/activities/`.

Responde a la pregunta central de la Central de Inteligencia Productiva:

> Si esta es la actividad principal del usuario, ¿qué otras cosas debemos vigilar porque pueden **afectarla, beneficiarla, generar oportunidades o representar riesgos**?

No es una colección de información descriptiva ni de datos. Es la capa que conecta:

```
ACTIVIDAD  →  RAMIFICACIONES  →  DOMAIN-NAMES  →  FUENTES  →  DATOS  →  ANÁLISIS  →  RELEVANCIA  →  INTELIGENCIA
```

En esta etapa solo se identifican y clasifican las relaciones. No se desarrollan datos, precios, indicadores, normativa ni fuentes.

---

## `activities/` vs `ramifications/`

| | Pregunta |
|---|---|
| `activities/` | ¿Qué actividades productivas existen y cómo se clasifican? |
| `ramifications/` | ¿Qué universo productivo está conectado con cada actividad y con qué relevancia? |

Las ramificaciones se **derivan y amplían** la información de relaciones ya presente en `activities.json` (`products`, `inputs`, `related_activities`, `markets`, `dependencies`, `impact_factors`). No se duplica ni se contradice `activities/`: si aparece una contradicción se corrige en `activities/`, no aquí.

---

## Estructura de archivos

```
ramifications/
├── README.md
├── _index.json                 # índice: recuento y aristas entre actividades
├── ganaderia.json
├── agricultura-secano.json
├── ...                         # un archivo por actividad y subactividad
```

Un archivo por cada nodo de `activities.json`:

- **Actividades** (`level: activity`): archivo completo con el array `ramifications`.
- **Subactividades** (`level: subactivity`): archivo **por diferencias**. No repite las ramificaciones del padre; declara `inherits_from` y un bloque `ramification_deltas` (`add` / `remove` / `modify`). Ver *Herencia de subactividades* más abajo.

Archivos meta: `_index.json` (recuento y aristas actividad↔actividad) y `_signal_types.json` (catálogo transversal de tipos de señal estratégica).

---

## Esquema de cada archivo

```json
{
  "activity_id": "ganaderia",
  "activity_name": "Ganadería",
  "sector_id": "agropecuario",
  "level": "activity",
  "parent_activity_id": null,
  "ramification_count": 42,
  "ramifications": [
    {
      "id": "pasturas",
      "name": "Pasturas",
      "category": "resources",
      "relation": "dependency",
      "direction": "direct",
      "relevance": "critical",
      "depth": 1,
      "children": [
        { "id": "pasturas-mejoradas", "name": "Pasturas mejoradas y verdeos",
          "category": "resources", "relation": "dependency", "direction": "direct",
          "relevance": "medium", "depth": 2, "children": [] }
      ]
    },
    {
      "id": "frigorifica",
      "name": "Industria frigorífica",
      "category": "related_activities",
      "relation": "related_activity",
      "target_activity_id": "frigorifica",
      "direction": "direct",
      "relevance": "critical",
      "depth": 1,
      "children": []
    }
  ]
}
```

### Campos de una ramificación

- **`id`** / **`name`**: identificador normalizado (minúsculas, sin tildes ni ñ, con guiones) y denominación visible en español.
- **`category`**: tipo de ramificación (ver vocabulario abajo).
- **`relation`**: naturaleza de la relación — `dependency`, `input`, `output`, `market`, `supplier`, `customer`, `complement`, `competitor`, `cost`, `impact`, `infrastructure`, `regulation`, `risk`, `opportunity`, `related_activity`.
- **`direction`**: `direct` (impacto inmediato o dependencia directa) o `indirect` (afecta a través de una o más cadenas intermedias, pero sigue siendo relevante).
- **`relevance`**: `critical` | `high` | `medium` | `low` (ver semántica abajo). Es una clasificación inicial; no hay todavía fórmula de relevancia.
- **`depth`**: nivel de la relación (1 a 3 máximo).
- **`children`**: subramificaciones (`depth` 2 y 3). Vacío en la mayoría; se desarrolla solo donde aporta valor informativo, no por simetría entre archivos.
- **`target_activity_id`**: presente cuando la ramificación es otra actividad de `activities.json`; se referencia por id en lugar de duplicarla. La `relation` precisa el rol: `supplier`, `customer`, `competitor`, `infrastructure`, `related_activity`, etc.
- **`stage`**: presente solo en ramificaciones de `category: value_chain`; posición en la cadena (`proveedores`, `insumos`, `produccion`, `transformacion`, `distribucion`, `comercializacion`, `mercado`).
- **`signal_type`**: presente solo en ramificaciones de `category: strategic_signals`; referencia un tipo del catálogo `_signal_types.json`.

### Vocabulario de `category`

```
products              inputs               resources            processes
technologies          services             related_activities   value_chain
markets               customers            suppliers            infrastructure
logistics             cost_factors          financial_factors    economic_factors
climate_factors       environmental_factors sanitary_factors     regulatory_factors
labor_factors         demand_factors        competitive_factors  risks
opportunities         strategic_signals
```

No es obligatorio usar todas. `processes` no se utiliza (ya está en `activities.json`). `value_chain`, `suppliers`, `customers`, `services` y `strategic_signals` se incorporaron en la segunda pasada para las actividades donde representan relaciones productivas reales; el resto de las actividades las usará a medida que se enriquezcan.

### Cadena de valor y mercados-destino

- **`value_chain`**: en ~15 actividades núcleo se representa la cadena `proveedores → insumos → producción → transformación → distribución → comercialización → mercado` con los eslabones relevantes (campo `stage`), enlazando por `target_activity_id` a las actividades que ocupan cada eslabón. Permite detectar impactos indirectos (un cambio aguas abajo afecta al productor).
- **Mercados-destino**: en las actividades exportadoras se abre `markets` en un nodo `mercados-destino-*` con hijos por destino estructural (China, UE, EE.UU., Brasil, Mercosur, etc.), y cada destino con hijos `demanda`, `precios`, `requisitos-y-barreras` y `competencia`. No es una base mundial de países: solo destinos con relación productiva relevante, para que el sistema pueda detectar *"algo cambió en este mercado y afecta a esta actividad"*.

### Semántica de `relevance`

- **`critical`** — una alteración puede afectar seriamente la continuidad, productividad o rentabilidad de la actividad.
- **`high`** — impacto importante; debe formar parte del monitoreo habitual.
- **`medium`** — relevante según contexto, período o situación.
- **`low`** — relación real pero que normalmente no debe dominar el sistema de información.

### `risks` y `opportunities`

Se identifican **situaciones a vigilar**, no recomendaciones. Una oportunidad marca dónde podría surgir después una señal (nueva demanda, nuevo mercado, cambio regulatorio favorable, déficit de oferta, suba sostenida de precios, nueva tecnología o infraestructura). La recomendación es responsabilidad de una etapa posterior.

---

## Señales estratégicas (`strategic_signals`)

`strategic_signals` marca **tipos de cambio que conviene anticipar**. Cada señal referencia por `signal_type` un tipo del catálogo transversal y reutilizable de `_signal_types.json` (demanda, consumo, precios, costos, oferta, capacidad-productiva, inversión, comercio-exterior, acceso-a-mercados, regulación, tecnología, sustitución, competencia, infraestructura-logística, clima-agua, recursos-naturales, sanidad, financiamiento, empleo-talento).

El catálogo es independiente de cada actividad: la misma taxonomía de tipos se aplicará a todas. No es una regla de alerta ni una recomendación; eso corresponde al motor de relevancia y a la capa de inteligencia.

---

## Herencia de subactividades

Una subactividad **no copia** las ramificaciones de su actividad madre. Su archivo declara:

```json
{
  "activity_id": "ganaderia-porcina",
  "parent_activity_id": "ganaderia",
  "inherits_from": "ganaderia",
  "inherited_ramifications": 3,
  "own_ramifications": 8,
  "effective_ramification_count": 45,
  "ramification_deltas": {
    "add":    [ { ...ramificación específica de la subactividad... } ],
    "remove": [ { "id": "exportacion", "reason": "actividad orientada al mercado interno" } ],
    "modify": [ { "id": "frigorifica", "relevance": "high", "reason": "..." } ]
  }
}
```

### Resolución (para la capa `domain-names/` y el motor de relevancia)

```text
efectivas(subactividad) =
      ramificaciones(padre)
    − { r | r.id ∈ deltas.remove }
    ⊕ deltas.modify        (aplica relevance / relation / category / children nuevos por id)
    ∪ deltas.add           (ramificaciones propias que el padre no tiene)
```

Cada ramificación resultante es trazable: **heredada** (venía del padre y no fue tocada), **modificada** (heredada con ajuste), **específica** (`deltas.add`) o **excluida** (`deltas.remove`, no se monitorea).

`inherited_ramifications` cuenta las que la subactividad reafirma sin cambios (no se guardan en el archivo, se resuelven desde el padre). No hay ciclos: toda subactividad hereda de una actividad de nivel 1.

---

## `processes`: decisión explícita

`ramifications/` **no representa** `processes`. La estructura interna de cada actividad (cría, faena, molienda, etc.) ya está en `knowledge/activities/activities.json`.

- `activities/` define **qué produce** una actividad y **cómo se estructura**.
- `ramifications/` define **qué elementos externos o relacionados** pueden afectarla, complementarla o generar oportunidades.
- `domain-names/` (etapa siguiente) derivará los universos de información monitoreables, incluidos los vinculados a procesos, a partir de `activities.json`.

---

## Cómo se construyó

1. Base derivada automáticamente de `knowledge/activities/activities.json`: cada identificador de relación se clasificó en `category` / `relation` / `direction` / `relevance` mediante un diccionario de factores transversales y reglas por tipo de campo.
2. **Roles entre actividades**: las relaciones actividad↔actividad se clasificaron con una tabla de cadenas de procesamiento y sectores en `supplier`, `customer`, `competitor`, `infrastructure`, `logistics` o `related_activity`, en vez de una relación genérica única.
3. Enriquecimiento curado (`_build/curated.json`): `value_chain` en ~32 actividades con cadena identificable, `mercados-destino` en ~16 actividades exportadoras, `strategic_signals` tipadas en ~24 actividades, subramificaciones `depth` 2‑3, `subactivity_deltas` (remove/modify heredados) y ajustes de relevancia. Se priorizó la profundidad donde hay dependencia productiva, climática, energética, logística, sanitaria, regulatoria, de mercado o de costos fuerte; **no** para igualar el tamaño de los archivos.
4. `risks` y `opportunities` generales por reglas conservadoras (clima, cierre de mercados, precios internacionales, concentración en China, exigencias ambientales, acuerdos comerciales, atracción de inversión, escasez de talento, shock de petróleo) solo cuando la actividad tiene el factor asociado.

El mapa es **reproducible**: `python knowledge/ramifications/_build/generate.py` regenera todos los archivos a partir de `activities.json` + `curated.json`.

Fuentes: la clasificación se apoya en las denominaciones y relaciones ya validadas en `activities/` con fuentes oficiales uruguayas (MGAP/DIEA, INIA, INAC, INALE, DINARA, MIEM, BCU, INE, Uruguay XXI, MTOP/ANP, UTE/URSEA). No se incorporó investigación estadística, de precios ni de mercados.

---

## Factores transversales

Clima, agua, energía, combustibles, tipo de cambio, inflación, tasas de interés, costos laborales, logística, infraestructura, comercio exterior, demanda internacional e interna, normativa, impuestos, sanidad y tecnología aparecen como ramificaciones en múltiples actividades, **con relevancia propia en cada una** (no se asume el mismo peso en todas). El clima se trata como ramificación transversal de alto nivel únicamente donde tiene impacto productivo real, con hijos como sequía, exceso hídrico, heladas o déficit hídrico según la actividad.

---

## Qué NO contiene

Datos, series, precios, indicadores, normativa detallada, fuentes por actividad, análisis económico, informes ni recomendaciones. Todo eso corresponde a `domain-names/`, `relationships/`, `taxonomy/` y a las capas de datos e inteligencia posteriores.

---

## Estado

`knowledge/ramifications/` queda **cerrado como capa estructural**: cobertura, roles entre actividades, cadena de valor, mercados-destino, catálogo de señales y herencia de subactividades están resueltos. Lo que falta es población de detalle, que corresponde a capas posteriores.

## Próximos pasos

- `domain-names/`: universos de información y fuentes por ramificación; derivará también dominios de proceso desde `activities.json`.
- `relationships/`: consolidación del grafo productivo (aristas actividad↔actividad de `_index.json`).
- Motor de relevancia: fórmula que combine `relevance`, `direction`, `depth`, resolución de herencia y perfil del usuario.
