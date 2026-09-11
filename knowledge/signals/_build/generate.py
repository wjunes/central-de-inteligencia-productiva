# -*- coding: utf-8 -*-
"""
Regenera knowledge/signals/ a partir de knowledge/monitoring/ y knowledge/sources/
(solo lectura: no modifica ninguna capa anterior).

Filosofia (ver README.md):
- signal-types.json, rules.json y thresholds.json son CURADOS a mano (constantes
  de este script) porque su contenido es criterio de diseno, no un calculo.
- mappings.json y gaps.json son DERIVADOS por join de ids ya existentes en
  monitoring/ y sources/ (nunca se redefine una taxonomia, solo se referencia).

Ejecutar:
    python knowledge/signals/_build/generate.py
"""
import json
import os
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))                 # knowledge/signals/_build
KNOWLEDGE = os.path.dirname(os.path.dirname(HERE))                 # knowledge
SIGNALS_DIR = os.path.join(KNOWLEDGE, "signals")
GENERATED = "2026-09-11"


def load(rel_path):
    with open(os.path.join(KNOWLEDGE, rel_path), encoding="utf-8") as f:
        return json.load(f)


def dump(name, obj):
    path = os.path.join(SIGNALS_DIR, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"  wrote {name}")


# ---------------------------------------------------------------------------
# 1. INPUTS (solo lectura)
# ---------------------------------------------------------------------------
monitors = load("monitoring/monitors.json")["monitors"]
sources_list = load("sources/sources.json")["sources"]
sources_by_id = {s["id"]: s for s in sources_list}
signal_types_catalog = load("ramifications/_signal_types.json")["signal_types"]
catalog_topic_ids = {t["id"] for t in signal_types_catalog}
monitoring_gaps = load("monitoring/gaps.json")["domains_without_full_coverage"]
change_detection = load("monitoring/change-detection.json")
change_classes = set(change_detection["change_classes"])
cd_methods = change_detection["methods"]

os.makedirs(SIGNALS_DIR, exist_ok=True)

errors = []

# ---------------------------------------------------------------------------
# 2. signal-types.json  (curado)
# ---------------------------------------------------------------------------
SIGNAL_TYPES = [
    {
        "id": "cambio-significativo",
        "name": "Cambio significativo",
        "description": "Un valor monitoreado se modifico y la magnitud del cambio alcanza o supera el umbral definido para ese dominio/actividad/indicador.",
        "criteria": "change_class = valor_modificado AND magnitud >= umbral aplicable (ver thresholds.json).",
        "derived_from_change_classes": ["valor_modificado"],
    },
    {
        "id": "nuevo-elemento",
        "name": "Nuevo elemento",
        "description": "Aparicion de un registro, documento o entrada que no existia en la captura anterior del mismo recurso.",
        "criteria": "change_class = nuevo_registro.",
        "derived_from_change_classes": ["nuevo_registro"],
    },
    {
        "id": "elemento-retirado",
        "name": "Elemento retirado",
        "description": "Baja de un registro que estaba presente en la captura anterior (p. ej. una habilitacion revocada, un producto delistado).",
        "criteria": "change_class = registro_eliminado.",
        "derived_from_change_classes": ["registro_eliminado"],
    },
    {
        "id": "cambio-estructural",
        "name": "Cambio estructural",
        "description": "Cambio en el esquema o la estructura del recurso monitoreado (campo nuevo, campo eliminado, reclasificacion), o cambio de contenido detectado con evidencia de estructura (no solo hash).",
        "criteria": "change_class = estructura_modificada, o change_class = cambio_de_contenido cuando el metodo de deteccion es structural_diff.",
        "derived_from_change_classes": ["estructura_modificada", "cambio_de_contenido"],
    },
    {
        "id": "tendencia",
        "name": "Tendencia",
        "description": "Persistencia de cambios significativos en la misma direccion, sobre el mismo indicador y monitor, durante varias observaciones consecutivas sin reversion.",
        "criteria": ">=3 senales consecutivas de tipo cambio-significativo, mismo monitor_id + mismo indicador + misma direction, sin reversion intermedia (ver rules.json: tendencia-por-persistencia).",
        "derived_from_change_classes": [],
    },
]

