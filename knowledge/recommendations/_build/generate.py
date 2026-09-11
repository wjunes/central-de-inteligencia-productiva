# -*- coding: utf-8 -*-
"""
Regenera knowledge/recommendations/ - solo lectura de capas anteriores
(decision/, intelligence/, relevance/), no modifica ninguna.

Filosofia (ver README.md): igual que intelligence/ y decision/, esta capa es
METODOLOGIA (taxonomia + reglas + esquemas + lenguaje regulado), no datos:
no existen instancias reales de recomendacion porque no existen instancias
reales en ninguna capa anterior (mismo gap estructural, documentado otra vez
en gaps.json en vez de ocultarlo).

Ejecutar:
    python knowledge/recommendations/_build/generate.py
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))                     # knowledge/recommendations/_build
KNOWLEDGE = os.path.dirname(os.path.dirname(HERE))                     # knowledge
REC_DIR = os.path.join(KNOWLEDGE, "recommendations")
GENERATED = "2026-09-11"


def load(rel_path):
    with open(os.path.join(KNOWLEDGE, rel_path), encoding="utf-8") as f:
        return json.load(f)


def dump(name, obj):
    path = os.path.join(REC_DIR, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"  wrote {name}")


os.makedirs(REC_DIR, exist_ok=True)
errors = []

# ---------------------------------------------------------------------------
# 1. Inputs (solo lectura, para validar consistencia y el Caso 14)
# ---------------------------------------------------------------------------
relevance_mappings = load("relevance/mappings.json")
activity_graph = relevance_mappings["activity_relevance_graph"]
decision_types = {t["id"] for t in load("decision/decision-types.json")["decision_types"]}
decision_uncertainty = load("decision/uncertainty.json")
decision_criteria = {c["id"] for c in load("decision/criteria.json")["criteria"]}
intelligence_dims = load("intelligence/intelligence-types.json")["dimensions"]

# ---------------------------------------------------------------------------
# 2. recommendation-types.json (curado)
# ---------------------------------------------------------------------------
RECOMMENDATION_TYPES = [
    {"id": "evaluate", "name": "Evaluar", "description": "El tipo por defecto cuando hay evidencia suficiente para considerar una alternativa concreta, sin llegar a un mandato.", "approved_phrasing": "se recomienda evaluar..."},
    {"id": "prepare", "name": "Prepararse", "description": "Existe un riesgo u oportunidad estructuralmente identificado, con evidencia real pero no observacional (p. ej. un factor de riesgo curado en ramifications/ sin una señal que confirme un evento activo).", "approved_phrasing": "conviene prepararse para..."},
    {"id": "mitigate", "name": "Mitigar", "description": "Forma de recomendación de un decision_problem type=risk_response con evidencia suficiente para proponer medidas preventivas concretas a evaluar (no a ejecutar).", "approved_phrasing": "se recomienda evaluar medidas preventivas específicas bajo determinadas condiciones..."},
    {"id": "pursue_opportunity", "name": "Evaluar aprovechamiento de oportunidad", "description": "Forma de recomendación de un decision_problem type=opportunity_pursuit - la existencia de la oportunidad NUNCA implica por sí sola que deba aprovecharse (prompt §25): requiere capacidad/recursos/restricciones evaluados.", "approved_phrasing": "resulta conveniente considerar..."},
    {"id": "adjust", "name": "Ajustar", "description": "Recomendación sobre un parámetro operativo existente (decision_type=production), de menor magnitud que mitigate/pursue_opportunity.", "approved_phrasing": "sería razonable analizar un ajuste de..."},
    {"id": "defer", "name": "Postergar", "description": "Existen alternativas concretas ya evaluadas, pero la recomendación es postergar la elección hasta que se cumpla una condición explícita (distinto de monitor: aquí SÍ hay alternativas comparadas).", "approved_phrasing": "conviene postergar la decisión hasta..."},
    {"id": "monitor", "name": "Monitorear", "description": "La evidencia actual no permite evaluar alternativas concretas; se recomienda observar la evolución de un recurso YA monitoreado (monitoring/monitors.json) antes de reevaluar.", "approved_phrasing": "se recomienda monitorear la evolución de..."},
    {"id": "seek_information", "name": "Buscar información", "description": "Distinto de monitor: aquí NO existe un recurso de monitoring/ que cubra la información necesaria (ver decision/rules.json.information_value) - se señala el vacío informacional, no se crea un monitor nuevo.", "approved_phrasing": "no existe evidencia suficiente; conviene indagar específicamente..."},
]

EXCLUDED_RECOMMENDATION_TYPES = [
    {"candidate": "prioritize", "decision": "modelado_como_campo_no_tipo", "reason": "Priorizar entre alternativas ya evaluadas es el resultado de priority.json (recommendation_priority), no una forma de recomendación distinta - todo recommendation_type ya lleva su propia prioridad."},
    {"candidate": "review", "decision": "modelado_como_estado_de_actualizacion", "reason": "Revisar una recomendación existente por nueva evidencia es un evento del ciclo de vida (rules.json.update_policy: reassess), no un tipo de contenido nuevo."},
]

recommendation_types_doc = {
    "generated": GENERATED,
    "description": "8 tipos (de 10 candidatos), transversales a toda actividad - nunca un tipo por actividad (prompt §4: prohibido recommendation_ganaderia/recommendation_soja).",
    "recommendation_types": RECOMMENDATION_TYPES,
    "excluded_types": EXCLUDED_RECOMMENDATION_TYPES,
    "distinction": {
        "recommendation_type": "QUÉ clase de propuesta es (esta lista).",
        "decision_type": "de decision/decision-types.json - el tipo de PROBLEMA que la origina (production/commercial/investment/risk_response/opportunity_pursuit).",
        "activity": "SIEMPRE contexto (campo subject/activity de la recomendación), nunca parte del tipo.",
    },
}

# ---------------------------------------------------------------------------
# 3. evidence.json (curado)
# ---------------------------------------------------------------------------
evidence_doc = {
    "generated": GENERATED,
    "principle": "La cadena de evidencia permanece intacta hasta la fuente original; nunca se copian datos, se referencian (prompt §9).",
    "traceability_chain": (
        "RECOMMENDATION -> DECISION -> INTELLIGENCE -> RELEVANCE -> SIGNAL -> CHANGE -> CAPTURE -> RESOURCE -> SOURCE "
        "(extiende decision/evidence.json.traceability_chain con un salto más; no se reescribe esa cadena, se referencia)"
    ),
    "evidence_level": {
        "values": ["strong", "moderate", "limited", "insufficient", "conflicting"],
        "derivation": "Coarsening explícito de decision/criteria.json (criterion=evidence_strength, que a su vez reusa las 4 dimensiones de confianza de intelligence/) - NO se recalcula desde cero, se resume para el propósito de decidir el registro de lenguaje de la recomendación (ver criteria.json.strength_ladder).",
        "mapping": {
            "strong": "alternativa status=candidate, sin hard_constraint violado, evidence_strength alto en decision/, sin evidencia contradictoria.",
            "moderate": "alternativa status=candidate pero is_contingent=true, o evidence_strength medio.",
            "limited": "origen estructural (p. ej. ramifications/ category=risks/opportunities) sin una señal observada que lo confirme - existe evidencia, pero no observacional.",
            "insufficient": "no hay evidence[] suficiente para poblar factors_for/factors_against de ninguna alternativa candidata.",
            "conflicting": "reusa decision/uncertainty.json.status=conflicting - evidencia contradictoria no resuelta.",
        },
    },
    "never": [
        "copiar datos originales de sources/monitoring/signals",
        "duplicar señales o inteligencia dentro de recommendations/",
        "convertir ausencia de evidencia en evidencia de ausencia (heredado de decision/evidence.json)",
    ],
}

# ---------------------------------------------------------------------------
# 4. criteria.json (curado) - escalera de proporcionalidad evidencia -> fuerza
# ---------------------------------------------------------------------------
criteria_doc = {
    "generated": GENERATED,
    "principle": "evidence ↓ => certainty ↓ => recommendation_strength ↓ (prompt §10) - la fuerza de una recomendación nunca se fija por conveniencia, se deriva de evidence_level.",
    "recommendation_strength": {
        "values": ["strong", "conditional", "preventive", "monitoring_only", "none"],
        "language_by_strength": {
            "strong": "se recomienda evaluar...",
            "conditional": "si X se confirma, resulta conveniente evaluar Y...",
            "preventive": "conviene prepararse para...",
            "monitoring_only": "se recomienda monitorear...",
            "none": "no existe evidencia suficiente para recomendar una acción...",
        },
    },
    "strength_ladder": [
        {
            "strength": "strong",
            "requires": "evidence_level=strong AND status=candidate AND (reversible OR (irreversible AND evidence_level=strong sin excepción - ver reversibility_rule))",
            "typical_types": ["evaluate", "adjust"],
        },
        {
            "strength": "conditional",
            "requires": "evidence_level=moderate, O evidence_level=strong pero is_contingent=true, O reversibility=irreversible con evidence_level por debajo de 'strong' (nunca strong sin evidencia máxima - ver reversibility_rule)",
            "typical_types": ["defer", "pursue_opportunity", "evaluate"],
        },
        {
            "strength": "preventive",
            "requires": "evidence_level=limited Y origen decision_type=risk_response (o category=risks en la ramificación de origen, ver intelligence/rules.json.risk_opportunity_criteria)",
            "typical_types": ["prepare", "mitigate"],
        },
        {
            "strength": "monitoring_only",
            "requires": "evidence_level=insufficient PERO el decision_problem fue disparado válidamente (existe un intelligence unit de origen real) Y existe un recurso de monitoring/ ya relevante",
            "typical_types": ["monitor"],
        },
        {
            "strength": "none",
            "requires": "evidence_level=insufficient sin recurso de monitoring/ relevante (→ typical_type=seek_information), O evidence_level=conflicting sin resolución, O todas las alternativas del decision_problem tienen status=infeasible/not_comparable",
            "typical_types": ["seek_information", "none (no_recommendation)"],
        },
    ],
    "reversibility_rule": {
        "rule": "Una alternativa reversibility=irreversible NUNCA alcanza recommendation_strength=strong salvo evidence_level=strong sin ninguna excepción (sin contingencias, sin constraints unknown, sin evidencia conflictiva) - mayor irreversibilidad exige mayor evidencia, nunca al revés (prompt §23).",
    },
    "no_recommendation_triggers": {
        "values": ["insufficient_evidence", "unresolved_contradiction", "unknown_determinant_constraint", "uncertain_impact", "non_comparable_alternatives", "missing_critical_information"],
        "principle": "no_recommendation es una característica de calidad, no un error (prompt §26) - se reporta con el mismo detalle que una recomendación positiva.",
    },
}

# ---------------------------------------------------------------------------
# 5. conditions.json (curado)
# ---------------------------------------------------------------------------
conditions_doc = {
    "generated": GENERATED,
    "principle": "Una condición referencia una señal, un indicador o información ya existente - nunca se inventa un valor (prompt §12).",
    "schema": {
        "id": "identificador estable",
        "description": "enunciado neutral de la condición",
        "operator": "AND | OR | threshold_comparison",
        "references": "signal_id / monitor_id / threshold (de signals/thresholds.json) / intelligence_unit_id - al menos una referencia obligatoria",
        "status": "met | not_met | unknown",
        "status_source": "de dónde se obtendría el estado (nunca se evalúa aquí sin una instancia real)",
    },
    "worked_example": {
        "recommendation": "prepare (caso ganadería + soja, ver README.md)",
        "condition": {
            "id": "confirmacion-foco-aftosa",
            "description": "DGSG confirma un foco activo de fiebre aftosa (no solo el factor de riesgo estructural ya presente en ramifications/).",
            "operator": "threshold_comparison",
            "references": ["monitoring/monitors.json#mgap-dgsg::principal"],
            "status": "unknown",
            "status_source": "captura manual de mgap-dgsg (ver monitoring/manual-capture-workflow.json) - no existe hoy una captura real que resuelva este estado.",
        },
    },
    "no_invented_thresholds": "Cuando una condición requeriría un umbral numérico que signals/thresholds.json marca pending_definition_per_indicator, la condición queda status=unknown explícitamente - nunca se sustituye por un número supuesto.",
}

# ---------------------------------------------------------------------------
# 6. priority.json (curado)
# ---------------------------------------------------------------------------
priority_doc = {
    "generated": GENERATED,
    "principle": "recommendation_priority es un campo propio, distinto de signal priority (sources/monitoring), relevance level (relevance/), intelligence_importance (intelligence/) - nunca copiado ni promediado automáticamente (prompt §21).",
    "five_priority_concepts_in_the_system": {
        "signal_priority": "prioridad de la FUENTE (sources.json[].priority, heredada por monitoring/monitors.json[].priority).",
        "relevance_level": "qué tan conectada está la actividad (relevance/levels.json).",
        "intelligence_importance": "intelligence/rules.json.intelligence_priority - función de tipo/confianza/evidencia.",
        "decision_note": "decision/ no definió un campo de prioridad propio (usó status/comparison outcomes en su lugar) - no se modifica decision/ retroactivamente para agregarlo, no era bloqueante.",
        "recommendation_priority": "este archivo - el quinto y último concepto de la cadena.",
    },
    "scale": {
        "values": ["critical", "high", "medium", "low", "none"],
        "note": "misma escala de 5 niveles que las capas anteriores, por consistencia - NO es la misma variable ni se calcula igual.",
    },
    "factors": {
        "note": "Sin fórmula universal arbitraria (prompt §21) - se documentan los factores que la determinan, sin una ponderación numérica fabricada (misma disciplina que decision/criteria.json.no_scoring).",
        "list": ["intelligence_importance del intelligence unit de origen", "evidence_level (criteria.json)", "reversibility de la alternativa (irreversible + evidencia fuerte → mayor prioridad de atención, no de acción automática)", "inaction_cost", "horizon (cuanto más próximo, mayor prioridad relativa)", "uncertainty status (conflicting/unknown reducen la prioridad hasta resolverse, no la eliminan)"],
    },
    "inaction_cost": {
        "values": ["low", "medium", "high", "unknown"],
        "principle": "Cualitativo, nunca un número inventado (prompt §22). Puede justificar alta prioridad aunque la acción en sí no sea urgente, cuando cost_of_waiting > cost_of_review.",
    },
}

# ---------------------------------------------------------------------------
# 7. rules.json (curado)
# ---------------------------------------------------------------------------
rules_doc = {
    "generated": GENERATED,
    "principle": "DECISION SUPPORT ya construido en decision/ es la única entrada válida - nunca SIGNAL/INTELLIGENCE -> RECOMMENDATION directo sin una decision_problem con alternativas evaluadas (prompt §2, Caso 1).",
    "precondition": {
        "rule": "recommendation solo se genera a partir de un decision/rules.json.decision_problem con al menos una alternativa status != infeasible. Sin esa estructura: recommendation_status=not_supported.",
        "never": "generar una recomendación solo porque existe una señal, tendencia, riesgo, oportunidad o inteligencia - todas deben pasar primero por decision/ (prompt §2).",
    },
    "recommendation_schema": {
        "id": "identificador estable",
        "type": "uno de recommendation-types.json",
        "subject": "actividad(es) para las que se emite - nunca implícito",
        "activity": "reusa activities/ - no se crea taxonomía paralela",
        "decision_reference": "id del decision_problem/alternative de origen (obligatorio)",
        "intelligence_reference": "id(s) del/de los intelligence unit(s) de origen (obligatorio, vía decision_reference.triggered_by)",
        "statement": "texto en el registro de lenguaje correspondiente a recommendation_strength (ver criteria.json.language_by_strength) - nunca un verbo prohibido",
        "rationale": "obligatorio, deriva de evidence[] - nunca vacío (prompt §8)",
        "evidence": "referencias, ver evidence.json",
        "conditions": "ver conditions.json - vacío si recommendation_strength=strong sin contingencia",
        "constraints": "reusa decision/constraints.json por referencia",
        "expected_effect": "referencia al expected_impacts de la alternativa de decision/, nunca un valor nuevo inventado aquí",
        "risks": "referencia a intelligence units type=risk relacionados, si existen",
        "uncertainties": "reusa decision/uncertainty.json (status + dimensiones) - no se redefine",
        "confidence": "hereda las 4 dimensiones de intelligence/rules.json.confidence_dimensions vía decision/",
        "priority": "ver priority.json",
        "time_horizon": "reusa intelligence/intelligence-types.json.dimensions.horizon",
        "validity": "ver lifecycle.validity",
        "reversibility": "heredado de la alternativa de decision/ - nunca recalculado",
        "monitoring_conditions": "referencias a monitoring/monitors.json o, si no existe cobertura, referencia a decision/rules.json.information_value",
        "status": "ver lifecycle.status",
    },
    "language_rules": {
        "forbidden_verbs": ["debe hacer", "haga inmediatamente", "venda", "compre", "contrate", "invierta", "abandone", "ejecute"],
        "approved_patterns": ["se recomienda evaluar", "resulta conveniente considerar", "podría ser pertinente", "conviene monitorear", "sería razonable analizar", "conviene prepararse para", "conviene postergar"],
        "rule": "El lenguaje definitivo depende de recommendation_strength (criteria.json.language_by_strength), nunca se elige libremente. Hereda y extiende intelligence/rules.json.prohibited_language y decision/rules.json.prohibited_language sin contradecirlos.",
    },
    "lifecycle": {
        "status_values": ["active", "expired", "superseded", "withdrawn", "unsupported", "pending_validation"],
        "validity": {
            "fields": ["valid_from", "valid_until", "validity_condition", "expiration_reason"],
            "rule": "Una recomendación basada en una condición o situación temporal no permanece indefinidamente activa - debe declarar valid_until o validity_condition explícitos (prompt §13).",
        },
        "update_policy": {
            "values": ["update", "supersede", "withdraw", "reassess"],
            "rule": "Nueva evidencia que contradice una recomendación NUNCA la oculta: se crea una nueva versión que referencia la anterior (previous_version_id, new_evidence[], reason, updated_at) - misma disciplina que intelligence/rules.json.update_policy (prompt §14, Caso 11).",
        },
        "contradictions": {
            "rule": "Evidencia contradictoria no resuelta -> recommendation_strength en {conditional, none}, nunca 'strong'. No se elige automáticamente la fuente favorable ni se usa IA para 'resolver' la contradicción sin metodología (prompt §15, Caso 3).",
        },
    },
    "multiactividad": {
        "rule": "La misma inteligencia origina recomendaciones DISTINTAS por actividad (nunca se reutiliza automáticamente la misma recomendación) - hereda decision/rules.json.multiactividad, un salto más abajo en la cadena.",
    },
    "principal_vs_secundaria": {
        "rule": "actividad principal != mayor prioridad automática (prompt §20) - recommendation_priority se deriva de relevance/intelligence reales, no del rol de la actividad en el perfil (mismo principio ya demostrado con datos reales en relevance/README.md y decision/README.md).",
    },
    "risk_opportunity_separation": {
        "risk": "intelligence identifica 'existe un riesgo' (type=risk). decision estructura alternativas de respuesta. recommendations/ propone EVALUAR medidas preventivas específicas bajo condiciones - nunca ejecuta ninguna (prompt §24).",
        "opportunity": "la existencia de una oportunidad NUNCA implica que deba aprovecharse - se evalúan capacidad/recursos/restricciones/riesgo/horizonte/reversibilidad/evidencia antes de emitir pursue_opportunity (prompt §25).",
    },
    "autonomy_prohibited": [
        "automatic_execution", "automatic_purchase", "automatic_sale", "automatic_investment",
        "automatic_contract", "automatic_transfer", "automatic_regulatory_submission",
        "automatic_message_to_third_party",
    ],
    "no_profile_modification": {
        "prohibited": ["account", "profile", "financial_state", "production_state", "market_position"],
        "rule": "recommendations/ no almacena perfiles individuales ni modifica ningún estado externo - el contexto de perfil (actividad principal/secundarias/escala/recursos/restricciones/mercados/ubicación/objetivos) se recibe como entrada, nunca se persiste aquí (prompt §19).",
    },
    "ai_provider_independence": {
        "principle": "Estructura determinística y referencias a evidencia - cero dependencia de proveedor de IA en esta capa (prompt §27).",
        "documented_future_stack": "DeepSeek API -> OpenRouter (fallback) -> evaluación futura de OpenAI/Anthropic - documentado solo como contexto, sin implementación aquí (igual que decision/rules.json.ai_provider_independence).",
    },
    "efficiency": {
        "rule": "No se vuelve a consultar sources/monitoring si la evidencia ya está disponible en intelligence/decision. No se generan llamadas de IA redundantes. No se crean registros permanentes de recomendación por usuario: 'central intelligence + decision structure + profile context -> personalized recommendation' se resuelve dinámicamente a partir de referencias, no de copias por usuario (prompt §29).",
    },
}

# ---------------------------------------------------------------------------
# 8. gaps.json (derivado + documentado)
# ---------------------------------------------------------------------------
self_loop_check = []
for aid in ["agencias-operadores", "alojamiento", "cosecha-forestal"]:
    for e in activity_graph.get(aid, []):
        if e["target_activity_id"] == aid:
            self_loop_check.append(aid)

gaps_doc = {
    "generated": GENERATED,
    "principle": "No fabricar recomendaciones para llenar archivos; declarar explícitamente cuando no hay datos vivos suficientes (prompt §31).",
    "no_live_instances": {
        "type": "structural",
        "description": "No existen instancias reales de recomendación en el repositorio - mismo gap estructural que atraviesa toda la pirámide desde monitoring/ (ver intelligence/gaps.json.no_live_instances, decision/gaps.json.no_live_instances). Todo lo entregado aquí es metodología y un caso trabajado con datos estructurales reales.",
        "corregido_en_esta_tarea": False,
    },
    "no_scoring_inherited": {
        "type": "methodological",
        "description": "Hereda la misma limitación de decision/criteria.json.no_scoring: no existe una metodología de ponderación numérica validada - recommendation_priority y evidence_level son escalas cualitativas documentadas, no puntajes calculados.",
        "corregido_en_esta_tarea": False,
    },
    "monitoring_coverage_for_conditions": {
        "type": "data",
        "description": "Varias condiciones de recomendaciones tipo defer/prepare dependerán de recursos de monitoring/ que son manuales (ver monitoring/manual-capture-workflow.json) o que no existen todavía (ver decision/rules.json.information_value) - el status de esas condiciones queda unknown explícitamente, no se asume met.",
        "corregido_en_esta_tarea": False,
    },
    "self_loop_verification": {
        "type": "validation",
        "cases_checked": ["agencias-operadores", "alojamiento", "cosecha-forestal"],
        "self_loops_found": self_loop_check,
        "status": "sin_cambios_respecto_de_decision" if not self_loop_check else "REGRESION_DETECTADA",
    },
    "known_upstream_gaps_carried_forward": {
        "domain_names": "barreras-y-requisitos-de-acceso - no corregido aquí",
        "sources_signals_topic_coverage": "7/19 topics sin fuente/dominio asociado - no corregido aquí",
        "relevance_market_granularity": "exposición a mercado solo a nivel de fuente/dominio - no corregido aquí",
        "intelligence_ambiguous_categories": "13/25 categorías sin sentido costo/ingreso genérico - no corregido aquí",
        "decision_cost_reversibility_data": "relative_cost/reversibility mayormente unknown por falta de datos en sources/ - no corregido aquí",
    },
}

if self_loop_check:
    errors.append(f"self-loop detectado en relevance/mappings.json para: {self_loop_check} (regresión)")

# ---------------------------------------------------------------------------
# 9. Validaciones
# ---------------------------------------------------------------------------
type_ids = {t["id"] for t in RECOMMENDATION_TYPES}
if len(type_ids) != len(RECOMMENDATION_TYPES):
    errors.append("ids duplicados en recommendation-types.json")
for tid in type_ids:
    if not tid.isascii() or tid != tid.lower():
        errors.append(f"id no ascii/kebab-case en recommendation-types.json: {tid}")

strength_values = set(criteria_doc["recommendation_strength"]["values"])
for rung in criteria_doc["strength_ladder"]:
    if rung["strength"] not in strength_values:
        errors.append(f"strength_ladder referencia un strength desconocido: {rung['strength']}")
    for t in rung["typical_types"]:
        base_t = t.split(" ")[0]
        if base_t not in type_ids and base_t != "none":
            errors.append(f"strength_ladder referencia un recommendation_type desconocido: {t}")

# ---------------------------------------------------------------------------
# 10. _index.json
# ---------------------------------------------------------------------------
index_doc = {
    "generated": GENERATED,
    "inputs": [
        "knowledge/decision/decision-types.json",
        "knowledge/decision/uncertainty.json",
        "knowledge/decision/criteria.json",
        "knowledge/intelligence/intelligence-types.json",
        "knowledge/relevance/mappings.json (solo para verificación del Caso 14)",
    ],
    "counts": {
        "recommendation_types_total": len(RECOMMENDATION_TYPES),
        "excluded_types": len(EXCLUDED_RECOMMENDATION_TYPES),
        "recommendation_strength_levels": len(strength_values),
        "evidence_level_values": len(evidence_doc["evidence_level"]["values"]),
        "no_recommendation_triggers": len(criteria_doc["no_recommendation_triggers"]["values"]),
        "lifecycle_status_values": len(rules_doc["lifecycle"]["status_values"]),
        "priority_concepts_in_system": 5,
        "recommendation_instances": 0,
    },
    "no_live_recommendation_instances": True,
    "self_loop_check": "OK" if not self_loop_check else "REGRESION",
    "known_upstream_gaps": gaps_doc["known_upstream_gaps_carried_forward"],
    "validation_errors": errors,
}

# ---------------------------------------------------------------------------
# 11. Escritura
# ---------------------------------------------------------------------------
if errors:
    print("ERRORES DE VALIDACION:")
    for e in errors:
        print("  -", e)
else:
    print("Validacion OK (0 errores).")

dump("recommendation-types.json", recommendation_types_doc)
dump("evidence.json", evidence_doc)
dump("criteria.json", criteria_doc)
dump("conditions.json", conditions_doc)
dump("priority.json", priority_doc)
dump("rules.json", rules_doc)
dump("gaps.json", gaps_doc)
dump("_index.json", index_doc)

print("\nrecommendations/ regenerado.")
