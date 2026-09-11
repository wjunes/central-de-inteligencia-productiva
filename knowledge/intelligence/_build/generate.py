# -*- coding: utf-8 -*-
"""
Regenera knowledge/intelligence/ a partir de knowledge/relevance/ (grafo
actividad-actividad) y knowledge/ramifications/ (categorias de cada nodo,
para clasificar sentido costo/ingreso) - solo lectura, no modifica ninguna
capa anterior.

Filosofia (ver README.md):
- intelligence-types.json, rules.json, relationships.json, evidence.json y
  scenarios.json son CURADOS: no hay instancias de señales en el repositorio
  (monitoring/signals/relevance son capas de configuracion, no runtime), asi
  que esta capa define METODOLOGIA verificable, no resultados precalculados.
- gaps.json documenta explicitamente esa ausencia de datos en vivo como la
  limitacion mas importante de esta capa.
- Los pocos numeros derivados (p. ej. tamaño de una expansion de 2 saltos)
  se calculan contra relevance/mappings.json para JUSTIFICAR por que ciertas
  cosas NO se materializan (evita explosion combinatoria).

Ejecutar:
    python knowledge/intelligence/_build/generate.py
"""
import json
import os
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))                    # knowledge/intelligence/_build
KNOWLEDGE = os.path.dirname(os.path.dirname(HERE))                    # knowledge
INTEL_DIR = os.path.join(KNOWLEDGE, "intelligence")
GENERATED = "2026-09-11"


def load(rel_path):
    with open(os.path.join(KNOWLEDGE, rel_path), encoding="utf-8") as f:
        return json.load(f)


def dump(name, obj):
    path = os.path.join(INTEL_DIR, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"  wrote {name}")


os.makedirs(INTEL_DIR, exist_ok=True)
errors = []

# ---------------------------------------------------------------------------
# 1. Inputs (solo lectura)
# ---------------------------------------------------------------------------
relevance_mappings = load("relevance/mappings.json")
activity_graph = relevance_mappings["activity_relevance_graph"]
relevance_levels = {l["id"] for l in load("relevance/levels.json")["levels"]}
signal_types_catalog = load("signals/signal-types.json")
signal_type_ids = {t["id"] for t in signal_types_catalog["signal_types"]}
topic_catalog = load("ramifications/_signal_types.json")["signal_types"]
topic_ids = {t["id"] for t in topic_catalog}
signals_provenance = signal_types_catalog["dimensions"]["provenance"]["values"]

# ---------------------------------------------------------------------------
# 2. Estadística derivada: costo real de materializar 2do orden (justifica NO hacerlo)
# ---------------------------------------------------------------------------
hubs_with_second_hop = 0
raw_second_order_pairs = 0
for origin, entries in activity_graph.items():
    hubs = [e["target_activity_id"] for e in entries if e["target_activity_id"] in activity_graph]
    if hubs:
        hubs_with_second_hop += 1
    for h in hubs:
        # excluye el guard "target != origin" que intelligence/ exige aplicar en el momento
        raw_second_order_pairs += sum(1 for e2 in activity_graph[h] if e2["target_activity_id"] != origin)

first_order_pairs = sum(len(v) for v in activity_graph.values())

# ---------------------------------------------------------------------------
# 3. intelligence-types.json (curado)
# ---------------------------------------------------------------------------
INTELLIGENCE_TYPES = [
    {
        "id": "trend",
        "name": "Tendencia",
        "description": "Interpretación de una persistencia de cambios significativos ya confirmada por signals/ (no se redetecta aquí).",
        "precondition": "Requiere una señal signals/ de signal_type=tendencia (>=3 observaciones consecutivas, ver signals/rules.json:tendencia-por-persistencia). Sin esa precondición, el resultado es insufficient_evidence, nunca una tendencia inventada.",
        "output_adds": "horizonte, actividades afectadas (vía relevance/), nivel de confianza propio (no hereda directamente el de la señal).",
    },
    {
        "id": "impact",
        "name": "Impacto potencial",
        "description": "Interpretación del efecto estructural potencial de una o más señales sobre una actividad, con dirección (favorable/desfavorable/mixto/neutral/incierto) y sujeto explícito (el impacto depende de QUIÉN es el sujeto analizado).",
        "precondition": "Al menos una señal con relevancia != none sobre la actividad (relevance/mappings.json o direct_dependency).",
        "output_adds": "impact_direction por sujeto, nivel de evidencia, distinción observed_impact/expected_impact/potential_impact.",
    },
    {
        "id": "risk",
        "name": "Riesgo potencial",
        "description": "Interpretación de que una señal o conjunto de señales podría representar una amenaza para una actividad, con fundamento objetivo explícito (no una afirmación genérica de 'riesgo').",
        "precondition": "Debe declarar evidence[] con al menos una relación estructural (relevance/) que sustente por qué se clasifica como riesgo, no solo como impacto neutral.",
        "output_adds": "naturaleza del riesgo (referencia a topic_id), horizonte, nivel de evidencia. NUNCA una acción sugerida.",
    },
    {
        "id": "opportunity",
        "name": "Oportunidad potencial",
        "description": "Interpretación simétrica a risk: una señal o conjunto de señales podría representar una condición favorable para una actividad, con fundamento objetivo explícito.",
        "precondition": "Igual que risk.",
        "output_adds": "igual que risk. NUNCA una acción sugerida (ver rules.json.prohibited_language).",
    },
]

