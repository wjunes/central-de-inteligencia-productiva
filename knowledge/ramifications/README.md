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

Un archivo por cada nodo de `activities.json` (actividades y subactividades). Las subactividades incluyen `parent_activity_id` y, salvo especialización, comparten conceptualmente las ramificaciones de su actividad madre.

---

## Esquema de cada archivo

```json
{
  "activity_id": "ganaderia",
  "activity_name": "Ganadería",
  "sector_id": "agropecuario",
  "level": "activity",
  "parent_activity_id": null,
  "ramification_count": 32,
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
- **`children`**: subramificaciones (`depth` 2 y 3). Vacío en la mayoría; se desarrolla solo donde aporta a comprender el universo productivo.
- **`target_activity_id`**: presente cuando `relation` es `related_activity`; apunta a otra actividad de `activities.json` en lugar de duplicar información.

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

No es obligatorio usar todas. En esta primera versión no se utilizan `processes` (ya definidos en `activities.json`), ni `value_chain`, `suppliers`, `customers`, `services` ni `strategic_signals`, reservadas para la profundización posterior.

### Semántica de `relevance`

- **`critical`** — una alteración puede afectar seriamente la continuidad, productividad o rentabilidad de la actividad.
- **`high`** — impacto importante; debe formar parte del monitoreo habitual.
- **`medium`** — relevante según contexto, período o situación.
- **`low`** — relación real pero que normalmente no debe dominar el sistema de información.

### `risks` y `opportunities`

Se identifican **situaciones a vigilar**, no recomendaciones. Una oportunidad marca dónde podría surgir después una señal (nueva demanda, nuevo mercado, cambio regulatorio favorable, déficit de oferta, suba sostenida de precios, nueva tecnología o infraestructura). La recomendación es responsabilidad de una etapa posterior.

---

## Cómo se construyó

1. Base derivada automáticamente de `knowledge/activities/activities.json`: cada identificador de relación se clasificó en `category` / `relation` / `direction` / `relevance` mediante un diccionario de factores transversales y reglas por tipo de campo.
2. Enriquecimiento curado de las actividades de mayor peso (ganadería, agricultura de secano, lechería, arroz, forestal-celulosa, frigorífica, energía, turismo, software, caña de azúcar, pesca industrial): subramificaciones `depth` 2, ajustes de relevancia y riesgos/oportunidades específicos.
3. `risks` y `opportunities` generales agregados por reglas conservadoras (clima, cierre de mercados, precios internacionales, concentración en China, exigencias ambientales, acuerdos comerciales, atracción de inversión, escasez de talento, shock de petróleo) solo cuando la actividad tiene el factor asociado.

Fuentes: la clasificación se apoya en las denominaciones y relaciones ya validadas en `activities/` con fuentes oficiales uruguayas (MGAP/DIEA, INIA, INAC, INALE, DINARA, MIEM, BCU, INE, Uruguay XXI, MTOP/ANP, UTE/URSEA). No se incorporó investigación estadística, de precios ni de mercados.

---

## Factores transversales

Clima, agua, energía, combustibles, tipo de cambio, inflación, tasas de interés, costos laborales, logística, infraestructura, comercio exterior, demanda internacional e interna, normativa, impuestos, sanidad y tecnología aparecen como ramificaciones en múltiples actividades, **con relevancia propia en cada una** (no se asume el mismo peso en todas). El clima se trata como ramificación transversal de alto nivel únicamente donde tiene impacto productivo real, con hijos como sequía, exceso hídrico, heladas o déficit hídrico según la actividad.

---

## Qué NO contiene

Datos, series, precios, indicadores, normativa detallada, fuentes por actividad, análisis económico, informes ni recomendaciones. Todo eso corresponde a `domain-names/`, `relationships/`, `taxonomy/` y a las capas de datos e inteligencia posteriores.

---

## Próximos pasos

- `domain-names/`: dominios de conocimiento y fuentes asociados a cada ramificación.
- `relationships/`: consolidación del grafo productivo (aristas actividad↔actividad de `_index.json`).
- Motor de relevancia: fórmula que combine `relevance`, `direction`, `depth` y perfil del usuario.