EXCLUDED_AS_TYPES = [
    {
        "candidate": "riesgo",
        "decision": "no_incluido_como_signal_type",
        "reason": "Afirmar que un cambio observable 'es un riesgo' incorpora interpretacion de contexto (para quien, cuan grave, con que probabilidad). Eso es trabajo de relevance/ e intelligence/, no de signals/. signals/ estructura el cambio (p. ej. 'oferta cae 12%'); calificarlo como riesgo u oportunidad es una capa posterior.",
    },
    {
        "candidate": "oportunidad",
        "decision": "no_incluido_como_signal_type",
        "reason": "Misma razon que 'riesgo': requiere evaluar para quien y en que contexto productivo es favorable, lo cual excede la responsabilidad de esta capa.",
    },
    {
        "candidate": "cambio_de_precios / cambio_de_costos / cambio_de_oferta / cambio_de_demanda / cambio_regulatorio / cambio_comercial / cambio_productivo / cambio_climatico / cambio_sanitario / cambio_logistico / cambio_tecnologico / cambio_financiero",
        "decision": "no_incluido_como_signal_type",
        "reason": "Redundante con el TEMA (topic) de la senal, que ya existe como catalogo transversal en knowledge/ramifications/_signal_types.json (precios, costos, oferta, demanda, regulacion, comercio-exterior, clima-agua, sanidad, infraestructura-logistica, tecnologia, financiamiento, etc.). Crear un signal_type por tema duplicaria esa taxonomia. Se modela como topic_id (campo separado), y la naturaleza del cambio (que clase de evento es) queda en signal_type.",
    },
    {
        "candidate": "cambio_significativo (variantes precio_alza/precio_baja, etc.)",
        "decision": "no_se_bifurca_por_direccion",
        "reason": "La direccion (increase/decrease/new/removed/...) es una dimension propia (ver dimensions.direction), no un signal_type distinto. Evita proliferacion de tipos (precio-alza, precio-baja, costo-alza, costo-baja, ...).",
    },
]

DIMENSIONS = {
    "direction": ["increase", "decrease", "new", "removed", "stable", "accelerating", "decelerating", "unknown"],
    "provenance": {
        "values": ["observed", "derived", "estimated", "projected", "inferred"],
        "note": "Procedencia epistemologica del valor que origina la senal. La mayoria de los monitores automatizados producen 'observed'; una fuente manual con extraccion propia puede producir 'derived'.",
    },
    "status": {
        "values": ["detected", "validated", "active", "expired", "superseded", "dismissed"],
        "note": "Estado de la senal en si misma. No confundir con un estado de notificacion al usuario (eso pertenece a una capa posterior).",
    },
}

signal_types_doc = {
    "generated": GENERATED,
    "description": "Taxonomia pequena y transversal de la NATURALEZA de una senal estructurada (que clase de evento es). El TEMA de la senal (de que trata) usa el catalogo ya existente de knowledge/ramifications/_signal_types.json via topic_id; no se duplica aqui.",
    "principle": "signal_type != topic_id != direction. Son tres dimensiones independientes de la misma senal (ver seccion 9-10 del prompt de construccion).",
    "signal_types": SIGNAL_TYPES,
    "excluded_as_types": EXCLUDED_AS_TYPES,
    "topic_reference": "knowledge/ramifications/_signal_types.json (19 ids). Usar el campo topic_id de cada senal para referenciarlo; no crear un catalogo de temas nuevo en signals/.",
    "dimensions": DIMENSIONS,
}

