# knowledge/activities/

## Propósito

Este directorio contiene la **taxonomía maestra de actividades productivas de Uruguay** que utiliza la Central de Inteligencia Productiva para identificar el perfil productivo de cada usuario y determinar qué información, datos, análisis, riesgos, oportunidades y alertas son relevantes para él.

---

## Definición de actividad

Una **actividad** es un nodo del universo productivo uruguayo que representa un conjunto coherente de procesos productivos con productos, insumos, mercados y factores de impacto propios y diferenciables.

No es simplemente una categoría: es un punto de conexión con el resto del sistema productivo.

---

## Niveles de la taxonomía

La taxonomía tiene tres niveles máximos:

```
SECTOR
  └── ACTIVIDAD
        └── SUBACTIVIDAD
```

- **Sector**: agrupación macrosectorial (ejemplo: Agropecuario, Forestal, Energía).
- **Actividad**: unidad principal de clasificación del perfil productivo del usuario.
- **Subactividad**: especialización dentro de una actividad cuando la diferencia productiva es relevante.

No se definen niveles adicionales en esta etapa. Los niveles inferiores corresponden a las futuras `ramifications/`.

Un sector puede contener una única actividad cuando la actividad y el sector coinciden conceptualmente y el detalle relevante está en las subactividades. Es el caso de **Turismo**: sector `turismo` → actividad `turismo` → subactividades (`alojamiento`, `gastronomia`, `agencias-operadores`, `turismo-rural-naturaleza`, `turismo-cultural`, `turismo-mice-eventos`, `transporte-turistico`). El turismo es una actividad propia e independiente del transporte; `transporte-turistico` es una subactividad de turismo, no a la inversa.

---

## Criterios de clasificación

Una actividad se crea como nodo independiente únicamente cuando existe una **diferencia productiva relevante** en al menos dos de estos aspectos:

- productos finales distintos;
- insumos o procesos significativamente diferentes;
- mercados o canales de comercialización propios;
- factores de riesgo o impacto diferenciados;
- normativa sectorial específica.

Se evita:

- duplicar actividades con diferente nombre;
- crear categorías artificiales o vacías;
- separar actividades únicamente por mercado de destino;
- fragmentar en exceso categorías que comparten la misma cadena de valor esencial.

---

## Archivos

| Archivo | Contenido |
|---|---|
| `sectors.json` | Listado de sectores con `id`, `name`, `description` y `order`. |
| `activities.json` | Listado de actividades y subactividades con taxonomía completa, relaciones iniciales y dos vocabularios controlados (`markets_vocabulary`, `impact_factors_vocabulary`). |

Las **subactividades se registran como nodos propios** dentro del array `activities` (`level: "subactivity"`, con `parent_id`), además de listarse en el array `subactivities` de su actividad madre. Esto evita anidar estructuras y permite tratar cualquier nivel de la taxonomía de forma uniforme (asignar fuentes, calcular relevancia, generar relaciones).

---

## Estructura de cada actividad en `activities.json`

```json
{
  "id": "arroz",
  "name": "Arroz",
  "sector_id": "agropecuario",
  "level": "activity",
  "parent_id": null,
  "description": "Descripción muy breve.",
  "subactivities": [],
  "products": [],
  "inputs": [],
  "processes": [],
  "related_activities": [],
  "markets": [],
  "dependencies": [],
  "impact_factors": []
}
```

- `level`: `"activity"` o `"subactivity"`.
- `parent_id`: `null` en las actividades; `id` de la actividad madre en las subactividades.
- `related_activities`: identificadores de otras actividades o subactividades del propio `activities.json`.
- `markets` e `impact_factors`: identificadores de los vocabularios controlados definidos al inicio de `activities.json`.
- `products`, `inputs`, `processes`, `dependencies`: identificadores en formato canónico de conceptos que se desarrollarán en `ramifications/`; en esta etapa solo se registran las ramificaciones directas más importantes y no es obligatorio completarlas.

---

## Reglas para agregar nuevas actividades

1. Verificar que no existe ya una actividad equivalente con diferente nombre.
2. Confirmar que la diferencia productiva es relevante según los criterios anteriores.
3. Asignar un `id` en minúsculas, sin tildes, sin espacios, con guiones.
4. Conservar la denominación visible con ortografía española correcta en el campo `name`.
5. Asociar al `sector_id` existente más apropiado, o proponer un nuevo sector si ninguno aplica.
6. Completar al menos `products`, `related_activities`, `markets` e `impact_factors`.

---

## Decisiones de alcance

- **Economía del conocimiento e industrias creativas**: se mantienen como actividades separadas en `servicios-productivos-tecnologicos` (software, servicios globales, audiovisual, industrias creativas, I+D, data centers). No se fusionan; un usuario puede asociarse a varias. «Economía del conocimiento» es un agregado transversal, no un nodo.
- **Salud, educación y economía social / cooperativa**: **no se incorporan** en esta versión. La Central prioriza el aparato productivo transable y su cadena de valor; la economía social/cooperativa es una forma de organización transversal (atributo del perfil, no actividad). Reversible: pueden sumarse como nuevo sector y actividades sin alterar la arquitectura.

---

## Diferencia entre `activities` y `ramifications`

- **`activities/`** define la taxonomía y las relaciones de primer nivel entre actividades: qué existen, cómo se clasifican y cómo se conectan.
- **`ramifications/`** (etapa posterior) desarrollará en profundidad cada actividad: procesos detallados, cadenas de valor, fuentes de datos específicas, indicadores clave, alertas y la lógica de relevancia para el usuario.

Las `ramifications/` no se desarrollan en esta etapa.

---

## Fuentes generales utilizadas

La taxonomía se construyó tomando como referencia las clasificaciones y denominaciones utilizadas por:

- **MGAP** — Ministerio de Ganadería, Agricultura y Pesca
- **DIEA** — Dirección de Estadísticas Agropecuarias (MGAP): regionalización y rubros productivos agropecuarios
- **INIA** — Instituto Nacional de Investigación Agropecuaria
- **MIEM** — Ministerio de Industria, Energía y Minería (Direcciones Nacionales de Industrias, Energía y Minería y Tecnología)
- **Uruguay XXI** — clasificación por complejos exportadores y sectores promovidos (agroindustria, alimentos y bebidas, TIC, servicios globales, industrias creativas, arquitectura/ingeniería/construcción)
- **INE** — Instituto Nacional de Estadística: Clasificador Internacional Industrial Uniforme (CIIU Rev. 4) adaptado
- **BCU** — Cuentas Nacionales por rama de actividad (CIIU Rev. 4)
- **INAC** — Instituto Nacional de Carnes
- **INALE** — Instituto Nacional de la Leche
- **DINARA** — Dirección Nacional de Recursos Acuáticos
- **ANP** — Administración Nacional de Puertos
- **UTE** / **URSEA** — sector eléctrico y regulación energética

La taxonomía usa estas fuentes solo para validar la existencia, denominación y agrupación de las actividades. La denominación canónica de cada actividad prioriza la nomenclatura oficial uruguaya; el detalle de fuentes por actividad corresponde a etapas posteriores.