EXCLUDED_TYPES = [
    {"candidate": "context", "decision": "no_es_tipo_es_campo_obligatorio", "reason": "Todo unit de inteligencia (sea trend/impact/risk/opportunity) debe declarar su contexto (actividad, ramificación, período, señales base) como CAMPO estructural, no como un tipo aparte (ver rules.json.unit_schema.context)."},
    {"candidate": "market / cost / supply / demand / competitive / regulatory / climate / sanitary / financial / logistics / technological", "decision": "no_incluidos_como_tipos", "reason": "Son el TEMA (topic_id) de un impact/risk/opportunity, no una forma de conocimiento distinta. El tema ya existe como catálogo en ramifications/_signal_types.json (reusado por signals/ y relevance/); crear un tipo por tema duplicaría esa taxonomía por tercera vez."},
    {"candidate": "strategic", "decision": "modelado_como_dimension_scope", "reason": "No es una forma de conocimiento distinta de impact/risk/opportunity: es un horizonte de alcance (operational/tactical/strategic). Se modela como dimensions.scope, no como tipo."},
]

DIMENSIONS = {
    "epistemic_status": {
        "values": signals_provenance + ["scenario"],
        "note": "Extiende signals/signal-types.json.dimensions.provenance (observed/derived/estimated/projected/inferred) agregando 'scenario' para conclusiones condicionadas a supuestos explícitos (ver scenarios.json). No se redefine el vocabulario base, se reusa.",
    },
    "impact_direction": {
        "values": ["positive", "negative", "mixed", "neutral", "uncertain"],
        "note": "Siempre relativo a un SUJETO explícito (ver rules.json.direction_by_subject): una señal favorable para el productor de un bien puede ser 'negative' para su comprador industrial (prompt §16).",
    },
    "horizon": {
        "values": ["past", "current", "near_term", "medium_term", "long_term", "unknown"],
        "note": "Horizonte temporal del fenómeno interpretado. No se infiere un horizonte sin base (p. ej. monitor_frequency del signal de origen, o el propio topic).",
    },
    "scope": {
        "values": ["operational", "tactical", "strategic"],
        "note": "Alcance de la interpretación (reemplaza al candidato 'strategic' como tipo). operational = variación dentro de la operación normal; tactical = afecta decisiones de mediano plazo; strategic = afecta posicionamiento estructural de la actividad.",
    },
    "unit_status": {
        "values": ["draft", "insufficient_evidence", "context_only", "validated", "superseded", "expired", "dismissed"],
        "note": "Estado del unit de inteligencia en sí (no confundir con notificación al usuario, que pertenece a una capa posterior). 'insufficient_evidence' es un resultado válido y explícito (Caso 5), no la ausencia de resultado.",
    },
    "evidence_level": {
        "values": ["direct_evidence", "multiple_sources", "historical_pattern", "structural_relationship", "inference", "scenario"],
        "note": "Qué tan directa es la base de una conclusión (prompt §13). No se colapsa en 'certeza'.",
    },
}

intelligence_types_doc = {
    "generated": GENERATED,
    "description": "Taxonomía pequeña de FORMAS DE CONOCIMIENTO (no de dominios productivos - esos ya están cubiertos por topic_id, reusado de ramifications/_signal_types.json).",
    "intelligence_types": INTELLIGENCE_TYPES,
    "excluded_types": EXCLUDED_TYPES,
    "dimensions": DIMENSIONS,
}

