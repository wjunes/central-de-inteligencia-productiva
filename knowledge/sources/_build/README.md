# _build

Regenera `knowledge/sources/` a partir de `sources.seed.json` + `knowledge/domain-names/` + `knowledge/ramifications/`.

```
python knowledge/sources/_build/generate.py
```

## `sources.seed.json`  (editar aquí)
Catálogo curado de fuentes. Campos por fuente: ver `knowledge/sources/README.md`.
- `domains`: dominios que la fuente alimenta como primaria.
- `domains_secondary`: dominios que cubre parcialmente / como respaldo.
- `lead_domains`: dominios donde esta fuente es LA referencia (desempata contra otras primarias).

## `generate.py`
- Valida que cada `domain` referenciado exista en `domain-names/`.
- Deriva por fuente `activities`, `ramifications` (acotado a 60) y `signals` cruzando con `domain-names/_index.json`
  (solo para dominios sectoriales o de baja fan-out, para no atribuir "todas las actividades" a una fuente transversal).
- Deriva `access.automation` (del método), `quality.accessibility` (de auth/costo) y `publication_frequency_code`
  (de `publication_frequency` por palabras clave) — no se editan a mano en el seed.
- `mappings.json`: por dominio, `primary` (mejor fuente, con desempate por `lead_domains`), `fallback` (otras primarias), `secondary`, y `coverage`
  (`complete` / `partial` / `weak` / `complete_via_children` / `missing`).
- `FORCED_PARTIAL`: dominios con caveat conocido (fuente de pago, proxy, baja frecuencia) que quedan `partial` aunque exista fuente.
- `gaps.json`: dominios sin cobertura completa + nota explicativa.
- `_index.json`: recuentos, `by_automation`, fuentes críticas, fuentes de alta prioridad no automatizables, y el GAP conocido heredado de `domain-names` (`barreras-y-requisitos-de-acceso`, no corregido aquí).

Al cambiar `domain-names/` o al agregar/quitar fuentes, volver a ejecutar y revisar el diff.
