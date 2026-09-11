# knowledge/monitoring/

## Propósito

`monitoring/` convierte el catálogo de `knowledge/sources/` en una **estrategia de observación**: qué recurso monitorear, con qué método, con qué frecuencia, cómo detectar que cambió, y qué hacer si falla. Responde:

> ¿Qué debemos observar, de qué fuente, con qué método, con qué frecuencia, bajo qué condiciones, cómo sabemos que cambió y qué queda disponible para las capas siguientes?

```
activities → ramifications → domain-names → sources → MONITORING → cambios → señales → relevancia → inteligencia → decisión
```

Es **configuración y conocimiento**, no runtime: no contiene credenciales, logs, respuestas de API ni documentos descargados (eso vive en almacenamiento/runtime, fuera de `knowledge/`). No construye señales, relevancia, alertas productivas ni recomendaciones — eso corresponde a `signals/` y capas posteriores.

---

## Principio: monitorear no es "consultar todo, siempre"

La frecuencia de monitoreo **no es** `sources[].publication_frequency_code`. Se deriva de:

```
prioridad (de sources/) × volatilidad (inferida por fuente/recurso) → frecuencia base
```

con dos ajustes: una fuente `automation: manual` nunca se programa más seguido que `weekly` (requiere intervención humana), y unas pocas excepciones puntuales donde la tabla genérica no es proporcional (p. ej. ADME: datos horarios de despacho, pero sondear cada 6 h es suficiente — ver `frequencies.json.overrides`).

---

## Estructura

```
monitoring/
├── README.md
├── _index.json                    # recuentos: por frecuencia, método, detección, automatización
├── monitors.json                  # 87 monitores (uno por fuente, o por recurso en fuentes compuestas)
├── methods.json                   # catálogo de adaptadores reutilizables + política de reintentos/backoff + taxonomía de errores
├── change-detection.json          # catálogo de métodos de detección de cambios + clases de cambio + umbrales
├── frequencies.json               # vocabulario de frecuencias + tabla prioridad×volatilidad + excepciones
├── manual-capture-workflow.json   # flujo de captura asistida para las 30 fuentes manuales (12 critical/high)
├── gaps.json                      # los 10 gaps de sources/ + impacto en futuros tipos de señal
└── _build/                        # generate.py (reproducible, solo lectura de sources/)
```

No se creó `schedules.json`: el `frequency` va en cada monitor de `monitors.json` y su tabla de derivación en `frequencies.json` — un archivo aparte solo duplicaría la misma información.

## Esquema de un monitor (`monitors.json`)

```json
{
  "id": "inac::faena-y-precios",
  "source_id": "inac",
  "resource_id": "faena-y-precios",
  "resource_name": "Faena semanal y precios de hacienda",
  "enabled": true,
  "method": "file_download",
  "frequency": "daily",
  "priority": "critical",
  "volatility": "high",
  "automation": "automatable",
  "scope": { "parametrized_by": "market", "parameters": ["china", "union-europea", "estados-unidos", "mercosur"] },
  "change_detection": { "method": "record_diff" },
  "fallback": { "activation": "on_failure_or_unavailable", "by_domain": { "complejo-carne-bovina": ["mgap-diea", "mgap-opypa"] } },
  "last_run": null, "last_success": null, "last_change": null,
  "notes": ""
}
```

- **`id`** = `source_id::resource_id`. La mayoría de las fuentes tiene un único recurso (`principal`); **10 fuentes compuestas** (BCU, ADME, INAC, MIEM-DNE, INE, Uruguay XXI, URSEA, DIEA, INALE, IMPO) se dividieron en **87 monitores** porque sus recursos tienen volatilidad/prioridad propias (p. ej. BCU: cotizaciones diarias vs. cuentas nacionales trimestrales).
- **`method`**: uno de los 6 adaptadores de `methods.json` — **no** un adaptador por fuente.
- **`scope.parametrized_by: "market"`**: cuando la fuente cubre varios destinos (`sources[].markets`), es **una consulta parametrizada**, nunca una fuente por país (caso INAC/INALE/Uruguay XXI/Comtrade/Trade Map/WOAH/DNA/INAVI).
- **`fallback.by_domain`**: se activa **solo ante fallo** de la fuente que lidera ese dominio (`sources/mappings.json`); no se consulta la de respaldo en paralelo.
- **`last_run` / `last_success` / `last_change`**: placeholders de esquema para el runtime — quedan `null` aquí.
- **Seguridad**: ningún monitor contiene API keys, tokens ni contraseñas; `access.requires_auth` (heredado de `sources/`) indica que la autenticación se resuelve en gestión de secretos externa.