# ---------------------------------------------------------------------------
# 4. Clasificación costo/ingreso por categoría de ramifications/ (curado, reusa vocabulario existente)
# ---------------------------------------------------------------------------
COST_SIDE_CATEGORIES = ["cost_factors", "inputs", "labor_factors", "financial_factors", "resources", "suppliers", "services", "logistics"]
REVENUE_SIDE_CATEGORIES = ["products", "markets", "demand_factors", "customers"]
UNCERTAIN_CATEGORIES = ["climate_factors", "competitive_factors", "economic_factors", "environmental_factors", "infrastructure",
                          "opportunities", "regulatory_factors", "related_activities", "risks", "sanitary_factors",
                          "strategic_signals", "technologies", "value_chain"]
FLIP_RELATIONS = ["supplier", "customer"]     # atravesar una relación comercial invierte costo<->ingreso
UNCERTAIN_RELATIONS = ["infrastructure", "competitor", "related_activity", "complement"]

# ---------------------------------------------------------------------------
# 5. rules.json (curado)
# ---------------------------------------------------------------------------
rules_doc = {
    "generated": GENERATED,
    "principle": "No se evalúa cada señal contra todos los datos disponibles. Se parte de la(s) actividad(es) de origen de la señal (vía signals/mappings.json) y de relevance/mappings.json (ya acotado), nunca de una búsqueda exhaustiva (prompt §39).",
    "unit_schema": {
        "id": "identificador estable, ver deduplication_key",
        "type": "trend | impact | risk | opportunity (ver intelligence-types.json)",
        "topic_id": "reusa ramifications/_signal_types.json - NO se redefine aquí",
        "context": {
            "description": "campo obligatorio en todo unit (reemplaza al candidato 'context' como tipo)",
            "fields": ["primary_activity_id", "ramification_id (si aplica, solo para direct_dependency)", "period", "based_on_signal_ids"],
        },
        "epistemic_status": "ver intelligence-types.json.dimensions.epistemic_status",
        "impact_direction": "ver dimensions.impact_direction - siempre junto a subject_activity_id (ver direction_by_subject)",
        "horizon": "ver dimensions.horizon",
        "scope": "ver dimensions.scope",
        "status": "ver dimensions.unit_status",
        "evidence_level": "ver dimensions.evidence_level",
        "confidence": "ver confidence_dimensions (4 campos distintos, nunca un único número)",
        "evidence": "ver evidence.json - referencias, no datos copiados",
        "related_units": "ver relationships.json",
        "intelligence_importance": "ver intelligence_priority (distinto de signal priority y de relevance level)",
    },
    "confidence_dimensions": {
        "note": "4 campos separados (prompt §14), cada uno con fuente y vocabulario ya existentes - ninguno se inventa.",
        "source_quality": {
            "derived_from": "sources.json[source_id].quality.reliability (very_high/high/medium/low)",
            "meaning": "Qué tan confiable es la institución/fuente de la que proviene la evidencia.",
        },
        "change_detection_confidence": {
            "derived_from": "monitoring/change-detection.json - método usado para detectar el cambio",
            "table": {
                "value_comparison": "high", "record_diff": "high", "structural_diff": "high",
                "new_item_detection": "medium", "new_document_detection": "medium", "hash_comparison": "low",
            },
            "meaning": "hash_comparison no distingue cambio sustantivo de cosmético (ver signals/rules.json: cambio-de-contenido-hash = pending_validation); su confianza de detección es baja por diseño, no por defecto arbitrario.",
        },
        "relevance_confidence": {
            "derived_from": "relevance/mappings.json - tipo de arista usada",
            "table": {
                "direct_dependency": "high",
                "value_chain_relation_direct": "high",
                "value_chain_relation_propagated_via_jerarquia": "medium",
                "domain_coexposure": "low",
            },
            "meaning": "Una relación heredada por jerarquía (ver relevance/rules.json.hierarchy_propagation) es menos específica que una declarada explícitamente para esa actividad puntual.",
        },
        "analysis_confidence": {
            "derived_from": "propio de esta capa",
            "rule": "high si hay >=2 señales independientes con evidence_level>=structural_relationship y clasificación costo/ingreso no ambigua; medium si hay 1 señal directa o la clasificación es parcialmente ambigua; low si depende de una única señal inferida/estimada o de una relación 'uncertain'.",
        },
    },
    "direction_by_subject": {
        "principle": "La dirección de un impacto depende de QUIÉN es el sujeto (prompt §16): no existe una dirección única por señal.",
        "step_1_base_sense": {
            "rule": "La categoría de la ramificación de origen (ramifications/<activity>.json, campo category) determina el sentido base sobre la actividad de origen.",
            "cost_side_categories": COST_SIDE_CATEGORIES,
            "revenue_side_categories": REVENUE_SIDE_CATEGORIES,
            "uncertain_categories": UNCERTAIN_CATEGORIES,
        },
        "step_2_propagation": {
            "rule": "Al propagar el sentido desde la actividad de origen hacia una actividad candidata a UN salto (depth=1) de relevance/mappings.json, atravesar una relación de tipo supplier o customer INVIERTE el sentido (lo que es costo para un lado del intercambio comercial es ingreso para el otro, sobre la MISMA transacción); atravesar infrastructure/competitor/related_activity/complement deja el sentido en 'uncertain' (no hay una regla de inversión/preservación confiable para esas relaciones).",
            "flip_relations": FLIP_RELATIONS,
            "uncertain_relations": UNCERTAIN_RELATIONS,
            "limit": "Esta regla de inversión es válida solo a un salto. A dos saltos, el segundo tramo es una transacción DISTINTA (p. ej. elaboración de aceite vendiendo a biocombustibles no es la misma operación que comprar soja): invertir de nuevo asumiría que el eslabón intermedio traslada el precio 1:1, lo cual no es un hecho estructural. Ver second_order_effects.direction_penalty.",
        },
        "step_3_combine_with_direction": {
            "rule": "impact_direction final (vocabulario de dimensions.impact_direction) = combinar sentido propagado (cost_side/revenue_side/uncertain) con la dirección observada de la señal (increase/decrease, de signals/signal-types.json.dimensions.direction): revenue_side+increase=positive; revenue_side+decrease=negative; cost_side+increase=negative; cost_side+decrease=positive; cualquier combinación con 'uncertain' = uncertain. 'mixed' se reserva para cuando >=2 señales independientes ya combinadas (ver relationships.json) dan positive y negative simultáneos sobre el mismo sujeto.",
        },
        "worked_example": "ver README.md - caso ganadería + soja resuelto con ids reales.",
    },
    "second_order_effects": {
        "rule": "Un efecto de 2do orden es válido solo cuando existe una arista de relevance/mappings.json desde la actividad de origen a un HUB, y otra desde ese HUB a una tercera actividad DISTINTA de la actividad de origen (guard obligatorio: target_2 != origin, para excluir trivialmente A→B→A).",
        "max_depth": 2,
        "confidence_penalty": "Un efecto de 2do orden nunca hereda evidence_level mayor que 'structural_relationship', y su analysis_confidence nunca es 'high' aunque los dos tramos individuales lo sean.",
        "direction_penalty": "impact_direction en un efecto de 2do orden es 'uncertain' por defecto, incluso si el tramo 1 tiene una dirección clara (ver direction_by_subject). Propagar el SENTIDO (no solo la existencia de la relación) más allá de un salto requiere asumir que el eslabón intermedio traslada la presión de costo/ingreso a su propia contraparte comercial - eso es un supuesto de pass-through, no un hecho estructural (si se necesita, se declara como scenario_assumption en scenarios.json, nunca como una conclusión directa de rules.json).",
        "why_not_materialized": f"Una expansión completa de 2do orden sobre relevance/mappings.json generaría del orden de {raw_second_order_pairs} pares candidatos (vs. {first_order_pairs} pares de 1er orden) - se calcula bajo demanda, a partir de la actividad de origen real de cada señal, nunca se precalcula para las 115 actividades (prompt §39-40).",
        "second_order_hub_activities": hubs_with_second_hop,
    },
    "signal_combination": {
        "multiple_related_signals": "Cuando >=2 señales comparten grouping_id (ver signals/rules.json.grouping) o afectan la misma actividad con evidence_level>=structural_relationship, pueden combinarse en un único unit de tipo impact/risk/opportunity con evidence[] múltiple - nunca se crea un unit por señal individual cuando están agrupadas.",
        "independent_signals": "Señales sin grouping_id ni relación estructural conocida entre sí que afectan la misma actividad se mantienen como units separados relacionados por 'related_to' (ver relationships.json), no se fusionan.",
    },
    "trend_precondition": "No se redetecta tendencia aquí: se reusa signals/rules.json:tendencia-por-persistencia (>=3 observaciones, sin reversión). intelligence/trend solo empaqueta esa señal ya validada con contexto y confianza propios.",
    "risk_opportunity_criteria": {
        "rule": (
            "type=risk cuando (a) la ramificación de origen ya tiene category=risks en ramifications/ (factor de riesgo "
            "pre-identificado estructuralmente, p. ej. 'riesgo de sequía' - no se re-deriva, se reusa esa clasificación "
            "existente), O (b) impact_direction=negative con evidence_level>=structural_relationship (un impacto "
            "económico desfavorable claro es en sí mismo un riesgo de negocio). "
            "type=opportunity de forma simétrica: category=opportunities en la ramificación de origen, O "
            "impact_direction=positive con evidence_level>=structural_relationship. "
            "En cualquier otro caso (impact_direction=uncertain/mixed y la categoría de origen no es risks/opportunities), "
            "el resultado correcto es type=impact con impact_direction=uncertain, NUNCA forzar risk/opportunity con "
            "fundamento débil (prompt §25-26)."
        ),
        "rationale": "Separa dos vías de evidencia legítimas: la clasificación estructural que ramifications/ ya hizo por actividad (categorías risks/opportunities, via rules_risk_opp() de ramifications/_build/generate.py) y la clasificación económica costo/ingreso de esta capa (direction_by_subject). No se inventa una tercera vía.",
    },
    "prohibited_language": {
        "rule": "Ningún campo de texto generado a partir de un unit puede usar verbos de recomendación (deber/convenir/recomendar/hay que/es mejor) ni afirmar una decisión. Ver README.md §Lenguaje.",
        "forbidden_terms_example": ["debería", "conviene", "se recomienda", "hay que", "es mejor", "debe invertir", "debe vender", "debe comprar"],
    },
    "deduplication": {
        "key": ["type", "primary_activity_id", "topic_id", "sorted(based_on_signal_ids)"],
        "rule": "Una nueva evaluación con la misma clave y sin evidencia nueva no crea un unit nuevo: es unit_status=persistent (mismo id, se actualiza last_confirmed_at). Si hay evidencia nueva que cambia la interpretación, se crea un intelligence_update (ver update_policy).",
    },
    "update_policy": {
        "rule": "Un intelligence_update conserva: previous_version_id, new_evidence[], reason, updated_at. Nunca se sobrescribe silenciosamente un unit con status=validated (prompt §34).",
    },
    "intelligence_priority": {
        "distinct_from": ["signal priority (monitoring/sources: prioridad de la FUENTE)", "relevance level (relevance/: qué tan conectada está la actividad)"],
        "rule": "intelligence_importance usa la misma escala de 5 niveles (critical/high/medium/low/none) por consistencia con relevance/, pero es un campo propio calculado como función de (type: risk/opportunity pesan más que impact/trend; analysis_confidence; evidence_level; cantidad de señales independientes que lo sustentan). No se copia ni promedia automáticamente desde relevance_level.",
    },
}

