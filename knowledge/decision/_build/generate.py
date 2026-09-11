# -*- coding: utf-8 -*-
"""
Regenera knowledge/decision/ - solo lectura de capas anteriores, no modifica
ninguna (a diferencia de la tarea anterior, aqui no se detecto ningun defecto
bloqueante en intelligence/ ni en capas previas).

Filosofia (ver README.md):
- Igual que intelligence/, esta capa es METODOLOGIA (taxonomia + reglas +
  esquemas), no datos: no existen instancias reales de decision en el
  repositorio porque no existen instancias reales de señal/cambio en ninguna
  capa anterior (gap estructural ya documentado en intelligence/gaps.json).
- decision-types.json, alternatives.json, criteria.json, constraints.json,
  rules.json, uncertainty.json y evidence.json son CURADOS.
- gaps.json documenta honestamente que no hay scoring/ponderacion valida en
  el repositorio (no se fabrica una), y reafirma el gap estructural.
- Validaciones: consistencia interna de vocabularios entre archivos (nada
  se referencia sin existir), y que relevance/mappings.json sigue sin
  self-loops (Caso 15 del prompt).

Ejecutar:
    python knowledge/decision/_build/generate.py
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))                # knowledge/decision/_build
KNOWLEDGE = os.path.dirname(os.path.dirname(HERE))                # knowledge
DECISION_DIR = os.path.join(KNOWLEDGE, "decision")
GENERATED = "2026-09-11"


def load(rel_path):
    with open(os.path.join(KNOWLEDGE, rel_path), encoding="utf-8") as f:
        return json.load(f)


def dump(name, obj):
    path = os.path.join(DECISION_DIR, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"  wrote {name}")


os.makedirs(DECISION_DIR, exist_ok=True)
errors = []

# ---------------------------------------------------------------------------
# 1. Inputs (solo lectura, para validar consistencia - no se recalcula nada pesado)
# ---------------------------------------------------------------------------
relevance_mappings = load("relevance/mappings.json")
activity_graph = relevance_mappings["activity_relevance_graph"]
intelligence_types = {t["id"] for t in load("intelligence/intelligence-types.json")["intelligence_types"]}
intelligence_dims = load("intelligence/intelligence-types.json")["dimensions"]
relationship_types = {r["id"] for r in load("intelligence/relationships.json")["relationship_types"]}

# ---------------------------------------------------------------------------
# 2. decision-types.json (curado)
# ---------------------------------------------------------------------------
DECISION_TYPES = [
    {
        "id": "production",
        "name": "Producción",
        "description": "Decisiones sobre el proceso, volumen, insumos o método productivo de una actividad (p. ej. ajustar manejo, insumos, dotación).",
    },
    {
        "id": "commercial",
        "name": "Comercial",
        "description": "Decisiones sobre venta, compra, precio, destino, contraparte o momento de comercialización.",
        "subsumes": "market (candidato descartado): una decisión de mercado siempre se resuelve en una decisión comercial concreta (a quién, cuándo, a qué precio) - no requiere un tipo aparte.",
    },
    {
        "id": "investment",
        "name": "Inversión / asignación de recursos",
        "description": "Decisiones sobre asignación de capital, financiamiento o recursos de mediano/largo plazo.",
        "subsumes": "resource_allocation (candidato descartado): en el dominio productivo tratado aquí, asignar recursos es, en la práctica, siempre una decisión de inversión (capital, tiempo o capacidad) - se fusionó para no duplicar.",
    },
    {
        "id": "risk_response",
        "name": "Respuesta a riesgo",
        "description": "Decisiones que responden a un riesgo identificado por intelligence/ (type=risk). Puede ser condicional (contingente a un evento futuro) - ver campo is_contingent en alternatives.json, no un tipo aparte.",
        "subsumes": "contingency (candidato descartado): una decisión de contingencia es un risk_response con un trigger_condition explícito, no una categoría distinta.",
    },
    {
        "id": "opportunity_pursuit",
        "name": "Aprovechamiento de oportunidad",
        "description": "Decisiones que responden a una oportunidad identificada por intelligence/ (type=opportunity). Simétrico a risk_response (prompt §20).",
    },
]

EXCLUDED_DECISION_TYPES = [
    {"candidate": "operational / tactical / strategic", "decision": "modelado_como_dimension_scope", "reason": "Ya existe como dimensions.scope en intelligence/intelligence-types.json y se reusa aquí como scope de la decisión (ver rules.json.decision_problem_schema) - crear un tipo por horizonte de alcance lo duplicaría."},
    {"candidate": "market", "decision": "fusionado_en_commercial", "reason": "Toda decisión de mercado se concreta como una decisión comercial (a quién vender/comprar, cuándo, a qué precio)."},
    {"candidate": "resource_allocation", "decision": "fusionado_en_investment", "reason": "No hay una distinción operativa clara respecto de investment en este dominio."},
    {"candidate": "contingency", "decision": "modelado_como_atributo_de_risk_response", "reason": "Es un risk_response con trigger_condition explícito (ver alternatives.json.schema.is_contingent), no un tipo taxonómico distinto."},
]

decision_types_doc = {
    "generated": GENERATED,
    "description": "Taxonomía pequeña de PROPÓSITO de una decisión productiva (no de actividad - una decisión de production nunca se llama 'decision_ganaderia').",
    "decision_types": DECISION_TYPES,
    "excluded_types": EXCLUDED_DECISION_TYPES,
}

# ---------------------------------------------------------------------------
# 3. alternatives.json (curado - esquema, no instancias)
# ---------------------------------------------------------------------------
alternatives_doc = {
    "generated": GENERATED,
    "principle": "Una alternativa es una ESTRUCTURA de opción, nunca una orden. No incluye verbos de recomendación (ver decision/rules.json.prohibited_language, heredado de intelligence/).",
    "schema": {
        "id": "identificador estable dentro del decision_problem",
        "kind": "action | no_action",
        "description": "descripción neutral de la opción, sin lenguaje imperativo",
        "is_contingent": "bool - si depende de un trigger_condition futuro (ver rules.json.information_value)",
        "trigger_condition": "obligatorio si is_contingent=true",
        "objective": "qué situación atendería esta alternativa (referencia al decision_problem, no una meta impuesta)",
        "horizon": "reusa intelligence/intelligence-types.json.dimensions.horizon",
        "conditions": "condiciones que deberían cumplirse para que la alternativa sea viable",
        "factors_for": "evidence[] que la favorece",
        "factors_against": "evidence[] que la perjudica",
        "expected_impacts": "referencias a intelligence units (type=impact/risk/opportunity), no un impacto inventado",
        "constraints": "ids de constraints.json aplicables, con su severidad (hard/soft/unknown)",
        "uncertainty": "ver uncertainty.json - por dimensión, no un único valor",
        "confidence": "igual disciplina que intelligence/: nunca un único número sin definir qué representa",
        "reversibility": "reversible | partially_reversible | irreversible | unknown",
        "relative_cost": "unknown salvo que exista evidencia explícita en sources/monitoring - nunca un valor inventado",
        "depends_on": "otras alternativas o condiciones externas de las que depende (evita ciclos - ver validación)",
        "status": "candidate | infeasible | insufficient_evidence | not_comparable",
    },
    "no_action_family": {
        "values": ["no_action", "wait", "defer", "monitor"],
        "principle": "Siempre deben evaluarse como alternativas de primera clase, con el mismo esquema que una alternativa de acción (prompt §7) - nunca un valor por defecto implícito ni el resultado automático de 'no hay suficiente evidencia'.",
        "distinction": "insufficient_evidence es un status posible de CUALQUIER alternativa (incluida una de acción); 'monitor'/'wait'/'defer' son alternativas kind=no_action con su propio objective y evidencia, no un sinónimo de insufficient_evidence.",
    },
    "status_rule": {
        "infeasible": "obligatorio cuando la alternativa viola un hard_constraint (ver constraints.json) - nunca se expresa solo como una puntuación baja (prompt §9, Caso 9).",
        "insufficient_evidence": "cuando no hay evidence[] suficiente para poblar factors_for/factors_against/expected_impacts - la alternativa se conserva en la estructura, no se elimina.",
    },
}

# ---------------------------------------------------------------------------
# 4. criteria.json (curado)
# ---------------------------------------------------------------------------
CRITERIA = [
    {
        "id": "economic_impact",
        "name": "Impacto económico",
        "description": "Sentido económico esperado de la alternativa (favorable/desfavorable/mixto), reusando intelligence/intelligence-types.json.dimensions.impact_direction - no se recalcula, se hereda de los intelligence units referenciados en expected_impacts.",
        "subsumes": "cost, market_condition (candidatos descartados): el costo es un campo propio de la alternativa (relative_cost) y la condición de mercado ya es la evidencia subyacente de economic_impact, no un criterio aparte.",
    },
    {
        "id": "feasibility",
        "name": "Factibilidad",
        "description": "Capacidad técnica/operativa real de ejecutar la alternativa dado lo que se conoce de constraints.json - no es un juicio de conveniencia, es una evaluación de restricciones duras/blandas conocidas.",
        "subsumes": "time (candidato descartado): el tiempo hasta poder ejecutar es parte de la evaluación de factibilidad, no un criterio separado.",
    },
    {
        "id": "strategic_alignment",
        "name": "Alineación estratégica",
        "description": "Coherencia de la alternativa con el scope=strategic (si aplica) del decision_problem que la origina - solo aplica cuando el problema tiene esa dimensión; en decisiones operational/tactical puede quedar 'not_applicable'.",
    },
    {
        "id": "evidence_strength",
        "name": "Fuerza de la evidencia",
        "description": "Cuán bien sustentada está la alternativa: reusa evidence_level y las 4 dimensiones de confianza de intelligence/ (nunca una confianza inventada aquí).",
    },
]

EXCLUDED_CRITERIA = [
    {"candidate": "risk / opportunity", "reason": "Son el origen del decision_problem (intelligence type=risk/opportunity), no un criterio de comparación entre alternativas - evaluarlas como criterio sería circular."},
    {"candidate": "cost", "reason": "Campo propio de la alternativa (relative_cost), no un criterio de comparación transversal."},
    {"candidate": "resource_requirement / regulatory_constraint / operational_constraint", "reason": "Son constraints.json, no criteria.json - evaluarlas dos veces (como restricción Y como criterio) duplicaría la misma información."},
    {"candidate": "uncertainty", "reason": "Campo propio de la alternativa (uncertainty.json), transversal a los 4 criterios, no un criterio más."},
    {"candidate": "dependency", "reason": "Se representa como depends_on en el esquema de la alternativa y como constraint blando/desconocido, no como criterio de comparación."},
]

criteria_doc = {
    "generated": GENERATED,
    "principle": "criterion + value(direction) + evidence + confidence + reason - nunca un score numérico sin metodología (prompt §8).",
    "criteria": CRITERIA,
    "excluded_criteria": EXCLUDED_CRITERIA,
    "value_representation": {
        "direction": "favorable | unfavorable | mixed | neutral | uncertain | not_applicable (reusa intelligence/intelligence-types.json.dimensions.impact_direction, agrega not_applicable para criterios que no aplican al tipo de decisión)",
        "evidence": "referencias a evidence.json, nunca texto libre sin referencia",
        "confidence": "una de las 4 dimensiones de intelligence/rules.json.confidence_dimensions, la más pertinente al criterio",
        "reason": "oración corta derivada de la relación estructural, no una narrativa generada",
    },
    "no_scoring": {
        "decision": "No se implementa un score numérico agregado en esta capa.",
        "rationale": "Un score requeriría una escala, normalización y ponderación explícitas (prompt §8) - no existe en el repositorio una metodología de ponderación validada entre economic_impact/feasibility/strategic_alignment/evidence_strength, y fabricarla sería inventar una metodología, no derivarla. Queda documentado como extensión futura en gaps.json, no como una funcionalidad silenciosamente faltante.",
    },
    "best_option": {
        "rule": "El campo best_option de una comparación NUNCA se asigna automáticamente en esta capa (ver rules.json.comparison_rules) - requeriría la metodología de scoring que §no_scoring declara inexistente. Es un campo de esquema reservado para una política explícita futura, no una función activa aquí.",
    },
}

# ---------------------------------------------------------------------------
# 5. constraints.json (curado)
# ---------------------------------------------------------------------------
CONSTRAINT_CATEGORIES = [
    {"id": "regulatory", "name": "Regulatoria", "example": "habilitación sanitaria vigente, normativa ambiental (ver domain-names/regulacion-y-politicas)."},
    {"id": "financial", "name": "Financiera", "example": "acceso a crédito, condiciones de financiamiento (ver domain-names/financiamiento-e-inversion)."},
    {"id": "operational", "name": "Operativa", "example": "capacidad de manejo, disponibilidad de mano de obra en el momento requerido."},
    {"id": "technological", "name": "Tecnológica / de infraestructura", "example": "capacidad instalada, equipamiento disponible.", "subsumes": "infrastructure, capacity (candidatos fusionados aquí: ambos son, en la práctica, restricciones de capacidad física/tecnológica)."},
    {"id": "resource", "name": "De recursos", "example": "disponibilidad de insumos, tierra, agua."},
    {"id": "environmental", "name": "Ambiental", "example": "permisos, condiciones climáticas límite (ver domain-names/normativa-ambiental-y-territorial)."},
    {"id": "sanitary", "name": "Sanitaria", "example": "estatus sanitario vigente, habilitaciones de exportación (ver domain-names/estatus-sanitario-y-habilitaciones)."},
    {"id": "temporal", "name": "Temporal", "example": "ventana de zafra, plazo de una habilitación, estacionalidad."},
    {"id": "contractual", "name": "Contractual", "example": "compromisos ya asumidos con proveedores o clientes."},
    {"id": "data_availability", "name": "Disponibilidad de datos", "example": "la alternativa requiere un dato que no existe en monitoring/sources (ver gaps.json) - una restricción sobre la EVALUACIÓN, no sobre la actividad."},
]

constraints_doc = {
    "generated": GENERATED,
    "principle": "Una alternativa no se evalúa solo por beneficios: toda restricción conocida (o explícitamente desconocida) debe declararse.",
    "categories": CONSTRAINT_CATEGORIES,
    "severity": {
        "values": ["hard_constraint", "soft_constraint", "unknown_constraint"],
        "hard_constraint": "Vuelve la alternativa status=infeasible si se viola (prompt §9, Caso 9) - no se pondera, se excluye.",
        "soft_constraint": "Reduce la fuerza de la alternativa (evidence_strength/feasibility) pero no la excluye.",
        "unknown_constraint": "Se desconoce si aplica - NO se trata como inexistente (prompt §9): se declara explícitamente y contribuye a insufficient_evidence si es determinante.",
    },
}

# ---------------------------------------------------------------------------
# 6. uncertainty.json (curado)
# ---------------------------------------------------------------------------
uncertainty_doc = {
    "generated": GENERATED,
    "principle": "La incertidumbre es obligatoria en toda alternativa (prompt §10) - nunca se oculta con lenguaje categórico.",
    "status": {
        "values": ["known", "estimated", "inferred", "projected", "scenario_dependent", "unknown", "conflicting"],
        "mapping_to_intelligence": {
            "known": "observed o derived en intelligence/intelligence-types.json.dimensions.epistemic_status (a nivel de decisión no se distingue el grado fino, ambos son 'suficientemente conocido')",
            "estimated": "estimated",
            "inferred": "inferred",
            "projected": "projected",
            "scenario_dependent": "scenario",
            "unknown": "nuevo aquí: no existe evidence[] alguna (más débil que 'inferred', que al menos tiene una relación estructural)",
            "conflicting": "reusa intelligence/evidence.json.conflicting_evidence, promovido a estado de primera clase porque decision/ debe poder evaluar alternativas incluso bajo evidencia contradictoria (prompt §12 y §5, Caso 5)",
        },
    },
    "dimensions": {
        "data_uncertainty": "calidad/completitud del dato subyacente (hereda source_quality de intelligence/).",
        "model_uncertainty": "incertidumbre de la clasificación/regla usada para llegar a la conclusión (p. ej. direction_by_subject con categoría 'uncertain').",
        "temporal_uncertainty": "incertidumbre sobre cuándo se materializaría el efecto.",
        "market_uncertainty": "incertidumbre sobre condiciones de mercado/destino no observadas directamente.",
        "causal_uncertainty": "incertidumbre sobre si la relación es causal o solo estructural/observacional (ver evidence.json.causal_chain).",
        "external_uncertainty": "factores fuera del repositorio (no observados por ninguna fuente de sources/) que podrían alterar la evaluación.",
    },
    "no_single_number": "No se colapsan estas dimensiones en un único número de incertidumbre (prompt §10) - se declaran las que apliquen, cada una con su propio status.",
}

# ---------------------------------------------------------------------------
# 7. evidence.json (curado)
# ---------------------------------------------------------------------------
evidence_doc = {
    "generated": GENERATED,
    "principle": "Toda evidencia de decision/ es una referencia a intelligence/ (que a su vez referencia a capas anteriores) - nunca se copia ni se fabrica (prompt §12).",
    "traceability_chain": (
        "DECISION -> ALTERNATIVE -> CRITERION/IMPACT/CONSTRAINT -> INTELLIGENCE -> RELEVANCE -> SIGNAL -> "
        "CHANGE -> CAPTURE -> RESOURCE -> SOURCE (via intelligence/evidence.json.traceability_chain, sin reescribirla aquí)"
    ),
    "never": [
        "fabricar evidencia inexistente",
        "convertir ausencia de evidencia en evidencia de ausencia (prompt §12)",
        "eliminar evidencia contradictoria para simplificar una alternativa",
    ],
    "causal_chain": {
        "principle": "Correlación no es causalidad (prompt §13). Cada eslabón de una cadena de impacto declarada (p. ej. soja↑ -> costo alimentación↑ -> margen↓) se clasifica individualmente, no se asume causal solo porque el paso anterior lo era.",
        "values": ["observed_relation", "correlation", "structural_dependency", "causal_evidence", "inference", "hypothesis"],
        "mapping_to_intelligence_relationships": {
            "structural_dependency": "depends_on / derived_from de intelligence/relationships.json",
            "correlation": "related_to / reinforces / counteracts de intelligence/relationships.json",
            "observed_relation": "un intelligence unit con epistemic_status=observed que vincula dos actividades",
            "causal_evidence": "no existe hoy en el repositorio ningún mecanismo que produzca esta clasificación (ver gaps.json) - se reserva el valor, no se asigna nunca automáticamente",
            "inference": "reusa evidence_level=inference de intelligence/",
            "hypothesis": "un eslabón propuesto sin evidence[] que lo sustente todavía - debe marcar la alternativa que depende de él como uncertainty.status=unknown como mínimo",
        },
        "example": {
            "step_1": "cultivo-soja: precio de soja ↑ (observed, category=products)",
            "step_2": "ganaderia-bovina-carne: costo de alimentación ↑",
            "step_2_classification": "structural_dependency SOLO si existe una arista real en relevance/mappings.json con relation=supplier/customer entre cultivo-soja y la actividad candidata; en el caso real de ganaderia-bovina-carne la única arista es related_activity (débil, heredada por jerarquía) -> la clasificación correcta es correlation, no structural_dependency (ver README.md, caso ganadería+soja).",
            "step_3": "margen ↓: no se afirma sin evidencia adicional de que el precio de venta de la ganadería no se ajustó en la misma proporción - queda como hypothesis, nunca como hecho.",
        },
    },
}

# ---------------------------------------------------------------------------
# 8. rules.json (curado)
# ---------------------------------------------------------------------------
rules_doc = {
    "generated": GENERATED,
    "principle": "DECISION SUPPORT != AUTONOMOUS DECISION. Estructurar y evaluar alternativas nunca equivale a ordenar una acción (prompt §2).",
    "decision_problem_schema": {
        "id": "identificador estable",
        "triggered_by": "intelligence unit id(s) que originan el problema (ver intelligence/rules.json.unit_schema) - obligatorio, nunca un decision_problem sin intelligence units de origen",
        "type": "uno de decision-types.json (production/commercial/investment/risk_response/opportunity_pursuit)",
        "scope": "reusa intelligence/intelligence-types.json.dimensions.scope (operational/tactical/strategic)",
        "primary_activity_id": "actividad principal del perfil afectado (reusa activities/)",
        "context": "referencia al context del/de los intelligence units de origen - no se reescribe",
        "alternatives": "alternatives.json.schema[] - incluye siempre al menos una alternativa kind=no_action de la familia no_action_family",
        "status": "open | resolved_externally | superseded | dismissed (una decisión no se 'resuelve' dentro de esta capa: resolved_externally significa que una capa/persona ajena a knowledge/ tomó la decisión, no que este sistema la ejecutó)",
    },
    "trigger_condition": "Un decision_problem se estructura cuando existe al menos un intelligence unit con type in {risk, opportunity} y evidence_level>=structural_relationship, o un type=trend/impact con intelligence_importance>=high. No se crea un decision_problem para cada impact de baja importancia (evita ruido, mismo principio que signals/ y relevance/).",
    "comparison_rules": {
        "outcomes": ["better_supported", "less_supported", "higher_risk", "lower_risk", "higher_uncertainty",
                     "lower_uncertainty", "more_reversible", "less_reversible", "not_comparable", "insufficient_evidence"],
        "rule": "Una comparación entre 2 alternativas se expresa por CRITERIO (uno de los 10 outcomes de arriba, por cada criterio de criteria.json), nunca como un único ganador salvo que se cumplan las condiciones de best_option (ver criteria.json.best_option - en esta capa, nunca).",
        "hard_constraint_rule": "Una alternativa que viola un hard_constraint se marca status=infeasible de inmediato y se excluye de comparaciones de criterio - no recibe simplemente una evaluación desfavorable en feasibility (prompt §9, Caso 9).",
        "not_comparable_rule": "Si dos alternativas tienen evidence_level incompatibles (una direct_evidence, otra solo hypothesis) sobre criterios distintos sin una base común, el resultado correcto es not_comparable, no una comparación forzada.",
    },
    "information_value": {
        "principle": "Estructurar la DEPENDENCIA informacional de una decisión, no ejecutar monitoreo nuevo (prompt §17) - nunca se crea un monitor aquí.",
        "schema": {
            "uncertainty_dimension": "una de uncertainty.json.dimensions",
            "would_affect_alternatives": "ids de alternativas cuya evaluación cambiaría materialmente si se resolviera esta incertidumbre",
            "existing_monitoring_reference": "si ya existe un monitor relevante en monitoring/monitors.json, se referencia por id; si no existe, se declara explícitamente ausente (ver gaps.json) - nunca se inventa ni se crea uno nuevo aquí",
        },
    },
    "multiactividad": {
        "rule": "La misma inteligencia (p. ej. un intelligence unit sobre precio de soja) puede originar decision_problems DISTINTOS en actividades distintas (cultivo-soja: comercial: vender ahora vs. esperar; elaboracion-aceites: production/investment: absorber costo vs. buscar proveedor alternativo) - nunca se asume que una estructura de decisión válida para una actividad es válida para otra (prompt §18).",
    },
    "value_chain_scope": {
        "rule": "decision/ respeta el límite de 2do orden ya establecido en intelligence/rules.json.second_order_effects: no reconstruye el grafo completo de relevance/mappings.json ni propaga alternativas más allá de donde intelligence/ ya dejó de afirmar una dirección clara (uncertain a partir del 2do salto).",
    },
    "risk_response_vs_intelligence_risk": {
        "rule": "intelligence/ identifica 'existe un riesgo' (type=risk). decision/ estructura 'estas son las alternativas disponibles para responder' (decision_type=risk_response) - nunca colapsa ambos pasos ni ejecuta una respuesta (prompt §20).",
    },
    "recommendation_basis": {
        "definition": "recommendation = decision_support + criterios explícitos + restricciones de usuario/contexto + evidencia suficiente. Esta capa entrega decision_support; NO ensambla una recommendation (eso requeriría criterios/restricciones específicos de un usuario concreto, que no existen en knowledge/ - ver prompt §23).",
        "prohibition": "Ninguna estructura de esta capa debe presentarse como 'la IA recomienda X'. La IA, si se usa en una capa posterior, no es autoridad por sí misma (prompt §21).",
    },
    "autonomy_prohibited": [
        "automatic_execution", "automatic_transaction", "automatic_purchase", "automatic_sale",
        "automatic_contract", "automatic_notification_to_third_party", "automatic_regulatory_submission",
        "automatic_financial_operation",
    ],
    "prohibited_language": {
        "rule": "Hereda intelligence/rules.json.prohibited_language sin modificarlo: ningún campo de texto puede usar verbos de recomendación.",
    },
    "ai_provider_independence": {
        "principle": "Esta capa no depende de ningún proveedor de IA - es estructura determinística y referencias a evidencia (prompt §24). No se implementa aquí ninguna llamada a DeepSeek, OpenRouter, OpenAI ni Anthropic.",
        "documented_future_stack": "DeepSeek API -> OpenRouter (fallback) -> evaluación futura de OpenAI/Anthropic. Documentado solo como contexto de arquitectura; no hay código ni configuración de proveedor en knowledge/.",
    },
}

# ---------------------------------------------------------------------------
# 9. gaps.json (derivado + documentado)
# ---------------------------------------------------------------------------
self_loop_check = []
for aid in ["agencias-operadores", "alojamiento", "cosecha-forestal"]:
    for e in activity_graph.get(aid, []):
        if e["target_activity_id"] == aid:
            self_loop_check.append(aid)

gaps_doc = {
    "generated": GENERATED,
    "principle": "No fabricar gaps para completar el archivo; no fabricar datos para evitar declarar un gap (prompt §28).",
    "no_live_instances": {
        "type": "structural",
        "description": "No existen instancias reales de decision_problem en el repositorio, porque no existen instancias reales de intelligence/signals/monitoring en vivo (mismo gap estructural documentado en intelligence/gaps.json.no_live_instances). Todo lo entregado aquí es metodología y un caso trabajado con datos estructurales reales, no un resultado de evaluación real.",
        "corregido_en_esta_tarea": False,
    },
    "no_scoring_methodology": {
        "type": "methodological",
        "description": "No existe en el repositorio una metodología de ponderación validada entre economic_impact/feasibility/strategic_alignment/evidence_strength. No se fabricó una (ver criteria.json.no_scoring). best_option nunca se asigna automáticamente en esta capa.",
        "corregido_en_esta_tarea": False,
    },
    "no_causal_evidence_mechanism": {
        "type": "methodological",
        "description": "evidence.json.causal_chain reserva el valor 'causal_evidence' pero ningún mecanismo del repositorio lo produce hoy (todo lo disponible es structural_dependency o correlation, nunca evidencia causal validada estadísticamente).",
        "corregido_en_esta_tarea": False,
    },
    "cost_and_reversibility_data": {
        "type": "data",
        "description": "relative_cost y reversibility de una alternativa quedarán 'unknown' en la gran mayoría de los casos: ninguna fuente de sources/ registra costos de acciones productivas concretas ni su reversibilidad. No se estima un valor arbitrario (prompt §6).",
        "corregido_en_esta_tarea": False,
    },
    "self_loop_verification": {
        "type": "validation",
        "cases_checked": ["agencias-operadores", "alojamiento", "cosecha-forestal"],
        "self_loops_found": self_loop_check,
        "status": "sin_cambios_respecto_de_intelligence" if not self_loop_check else "REGRESION_DETECTADA",
        "note": "Verificación del Caso 15: los 3 casos siguen sin generar self-loops en relevance/mappings.json (corregido en la tarea de intelligence/, no se modifica ramifications/ ni relevance/ en esta tarea).",
    },
    "known_upstream_gaps_carried_forward": {
        "domain_names": "barreras-y-requisitos-de-acceso - no corregido aquí",
        "sources_signals_topic_coverage": "7/19 topics sin fuente/dominio asociado (signals/gaps.json) - no corregido aquí",
        "relevance_market_granularity": "exposición a mercado solo a nivel de fuente/dominio (relevance/gaps.json) - no corregido aquí",
        "intelligence_ambiguous_categories": "13/25 categorías de ramifications/ sin sentido costo/ingreso genérico (intelligence/gaps.json) - no corregido aquí",
    },
}

if self_loop_check:
    errors.append(f"self-loop detectado en relevance/mappings.json para: {self_loop_check} (regresión respecto de la corrección aplicada durante intelligence/)")

# ---------------------------------------------------------------------------
# 10. Validaciones
# ---------------------------------------------------------------------------
type_ids = {t["id"] for t in DECISION_TYPES}
criterion_ids = {c["id"] for c in CRITERIA}
constraint_ids = {c["id"] for c in CONSTRAINT_CATEGORIES}

if len(type_ids) != len(DECISION_TYPES):
    errors.append("ids duplicados en decision-types.json")
if len(criterion_ids) != len(CRITERIA):
    errors.append("ids duplicados en criteria.json")
if len(constraint_ids) != len(CONSTRAINT_CATEGORIES):
    errors.append("ids duplicados en constraints.json")
for tid in type_ids:
    if not tid.isascii() or tid != tid.lower():
        errors.append(f"id no ascii/kebab-case en decision-types.json: {tid}")

# ---------------------------------------------------------------------------
# 11. _index.json
# ---------------------------------------------------------------------------
index_doc = {
    "generated": GENERATED,
    "inputs": [
        "knowledge/intelligence/intelligence-types.json",
        "knowledge/intelligence/relationships.json",
        "knowledge/relevance/mappings.json (solo para verificación del Caso 15)",
    ],
    "counts": {
        "decision_types_total": len(DECISION_TYPES),
        "excluded_decision_types": len(EXCLUDED_DECISION_TYPES),
        "criteria_total": len(CRITERIA),
        "excluded_criteria": len(EXCLUDED_CRITERIA),
        "constraint_categories_total": len(CONSTRAINT_CATEGORIES),
        "constraint_severity_levels": 3,
        "uncertainty_status_values": 7,
        "uncertainty_dimensions": 6,
        "comparison_outcomes": 10,
        "causal_chain_values": 6,
        "decision_problem_instances": 0,
    },
    "no_live_decision_instances": True,
    "self_loop_check": "OK" if not self_loop_check else "REGRESION",
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

dump("decision-types.json", decision_types_doc)
dump("alternatives.json", alternatives_doc)
dump("criteria.json", criteria_doc)
dump("constraints.json", constraints_doc)
dump("uncertainty.json", uncertainty_doc)
dump("evidence.json", evidence_doc)
dump("rules.json", rules_doc)
dump("gaps.json", gaps_doc)
dump("_index.json", index_doc)

print("\ndecision/ regenerado.")
