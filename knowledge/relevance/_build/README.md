# _build

Regenera `knowledge/relevance/` a partir de `knowledge/ramifications/` (grafo actividad-actividad ya implícito en sus nodos con `target_activity_id`) — **solo lectura**, no modifica capas anteriores.

```
python knowledge/relevance/_build/generate.py
```

## `generate.py`

- `effective_ramifications(aid)`: mismo resolutor de herencia que `ramifications/_build/generate.py` (aplica `ramification_deltas` para subactividades), reimplementado aquí en modo lectura porque `relevance/` necesita recorrer el árbol completo de nodos (incluyendo `children` anidados), no solo el nivel superior.
- Extrae `base_edges`: todo nodo con `target_activity_id` distinto de su propia actividad de origen (3 casos con `target_activity_id == origin` se excluyen y se registran en `gaps.json.self_loop_anomaly`).
- `DECAY`: tabla curada `(tier de relation, edge_relevance) → nivel`. `tier_of()` clasifica `relation` en `strong` (`supplier`/`customer`/`infrastructure`/`competitor`) o `weak` (`related_activity`/`complement`); cualquier `relation` fuera de esos dos conjuntos dispara un error de validación (no ocurrió: los 5 valores de `relation` observados en aristas cruzadas están cubiertos).
- `children_of` / `parent_of`: mapa de jerarquía actividad→subactividades, construido directamente desde `level`/`parent_activity_id` de cada archivo de `ramifications/` (no requiere leer `activities/activities.json`).
- Propagación jerárquica: por cada arista base, si el origen o el destino tiene subactividades, se agregan aristas propagadas hacia/desde cada una, **salvo** que ya exista una arista más específica para ese par exacto.
- Deduplicación: agrupa por `(origin, target)`, conserva el nivel máximo y concatena toda la evidencia.
- `isolated_activities`: actividades sin ninguna arista (ni de origen ni de destino) tras la propagación — 0 en la corrida actual.
- Validaciones: todo `origin`/`target` de `activity_relevance_graph` existe como archivo de `ramifications/`; todo `relevance_level` pertenece a `LEVEL_ORDER`; `levels.json` cubre exactamente los 5 niveles de `LEVEL_ORDER`.

`domain_coexposure` y `market_exposure` se dejan como reglas documentadas en `rules.json`, no como tablas generadas: materializarlas requeriría un producto actividad × actividad × dominio/mercado, combinatoriamente grande y explícitamente prohibido por el prompt de construcción (§31-32).

Al cambiar `ramifications/`, volver a ejecutar y revisar el diff. `levels.json` y buena parte de `rules.json` (factores, tabla de decaimiento, políticas) cambian solo si se edita el script — son curados, no derivados de datos externos.