## Adaptadores (`methods.json`)

Reutilizables — **6**, no 77 implementaciones aisladas: `api_rest_json`, `api_soap` (BCU), `ckan_api` (catálogos CKAN: AGESIC, INUMET, DNA, BPS), `feed` (RSS/Atom: IMPO), `file_download` (Excel/CSV/PDF estructurado — el más común), `manual_capture`. Cada uno trae su propia política de reintentos (`max_retries`, `backoff`) y si aplica caché.

## Detección de cambios (`change-detection.json`)

6 métodos (`value_comparison`, `record_diff`, `structural_diff`, `new_item_detection`, `hash_comparison`, `new_document_detection`), cada uno emitiendo un subconjunto de las 8 clases de cambio (`sin_cambio` … `error_de_adquisicion`). Un cambio de contenido **no es lo mismo** que una señal estratégica: esta capa se detiene en "qué cambió", no en "qué significa". Los umbrales (`absolute_threshold`, `relative_threshold`, `percentage_threshold`, `minimum_variation`) quedan **definidos como tipo**, sin valores — eso lo fija `signals/`.

## Idempotencia y caché

Dos ejecuciones con el mismo contenido deben producir `sin_cambio` (no una falsa señal): todo adaptador con recursos periódicos declara `cache.ttl_relative_to_frequency: true`, de forma que no se re-descarga dentro de la ventana de su propia frecuencia.

---

## Fuentes manuales (`manual-capture-workflow.json`)

**30 monitores** con `method: manual_capture` (12 de prioridad `critical`/`high`: `camara-mercantil`, `ciu`, `cuti`, `inia`, `ircca`, `itc-trademap`, `mgap-dgsg`, `mgap-dgssaa`, `mgap-opypa`, `ministerio-ambiente`, `mtss`, `sul`). Flujo de 5 etapas — captura asistida → validación → ingreso → normalización mínima → detección de cambios — con campos obligatorios en cada una (documento, fecha, origen, período, versión, hash, estado de validación) para que una captura manual tenga la **misma trazabilidad** que una automatizada. Un PDF nuevo no implica cambio de información por sí solo.

---

## Gaps heredados (`gaps.json`)

Los 10 gaps de `sources/gaps.json` se retoman con el `future_signal_types_affected` (tipos de `strategic_signals` de `ramifications/_signal_types.json` que dependerían de esa información) y un `monitoring_status` (`proxy_monitored` si algún monitor ya cubre un proxy parcial, `not_monitored` si no). No se inventó cobertura para cerrarlos.

---

## Monitoreo centralizado, no por usuario

Un recurso se monitorea **una sola vez** (un monitor por `source_id::resource_id`); qué perfiles productivos lo necesitan es una relación que ya existe (`sources[].activities`, y de ahí a `domain-names/` y `ramifications/`) y que la futura capa de relevancia consulta, **no** algo que duplique el monitor. 77 fuentes → 87 monitores (por los recursos compuestos), nunca monitores por usuario ni por país.

---

## Qué NO contiene

Credenciales, logs, respuestas de API, documentos descargados, histórico operativo, señales, relevancia, alertas productivas, recomendaciones ni dashboards.

---

## Preparación para `signals/`

- Cada `change_detection.method` ya distingue **cambio técnico** de **cambio de contenido**: `signals/` puede partir de `cambio_de_contenido` / `valor_modificado` / `nuevo_registro`, ignorando `fuente_no_disponible` / `error_de_adquisicion` (esas son alertas técnicas, no productivas).
- Los umbrales (`absolute_threshold`, etc.) están tipados pero sin valores: `signals/` debe fijarlos por dominio/actividad.
- `gaps.json` indica qué `strategic_signals` (tipos de `_signal_types.json`) no deben prometerse como `critical` sin antes resolver la fuente.
- La trazabilidad `cambio → captura → recurso → fuente → institución` y `cambio → dominio → actividad → ramificación` ya está armada vía `source_id`/`domains`/`activities`/`ramifications` de cada monitor: `signals/` solo necesita sumar el paso `cambio → señal`.