# ---------------------------------------------------------------------------
# 3. rules.json  (curado)
# ---------------------------------------------------------------------------
rules_doc = {
    "generated": GENERATED,
    "principle": "Un change_class de monitoring/ no se convierte automaticamente en senal. Estas reglas determinan, para cada change_class relevante, si corresponde estructurar una senal, con que signal_type, o si el cambio queda sin senal / pendiente de umbral / pendiente de validacion.",
    "excluded_change_classes": {
        "values": ["sin_cambio", "fuente_no_disponible", "error_de_adquisicion"],
        "reason": "Son estados tecnicos de adquisicion (ver monitoring/change-detection.json), no eventos productivos. Se conservan para observabilidad operativa; nunca se estructuran como senal (caso de prueba 4 y 5, ver README).",
    },
    "rules": [
        {
            "id": "valor-modificado-sobre-umbral",
            "change_class": "valor_modificado",
            "condition": "Existe un umbral definido (thresholds.json) para el dominio/actividad/indicador y la magnitud del cambio lo iguala o supera.",
            "outcome": "signal",
            "signal_type": "cambio-significativo",
        },
        {
            "id": "valor-modificado-bajo-umbral",
            "change_class": "valor_modificado",
            "condition": "Existe un umbral definido y la magnitud no lo alcanza.",
            "outcome": "no_signal",
            "rationale": "Variacion dentro del rango esperado del indicador: ruido, no senal (caso de prueba 1).",
        },
        {
            "id": "valor-modificado-sin-umbral",
            "change_class": "valor_modificado",
            "condition": "No existe todavia un umbral definido para ese dominio/actividad/indicador.",
            "outcome": "pending_threshold",
            "rationale": "No se inventa un umbral (regla explicita del prompt de construccion, seccion 7). El cambio se registra como candidato y queda pendiente hasta que thresholds.json lo defina.",
        },
        {
            "id": "nuevo-registro-publicacion-periodica",
            "change_class": "nuevo_registro",
            "condition": "El metodo de deteccion es new_document_detection: la aparicion del documento ES el objeto de monitoreo (anuario, informe, boletin).",
            "outcome": "signal",
            "signal_type": "nuevo-elemento",
        },
        {
            "id": "nuevo-registro-dataset",
            "change_class": "nuevo_registro",
            "condition": "El metodo de deteccion es record_diff o new_item_detection sobre un dataset/catalogo.",
            "outcome": "signal_candidate_requires_grouping",
            "signal_type": "nuevo-elemento",
            "rationale": "Cada alta puede ser relevante (p. ej. nueva habilitacion sanitaria), pero un dataset puede tener varias altas por captura. Se estructura como senal sujeta a deduplicacion/agrupacion (ver 'deduplication'); filtrar por relevancia productiva especifica es tarea de relevance/, no de esta capa.",
        },
        {
            "id": "registro-eliminado",
            "change_class": "registro_eliminado",
            "condition": "record_diff detecta la baja de un registro presente en la captura anterior.",
            "outcome": "signal",
            "signal_type": "elemento-retirado",
        },
        {
            "id": "cambio-de-contenido-hash",
            "change_class": "cambio_de_contenido",
            "condition": "Detectado por hash_comparison sobre un documento o pagina sin estructura de registros.",
            "outcome": "pending_validation",
            "rationale": "hash_comparison detecta cualquier cambio de bytes, incluida una reformulacion cosmetica o una republicacion (ver manual-capture-workflow.json: 'un PDF nuevo no implica cambio de informacion'). No se promueve a senal sin confirmar que cambio el contenido sustantivo.",
        },
        {
            "id": "cambio-de-contenido-estructural",
            "change_class": "cambio_de_contenido",
            "condition": "Detectado por structural_diff (JSON/XML con esquema propio).",
            "outcome": "signal",
            "signal_type": "cambio-estructural",
        },
        {
            "id": "estructura-modificada",
            "change_class": "estructura_modificada",
            "condition": "structural_diff detecta cambio de esquema (campo agregado, quitado o de tipo modificado).",
            "outcome": "signal",
            "signal_type": "cambio-estructural",
        },
        {
            "id": "tendencia-por-persistencia",
            "change_class": "n/a - deriva de una secuencia de senales ya estructuradas, no de un change_class individual",
            "condition": ">=3 senales consecutivas de tipo cambio-significativo, mismo monitor_id + mismo indicador + misma direction, sin reversion intermedia, dentro de una ventana de observacion.",
            "outcome": "signal",
            "signal_type": "tendencia",
            "rationale": "Distingue cambio puntual de tendencia. No usa estadistica compleja: es un conteo de persistencia direccional (seccion 13 del prompt).",
            "note": "El minimo de 3 observaciones y la ventana son un valor estructural por defecto, ajustable por dominio/indicador cuando haya evidencia (ver thresholds.json). No se afirma tendencia con menos de 3 observaciones (caso de prueba: ver README).",
        },
    ],
    "deduplication": {
        "key": ["monitor_id", "indicator_or_resource_id", "period_compared", "direction"],
        "rule": "Una nueva captura con el mismo change_class, el mismo resultado y la misma clave de deduplicacion que la ultima senal activa no genera una senal nueva: se trata como persistencia de la senal existente (ver signal-types.json: dimensions.status).",
        "applies_especially_to": "Fuentes de alta frecuencia (daily / every_6_hours) con condicion persistente (p. ej. una sequia que continua varias semanas). Caso de prueba 6 del prompt de construccion.",
    },
    "grouping": {
        "allowed": True,
        "condition": "Varios cambios distintos (distinto monitor_id) referidos al mismo dominio/actividad y periodo pueden agruparse compartiendo un grouping_id, conservando cada change_id original.",
        "prohibited": "Afirmar una relacion causal entre los cambios agrupados (seccion 21 del prompt: no inferir causalidad por simultaneidad).",
        "example": "precio de hacienda sube + tipo de cambio sube en la misma semana -> dos senales con un grouping_id comun, sin afirmar que una causo la otra.",
    },
}