# ---------------------------------------------------------------------------
# 6. relationships.json (curado)
# ---------------------------------------------------------------------------
relationships_doc = {
    "generated": GENERATED,
    "principle": "Correlación no es causalidad (prompt §8): ninguna de estas relaciones afirma que una señal causó otra, salvo depends_on, que es una dependencia LÓGICA/estructural (esta interpretación necesita esa evidencia para existir), no económica.",
    "relationship_types": [
        {"id": "derived_from", "meaning": "Un unit de inteligencia tiene esta señal/relación estructural como base directa.", "used_for": "evidence -> unit (obligatorio en todo unit)."},
        {"id": "depends_on", "meaning": "Un unit o conclusión requiere que otro elemento (señal, unit, precondición) sea válido para sostenerse (p. ej. trend depends_on la señal signals/tendencia subyacente).", "used_for": "unit -> unit o unit -> signal."},
        {"id": "related_to", "meaning": "Vínculo débil por coocurrencia (misma actividad, mismo período) sin relación de sentido determinada.", "used_for": "signal <-> signal cuando no aplica reinforces/counteracts (sentido 'uncertain')."},
        {"id": "reinforces", "meaning": "Dos señales/units empujan en el MISMO sentido (favorable+favorable o desfavorable+desfavorable) sobre la misma actividad - ver rules.json.direction_by_subject.", "used_for": "signal <-> signal, unit <-> unit."},
        {"id": "counteracts", "meaning": "Dos señales/units empujan en sentido OPUESTO sobre la misma actividad. No se resuelve cuál domina (prompt §21).", "used_for": "signal <-> signal, unit <-> unit."},
        {"id": "supports", "meaning": "Evidencia adicional (otra fuente, otro monitor) confirma la misma observación de base.", "used_for": "evidence <-> evidence, sobre el mismo change_class/período."},
        {"id": "contradicts", "meaning": "Dos evidencias sobre el mismo hecho reportan valores/direcciones incompatibles.", "used_for": "evidence <-> evidence - ver evidence.json.conflicting_evidence."},
    ],
    "classification_procedure": {
        "step_1": "Calcular el sentido (favorable/desfavorable/uncertain) de cada señal sobre la actividad candidata, según rules.json.direction_by_subject.",
        "step_2": "Si alguno de los dos sentidos es 'uncertain' -> related_to (o uncertain explícito, nunca reinforces/counteracts forzado).",
        "step_3": "Si ambos sentidos coinciden -> reinforces. Si son opuestos -> counteracts.",
        "never": "Nunca se calcula ni se expone cuál de las dos señales 'domina' o el efecto neto (eso es interpretación económica adicional fuera del alcance de esta capa).",
    },
    "worked_example_prompt_21": {
        "setup": "señal A: costos ↑ (categoría cost_factors en la actividad de origen). señal B: precios de venta ↑ (categoría products/markets en la misma actividad de origen).",
        "sense_A": "cost_side + increase = desfavorable",
        "sense_B": "revenue_side + increase = favorable",
        "result": "counteracts (sentidos opuestos sobre la misma actividad) - el sistema NO concluye si el neto es positivo o negativo.",
    },
}

