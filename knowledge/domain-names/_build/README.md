# _build

Regenera `knowledge/domain-names/` a partir de `knowledge/activities/` y `knowledge/ramifications/`.

```
python knowledge/domain-names/_build/generate.py
```

## `generate.py`
- `D`: catálogo de dominios transversales (con jerarquía padre → hijo) y de mercado.
- `SECT`: un dominio sectorial por complejo productivo.
- `ACT2SEC`: actividad → dominio sectorial.
- `TOKENMAP`: identificador de ramificación → dominio (mapeo específico).
- `CATMAP`: categoría de ramificación → dominio (fallback).
- `SIGMAP`: `signal_type` → dominio.
- `resolve()`: aplica, en orden, TOKENMAP → señal → cadena de valor → actividad destino →
  sufijos de mercados-destino → productos/insumos (sectorial) → CATMAP → sectorial.
- Recorre `ramifications/` (incluida la herencia de subactividades) y deriva
  `related_activities` / `related_ramifications` / `related_signals`. Los padres agregan a sus hijos.
- `REL_DOMAINS`: relaciones entre dominios, curadas y mínimas.
- Salidas: `transversal.json`, `mercados.json`, `sectoriales.json`, `_index.json`.

Al cambiar `activities.json` o `ramifications/`, volver a ejecutar y revisar el diff.
El generador imprime los tokens de ramificación que no encontraron dominio (debe ser 0).