# ---------------------------------------------------------------------------
# 4. thresholds.json  (curado; deliberadamente sin valores inventados)
# ---------------------------------------------------------------------------
thresholds_doc = {
    "generated": GENERATED,
    "principle": "Los tipos de umbral (absolute_threshold, relative_threshold, percentage_threshold, minimum_variation) estan definidos en monitoring/change-detection.json y no se redefinen aqui. Este archivo fija valores solo donde hay base objetiva; donde no la hay, el caso queda pendiente en vez de inventar un numero (regla explicita del prompt, seccion 7).",
    "threshold_types_ref": "knowledge/monitoring/change-detection.json#thresholds.types",
    "noise_floor": {
        "applies_to": "value_comparison",
        "type": "minimum_variation",
        "rule": "Un valor_modificado con variacion menor a la precision/resolucion reportada por la fuente (p. ej. redondeo) se descarta antes de evaluar cualquier otro umbral.",
        "rationale": "Piso tecnico de calidad de dato, no un umbral de negocio. Evita falsas senales por ruido de captura.",
    },
    "profiles_by_volatility": {
        "note": "monitors.json ya calcula volatility (high/medium/low/event) via priority x volatility. Sirve de guia de orden de magnitud mientras no exista un umbral especifico por indicador.",
        "high": {"suggested_threshold_type": "percentage_threshold", "status": "pending_definition_per_indicator"},
        "medium": {"suggested_threshold_type": "percentage_threshold", "status": "pending_definition_per_indicator"},
        "low": {"suggested_threshold_type": "relative_threshold", "status": "pending_definition_per_indicator"},
        "event": {"suggested_threshold_type": "n/a", "status": "cualquier ocurrencia del evento es candidata a senal; no es un umbral de magnitud"},
    },
    "overrides": [],
    "overrides_schema": {
        "domain_id": "id de knowledge/domain-names/",
        "activity_id": "id de knowledge/activities/ (opcional, mas especifico que domain_id)",
        "indicator": "nombre del indicador o variable dentro del recurso monitoreado",
        "threshold_type": "uno de threshold_types_ref",
        "value": "valor numerico o expresion",
        "direction": "opcional: solo aplica a increase/decrease",
        "source_of_value": "quien o que justifico el numero (obligatorio si value esta presente)",
    },
    "why_empty": "No se fijo ningun valor numerico por dominio/actividad/indicador en esta etapa: ninguna capa anterior registra series historicas ni volatilidad medida (solo una clasificacion cualitativa high/medium/low en monitoring/). Fijar un numero sin esa base seria inventar el umbral. El esquema queda listo para completarse incrementalmente (ver gaps.json).",
}

# ---------------------------------------------------------------------------
# 5. mappings.json  (derivado por join de ids existentes)
# ---------------------------------------------------------------------------
by_topic = defaultdict(list)
monitors_without_topics = []
unknown_source_ids = []

for m in monitors:
    src = sources_by_id.get(m["source_id"])
    if src is None:
        unknown_source_ids.append(m["source_id"])
        continue
    topics = src.get("signals", [])
    if not topics:
        monitors_without_topics.append(m["id"])
    for t in topics:
        if t not in catalog_topic_ids:
            errors.append(f"topic desconocido '{t}' en sources.json[{src['id']}].signals")
        by_topic[t].append(m["id"])

topics_without_monitors = sorted(catalog_topic_ids - set(by_topic.keys()))