# ---------------------------------------------------------------------------
# 7. evidence.json (curado)
# ---------------------------------------------------------------------------
evidence_doc = {
    "generated": GENERATED,
    "principle": "Toda evidencia es una REFERENCIA a datos ya existentes en capas anteriores, nunca una copia (prompt §29-30).",
    "evidence_types": [
        {"id": "source", "points_to": "sources/sources.json[id]", "example": "inac"},
        {"id": "signal", "points_to": "signals/ (change_class + monitor_id, via signals/mappings.json.join_path)", "example": "monitor_id=inac::faena-y-precios, change_class=valor_modificado"},
        {"id": "historical_pattern", "points_to": "una secuencia de señales previas que sustenta un trend (>=3, ver signals/rules.json:tendencia-por-persistencia)", "example": "3 señales consecutivas de cambio-significativo sobre el mismo indicador"},
        {"id": "structural_relationship", "points_to": "relevance/mappings.json.activity_relevance_graph[origin][] (incluye evidence[] con ramification_id/relation)", "example": "ganaderia-bovina-carne -> frigorifica (customer, critical)"},
        {"id": "calculation", "points_to": "una operación determinística sobre datos existentes (p. ej. decaimiento de relevance/, combinación de sentido de rules.json.direction_by_subject) - se referencia la fórmula, no se recalcula texto libre", "example": "direction_by_subject.step_3_combine_with_direction"},
        {"id": "inference", "points_to": "una conclusión no observada directamente, derivada de relaciones estructurales sin confirmación puntual - debe declarar explícitamente el razonamiento y su evidence_level=inference", "example": "'la soja podría estar bajo presión de costos de combustible' sin una señal directa de combustible"},
        {"id": "scenario_assumption", "points_to": "scenarios.json - un supuesto explícito usado para construir un escenario, no una observación", "example": "'si el precio internacional se mantiene sobre el umbral X durante el próximo trimestre'"},
    ],
    "traceability_chain": {
        "to_source": "intelligence_unit.evidence[] -> signal (monitor_id) -> monitoring/monitors.json -> source_id -> sources/sources.json -> institución",
        "to_productive_structure": "intelligence_unit.context.primary_activity_id -> relevance/mappings.json (evidence) -> ramification_id -> domain vía sources.json[source_id].domains",
        "no_copy_rule": "Ningún archivo de intelligence/ contiene el valor observado, el nombre de la institución ni el texto de la ramificación: solo ids y referencias a los archivos anteriores.",
    },
    "conflicting_evidence": {
        "rule": "Si dos evidencias sobre el mismo hecho (mismo indicador, mismo período) reportan valores o direcciones incompatibles, el estado válido es conflicting_evidence - NO se elige automáticamente una (prompt §31). Debe registrarse: ambas evidencias, fecha, fuente y metodología de cada una si se conoce.",
        "resulting_unit_status": "unit_status=insufficient_evidence hasta que se resuelva o hasta que una capa posterior decida cómo ponderarlas.",
    },
}

