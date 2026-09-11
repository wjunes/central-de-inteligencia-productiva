# _build

Regenera `knowledge/intelligence/` a partir de `knowledge/relevance/mappings.json`, `knowledge/signals/signal-types.json` y `knowledge/ramifications/_signal_types.json` — **solo lectura**, no modifica capas anteriores (salvo la corrección puntual documentada en `relevance/_build/generate.py`, ver `README.md` de esta capa).

```
python knowledge/intelligence/_build/generate.py
```

## `generate.py`

- Todo el contenido de `intelligence-types.json`, `rules.json`, `relationships.json`, `evidence.json` y `scenarios.json` es **curado** (listas y reglas inline): no hay instancias de señales en el repositorio sobre las que derivar nada más que metodología.
- Las únicas cifras **derivadas** son estadísticas de costo/beneficio de diseño, calculadas contra `relevance/mappings.json.activity_relevance_graph`:
  - `hubs_with_second_hop` / `raw_second_order_pairs`: cuántos pares de 2do orden existirían si se materializara la expansión completa (justifica por qué `rules.json.second_order_effects` NO la materializa).
  - `first_order_pairs`: tamaño real del grafo de 1er orden ya reusado (no se recalcula, se referencia).
- `COST_SIDE_CATEGORIES` / `REVENUE_SIDE_CATEGORIES` / `UNCERTAIN_CATEGORIES`: clasifican las 25 categorías de nodo de `ramifications/` (no crean categorías nuevas) para `rules.json.direction_by_subject`.
- `FLIP_RELATIONS` / `UNCERTAIN_RELATIONS`: clasifican las 5 `relation` de aristas cruzadas de `ramifications/`/`relevance/` para la misma regla.
- Validaciones: ningún self-loop remanente en `relevance/mappings.json` (los 3 casos de `agencias-operadores`/`alojamiento`/`cosecha-forestal` deben seguir excluidos tras la corrección de `relevance/`); las 25 categorías cubren exactamente `COST_SIDE ∪ REVENUE_SIDE ∪ UNCERTAIN` sin superposición.

## Corrección aplicada en `relevance/_build/generate.py`

Durante la construcción de esta capa, la primera corrida de `generate.py` falló su propia validación (self-loop remanente para los 3 casos conocidos). La causa era un bug real en la propagación jerárquica de `relevance/` — ver `relevance/README.md` y `relevance/gaps.json.propagation_self_loop_bug` para el detalle completo. Se corrigió `relevance/_build/generate.py` con un guard mínimo, se regeneró `relevance/` (939 pares en vez de 944), y solo entonces se regeneró esta capa. Es la única modificación a una capa anterior en toda esta tarea.

Al cambiar `relevance/` (o transitivamente `ramifications/`), volver a ejecutar y revisar el diff.