mappings_doc = {
    "generated": GENERATED,
    "principle": "No duplica las taxonomias de activities/, ramifications/, domain-names/ ni sources/: documenta como reconstruir sus relaciones desde una senal, y materializa unicamente el indice inverso topic -> monitores, que ninguna capa anterior expone.",
    "join_path": {
        "signal_to_change": "signal.change.monitor_id -> knowledge/monitoring/monitors.json[id]",
        "change_to_source": "monitor.source_id -> knowledge/sources/sources.json[id] (institucion, tipo, autoridad, calidad)",
        "change_to_domains": "sources.json[source_id].domains (+ domains_secondary) -> knowledge/domain-names/*.json[id]",
        "change_to_activities": "sources.json[source_id].activities -> knowledge/activities/activities.json[id]",
        "change_to_ramifications": "sources.json[source_id].ramifications -> knowledge/ramifications/<activity_id>.json",
        "change_to_topics": "sources.json[source_id].signals -> knowledge/ramifications/_signal_types.json[id] (ya derivado en sources/, no se recalcula aqui)",
        "change_to_markets": "monitor.scope.parameters (si scope.parametrized_by == 'market') -> knowledge/domain-names/mercados.json#mercados-destino.market_dimensions",
    },
    "by_topic": dict(sorted(by_topic.items())),
    "topics_without_monitors": topics_without_monitors,
    "monitors_without_topics": monitors_without_topics,
    "market_vocabulary_ref": "knowledge/domain-names/mercados.json#mercados-destino.market_dimensions",
}

# ---------------------------------------------------------------------------
# 6. gaps.json  (derivado de monitoring/gaps.json)
# ---------------------------------------------------------------------------
signals_gaps = []
for g in monitoring_gaps:
    domain = g["domain"]
    covering_monitors = []
    for m in monitors:
        src = sources_by_id.get(m["source_id"])
        if not src:
            continue
        if domain in (src.get("domains", []) + src.get("domains_secondary", [])):
            covering_monitors.append(m["id"])
    support = "signal_partially_supported" if g["monitoring_status"] == "proxy_monitored" else "signal_unsupported"
    signals_gaps.append({
        "domain": domain,
        "topics_affected": g["future_signal_types_affected"],
        "signal_support": support,
        "covering_monitors": sorted(set(covering_monitors)),
        "restriction": "No estructurar una senal de estos topics con implicancia 'critical' sin documentar que la fuente que la origina es un proxy parcial.",
        "note": g["note"],
    })

gaps_doc = {
    "generated": GENERATED,
    "source": "knowledge/monitoring/gaps.json",
    "principle": "Un signal_type no debe prometerse como soporte de una senal 'critical' sobre un dominio cuya cobertura es parcial o proxy. Este archivo traduce los 10 gaps heredados a su soporte real de senales (seccion 29-30 del prompt de construccion).",
    "signal_support_values": ["signal_supported", "signal_partially_supported", "signal_unsupported"],
    "signals_without_full_support": signals_gaps,
    "none_fully_unsupported": all(g["signal_support"] != "signal_unsupported" for g in signals_gaps),
    "additional_gap_detected": {
        "gap": "topics_without_monitors",
        "capa": "sources/ y domain-names/ (heredado; no corregido aqui)",
        "elemento": "campo 'signals' por fuente en sources.json, y 'related_signals' por dominio en domain-names/",
        "motivo": (
            "La derivacion de sources/ es deliberadamente conservadora (solo dominios sectoriales o de baja fan-out, "
            "para no atribuir todas las actividades a una fuente transversal - ver sources/_build/README.md) y "
            "domain-names/related_signals solo cubre las ~23 actividades curadas manualmente en ramifications/ "
            "(42 asociaciones sobre 112 dominios). 7 de los 19 topics del catalogo "
            "(tecnologia, costos, infraestructura-logistica, recursos-naturales, financiamiento, sustitucion, "
            "empleo-talento) no aparecen en NINGUNA fuente ni dominio."
        ),
        "impacto": (
            "mappings.json.by_topic queda vacio para esos 7 topics aunque existan monitores relacionados en la practica "
            "(p. ej. BCU para financiamiento, INEFOP/CUTI para empleo-talento). monitoring/gaps.json ya resuelve esto "
            "puntualmente para los 10 dominios con gap via un mapa curado a mano (SIGNAL_IMPACT); fuera de esos 10 "
            "dominios, el indice por topic sigue siendo incompleto para esos 7 ids."
        ),
        "correccion_propuesta": (
            "Completar sources.json[].signals y/o domain-names/*.related_signals para los 7 topics no utilizados, "
            "en una futura revision de sources/ o domain-names/ (no de signals/). Mientras tanto, quien consuma "
            "mappings.json debe tratar by_topic como un indice PARCIAL, no exhaustivo, para esos 7 ids."
        ),
        "corregido_en_esta_tarea": False,
    },
    "topics_without_monitors": topics_without_monitors,
}