# ---------------------------------------------------------------------------
# 8. scenarios.json (curado; metodología, sin instancias)
# ---------------------------------------------------------------------------
scenarios_doc = {
    "generated": GENERATED,
    "principle": "No se genera un escenario por defecto para cada señal (prompt §23). Solo se construye cuando hay variables y relaciones suficientes.",
    "trigger_condition": "Un escenario solo se construye cuando existen >=2 señales relacionadas (reinforces o counteracts, ver relationships.json) sobre la misma actividad, con evidence_level>=structural_relationship en ambas, y ninguna con status=insufficient_evidence.",
    "structure": {
        "id": "identificador estable",
        "based_on_units": "ids de intelligence units involucrados (derived_from)",
        "scenarios": [
            {"id": "escenario_base", "description": "Continuación de las condiciones observadas sin cambios adicionales."},
            {"id": "escenario_favorable", "description": "Los supuestos se mueven en el sentido favorable para la actividad (ver direction_by_subject)."},
            {"id": "escenario_adverso", "description": "Los supuestos se mueven en el sentido desfavorable."},
        ],
        "required_fields_per_scenario": ["assumptions[]", "variables_involved[]", "horizon", "uncertainty_statement", "evidence[]"],
    },
    "prohibitions": {
        "no_probability_without_basis": "No se asigna una probabilidad numérica a un escenario salvo que exista una base estadística real (no existe en el repositorio actual - ver gaps.json).",
        "no_default_generation": "No generar escenarios automáticamente para toda señal o unit; requiere trigger_condition.",
    },
    "instances_in_this_layer": 0,
    "why_zero": "No existen señales en vivo en el repositorio (monitoring/signals/relevance son configuración, no runtime) - no hay pares de señales relacionadas reales sobre los que construir un escenario todavía. Se define la metodología, lista para aplicarse cuando existan instancias reales.",
}

