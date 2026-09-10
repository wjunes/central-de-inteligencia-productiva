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
| `activities.json` | Listado de actividades con taxonomía completa e identificación de relaciones iniciales. |

---

## Estructura de cada actividad en `activities.json`

```json
{
  "id": "ganaderia-bovina",
  "name": "Ganadería bovina",
  "sector_id": "agropecuario",
  "level": "activity",
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

Los arrays contienen identificadores que referencian otros nodos del sistema cuando la relación puede representarse mediante un nodo existente.

---

## Reglas para agregar nuevas actividades

1. Verificar que no existe ya una actividad equivalente con diferente nombre.
2. Confirmar que la diferencia productiva es relevante según los criterios anteriores.
3. Asignar un `id` en minúsculas, sin tildes, sin espacios, con guiones.
4. Conservar la denominación visible con ortografía española correcta en el campo `name`.
5. Asociar al `sector_id` existente más apropiado, o proponer un nuevo sector si ninguno aplica.
6. Completar al menos `products`, `related_activities`, `markets` e `impact_factors`.

---

## Diferencia entre `activities` y `ramifications`

- **`activities/`** define la taxonomía y las relaciones de primer nivel entre actividades: qué existen, cómo se clasifican y cómo se conectan.
- **`ramifications/`** (etapa posterior) desarrollará en profundidad cada actividad: procesos detallados, cadenas de valor, fuentes de datos específicas, indicadores clave, alertas y la lógica de relevancia para el usuario.

Las `ramifications/` no se desarrollan en esta etapa.

---

## Fuentes generales utilizadas

La taxonomía se construyó tomando como referencia las clasificaciones y denominaciones utilizadas por:

- **MGAP** — Ministerio de Ganadería, Agricultura y Pesca
- **DIEA** — Dirección de Investigaciones Estadísticas Agropecuarias (MGAP)
- **MIEM** — Ministerio de Industria, Energía y Minería
- **Uruguay XXI** — Instituto de Promoción de Inversiones y Exportaciones
- **INE** — Instituto Nacional de Estadística (clasificación CIIU adaptada)
- **INAC** — Instituto Nacional de Carnes
- **INALE** — Instituto Nacional de la Leche
- **DINARA** — Dirección Nacional de Recursos Acuáticos
- **ANP** — Administración Nacional de Puertos
- **UTE** — Administración Nacional de Usinas y Trasmisiones Eléctricas

La denominación canónica de cada actividad prioriza la nomenclatura oficial uruguaya.