# ---------------------------------------------------------------------------
# 7. validaciones
# ---------------------------------------------------------------------------
all_monitor_ids = {m["id"] for m in monitors}
if len(all_monitor_ids) != len(monitors):
    errors.append("hay monitor ids duplicados en monitoring/monitors.json")

seen_ids = set()
for coll_name, coll in [("signal_types", SIGNAL_TYPES)]:
    for item in coll:
        if item["id"] in seen_ids:
            errors.append(f"id duplicado en {coll_name}: {item['id']}")
        seen_ids.add(item["id"])
        if not item["id"].isascii() or item["id"] != item["id"].lower():
            errors.append(f"id no ascii/kebab-case en {coll_name}: {item['id']}")

rule_ids = [r["id"] for r in rules_doc["rules"]]
if len(rule_ids) != len(set(rule_ids)):
    errors.append("hay rule ids duplicados en rules.json")

for r in rules_doc["rules"]:
    cc = r["change_class"]
    if cc != "n/a - deriva de una secuencia de senales ya estructuradas, no de un change_class individual" and cc not in change_classes:
        errors.append(f"rule '{r['id']}' referencia change_class desconocido: {cc}")
    st = r.get("signal_type")
    if st and st not in {t["id"] for t in SIGNAL_TYPES}:
        errors.append(f"rule '{r['id']}' referencia signal_type desconocido: {st}")

for topic, mids in by_topic.items():
    for mid in mids:
        if mid not in all_monitor_ids:
            errors.append(f"mappings.by_topic referencia monitor_id inexistente: {mid}")

if unknown_source_ids:
    errors.append(f"monitores con source_id no encontrado en sources.json: {unknown_source_ids}")

# ---------------------------------------------------------------------------
# 8. _index.json
# ---------------------------------------------------------------------------
index_doc = {
    "generated": GENERATED,
    "inputs": [
        "knowledge/monitoring/monitors.json",
        "knowledge/monitoring/gaps.json",
        "knowledge/monitoring/change-detection.json",
        "knowledge/sources/sources.json",
        "knowledge/ramifications/_signal_types.json",
    ],
    "counts": {
        "signal_types_total": len(SIGNAL_TYPES),
        "excluded_candidates": len(EXCLUDED_AS_TYPES),
        "rules_total": len(rules_doc["rules"]),
        "rules_by_outcome": {
            outcome: sum(1 for r in rules_doc["rules"] if r["outcome"] == outcome)
            for outcome in sorted({r["outcome"] for r in rules_doc["rules"]})
        },
        "topics_with_monitors": len(by_topic),
        "topics_without_monitors": len(topics_without_monitors),
        "monitors_without_topics": len(monitors_without_topics),
        "monitors_total": len(monitors),
        "gaps_carried_forward": len(signals_gaps),
        "gaps_signal_partially_supported": sum(1 for g in signals_gaps if g["signal_support"] == "signal_partially_supported"),
        "gaps_signal_unsupported": sum(1 for g in signals_gaps if g["signal_support"] == "signal_unsupported"),
    },
    "known_upstream_gaps": {
        "domain_names": "barreras-y-requisitos-de-acceso (ver knowledge/sources/README.md) - no corregido en esta tarea",
        "sources_and_domain_names_signals_coverage": "7/19 topics del catalogo sin ninguna fuente ni dominio asociado - ver gaps.json.additional_gap_detected - no corregido en esta tarea",
    },
    "validation_errors": errors,
}

# ---------------------------------------------------------------------------
# 9. escritura
# ---------------------------------------------------------------------------
if errors:
    print("ERRORES DE VALIDACION:")
    for e in errors:
        print("  -", e)
else:
    print("Validacion OK (0 errores).")

dump("signal-types.json", signal_types_doc)
dump("rules.json", rules_doc)
dump("thresholds.json", thresholds_doc)
dump("mappings.json", mappings_doc)
dump("gaps.json", gaps_doc)
dump("_index.json", index_doc)

print("\nsignals/ regenerado.")