# ---------------------------------------------------------------------------
# 9. gaps.json (derivado + documentado)
# ---------------------------------------------------------------------------
gaps_doc = {
    "generated": GENERATED,
    "principle": "Nunca ocultar un gap para producir una conclusión aparentemente completa (prompt §47).",
    "no_live_instances": {
        "gap": "GAP ESTRUCTURAL (no es un error, es el estado real del proyecto)",
        "description": "No existe ninguna instancia real de señal, cambio o captura en el repositorio: monitoring/, signals/, relevance/ e intelligence/ son las cuatro capas de CONFIGURACIÓN/METODOLOGÍA construidas hasta ahora, no datos en vivo. Por lo tanto, ningún intelligence_unit de esta entrega es una conclusión real: son la metodología y ejemplos trabajados contra ids reales del repositorio (ver README.md), no resultados de un análisis de datos vivos.",
        "impact": "Los casos de prueba del prompt (§48-52) se verifican CONCEPTUALMENTE con datos estructurales reales (relevance/mappings.json, categorías de ramifications/) pero no con una señal observada real, porque no existe ninguna.",
        "corregido_en_esta_tarea": False,
        "note": "Esto no es exclusivo de intelligence/: es una propiedad de la arquitectura completa tal como fue solicitada capa por capa.",
    },
    "ambiguous_direction_categories": {
        "gap": "GAP DE PRECISIÓN",
        "count": len(UNCERTAIN_CATEGORIES),
        "categories": UNCERTAIN_CATEGORIES,
        "motivo": f"{len(UNCERTAIN_CATEGORIES)} de {len(COST_SIDE_CATEGORIES) + len(REVENUE_SIDE_CATEGORIES) + len(UNCERTAIN_CATEGORIES)} categorías de ramifications/ no tienen un sentido costo/ingreso determinable de forma genérica (p. ej. 'regulatory_factors' puede ser costo de cumplimiento o habilitar una nueva oportunidad según el caso).",
        "impacto": "Toda señal cuya ramificación de origen tenga una de estas categorías produce impact_direction=uncertain, nunca risk/opportunity (ver rules.json.risk_opportunity_criteria) - no se fabrica una dirección para forzar una clasificación.",
        "corregido_en_esta_tarea": False,
    },
    "second_order_not_materialized": {
        "gap": "LIMITACIÓN DE DISEÑO DELIBERADA (no un gap de datos)",
        "raw_pairs_if_materialized": raw_second_order_pairs,
        "first_order_pairs": first_order_pairs,
        "decision": "No se precalculan efectos de 2do orden (ver rules.json.second_order_effects) por eficiencia; se calculan bajo demanda a partir de la señal real.",
    },
    "known_upstream_gaps_carried_forward": {
        "domain_names": "barreras-y-requisitos-de-acceso - no corregido aquí",
        "sources_signals_topic_coverage": "7/19 topics sin fuente/dominio asociado (signals/gaps.json) - no corregido aquí",
        "relevance_market_granularity": "exposición a mercado solo a nivel de fuente/dominio, no por actividad (relevance/gaps.json) - no corregido aquí",
        "relevance_self_loops": "3 self-loops de ramifications/ (agencias-operadores, alojamiento, cosecha-forestal) - ya excluidos en relevance/mappings.json, confirmado sin impacto en intelligence/ (ver README.md §Self-loops)",
    },
}

# ---------------------------------------------------------------------------
# 10. Validaciones
# ---------------------------------------------------------------------------
type_ids = {t["id"] for t in INTELLIGENCE_TYPES}
for r in relationships_doc["relationship_types"]:
    pass  # vocabulario cerrado, sin referencias externas que validar

all_cats = set(COST_SIDE_CATEGORIES) | set(REVENUE_SIDE_CATEGORIES) | set(UNCERTAIN_CATEGORIES)
if len(all_cats) != len(COST_SIDE_CATEGORIES) + len(REVENUE_SIDE_CATEGORIES) + len(UNCERTAIN_CATEGORIES):
    errors.append("categorías costo/ingreso/incierto se superponen entre sí")

for rel in FLIP_RELATIONS + UNCERTAIN_RELATIONS:
    pass

self_loop_domains = {"agencias-operadores", "alojamiento", "cosecha-forestal"}
for aid in self_loop_domains:
    for e in activity_graph.get(aid, []):
        if e["target_activity_id"] == aid:
            errors.append(f"self-loop no excluido en relevance/mappings.json para {aid}")

# ---------------------------------------------------------------------------
# 11. _index.json
# ---------------------------------------------------------------------------
index_doc = {
    "generated": GENERATED,
    "inputs": [
        "knowledge/relevance/mappings.json",
        "knowledge/relevance/levels.json",
        "knowledge/signals/signal-types.json",
        "knowledge/ramifications/_signal_types.json",
    ],
    "counts": {
        "intelligence_types_total": len(INTELLIGENCE_TYPES),
        "excluded_types": len(EXCLUDED_TYPES),
        "relationship_types_total": len(relationships_doc["relationship_types"]),
        "evidence_types_total": len(evidence_doc["evidence_types"]),
        "confidence_dimensions_total": 4,
        "cost_side_categories": len(COST_SIDE_CATEGORIES),
        "revenue_side_categories": len(REVENUE_SIDE_CATEGORIES),
        "uncertain_categories": len(UNCERTAIN_CATEGORIES),
        "first_order_relevance_pairs_reused": first_order_pairs,
        "second_order_hub_activities": hubs_with_second_hop,
        "second_order_raw_pairs_if_materialized": raw_second_order_pairs,
        "scenario_instances": 0,
    },
    "no_live_signal_instances": True,
    "known_upstream_gaps": gaps_doc["known_upstream_gaps_carried_forward"],
    "validation_errors": errors,
}

# ---------------------------------------------------------------------------
# 12. Escritura
# ---------------------------------------------------------------------------
if errors:
    print("ERRORES DE VALIDACION:")
    for e in errors:
        print("  -", e)
else:
    print("Validacion OK (0 errores).")

dump("intelligence-types.json", intelligence_types_doc)
dump("rules.json", rules_doc)
dump("relationships.json", relationships_doc)
dump("evidence.json", evidence_doc)
dump("scenarios.json", scenarios_doc)
dump("gaps.json", gaps_doc)
dump("_index.json", index_doc)

print("\nintelligence/ regenerado.")
