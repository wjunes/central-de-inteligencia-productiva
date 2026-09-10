"""Genera knowledge/ramifications/ a partir de knowledge/activities/activities.json.

Uso:  python knowledge/ramifications/_build/generate.py

- Deriva una ramificacion por cada identificador de relacion de activities.json.
- Clasifica category / relation / direction / relevance con un diccionario de
  factores transversales, reglas por campo y una tabla de roles entre actividades.
- curated.json aporta el enriquecimiento manual: subramificaciones (depth 2-3),
  overrides de relevancia, cadena de valor, mercados-destino, senales estrategicas
  y riesgos/oportunidades especificos de las actividades de mayor peso.
"""
import json, os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
ACT = json.load(open(ROOT + "/knowledge/activities/activities.json", encoding="utf-8"))
acts = ACT["activities"]
byid = {a["id"]: a for a in acts}
OUT = ROOT + "/knowledge/ramifications"
os.makedirs(OUT, exist_ok=True)
CUR = json.load(open(os.path.join(os.path.dirname(__file__), "curated.json"), encoding="utf-8"))

# ------------------------------------------------------------------ nombres
NAMES = {
 "clima": "Clima", "sequia": "Sequía", "deficit-hidrico": "Déficit hídrico",
 "exceso-hidrico": "Exceso hídrico", "heladas": "Heladas", "olas-de-calor": "Olas de calor",
 "disponibilidad-agua": "Disponibilidad de agua", "hidrologia": "Hidrología",
 "recurso-hidrico": "Recurso hídrico", "recurso-eolico": "Recurso eólico",
 "recurso-solar": "Recurso solar", "incendios": "Incendios forestales",
 "frio-invernal": "Horas de frío invernal", "floracion": "Floración",
 "tipo-de-cambio": "Tipo de cambio", "inflacion": "Inflación",
 "tasa-interes": "Tasa de interés", "salario-real": "Salario real",
 "costos-laborales": "Costos laborales", "costo-energia": "Costo de la energía",
 "combustibles": "Combustibles", "precio-petroleo": "Precio del petróleo",
 "costos-logisticos": "Costos logísticos", "costo-insumos": "Costo de los insumos",
 "costo-materiales": "Costo de los materiales", "flete-internacional": "Flete marítimo internacional",
 "precios-internacionales": "Precios internacionales", "precios-commodities": "Precios de commodities",
 "precios-chicago": "Precios de referencia (Chicago)", "precio-granos": "Precio de los granos",
 "precio-acero": "Precio del acero", "precio-fertilizantes": "Precio de los fertilizantes",
 "acuerdos-comerciales": "Acuerdos comerciales", "acceso-mercados": "Acceso a mercados y barreras",
 "demanda-china": "Demanda de China", "demanda-externa": "Demanda externa",
 "demanda-regional": "Demanda regional", "demanda-internacional": "Demanda internacional",
 "consumo-interno": "Consumo interno", "demanda-construccion": "Demanda de la construcción",
 "demanda-agro": "Demanda del agro", "comercio-exterior": "Comercio exterior",
 "situacion-argentina-brasil": "Situación económica de Argentina y Brasil",
 "normativa-sectorial": "Normativa sectorial", "normativa-sanitaria": "Normativa sanitaria",
 "normativa-ambiental": "Normativa ambiental", "normativa-territorial": "Normativa de ordenamiento territorial",
 "sanidad-animal": "Sanidad animal", "sanidad-vegetal": "Sanidad vegetal",
 "sanidad-acuicola": "Sanidad acuícola", "trazabilidad": "Trazabilidad",
 "habilitaciones-sanitarias": "Habilitaciones sanitarias", "inversion-publica": "Inversión pública",
 "inversion-privada": "Inversión privada", "inversion-extranjera": "Inversión extranjera directa",
 "disponibilidad-talento": "Disponibilidad de talento", "mano-de-obra": "Mano de obra",
 "mano-de-obra-especializada": "Mano de obra especializada", "estacionalidad": "Estacionalidad",
 "conectividad-aerea": "Conectividad aérea", "conectividad": "Conectividad",
 "conectividad-internacional": "Conectividad internacional", "flujo-turistico": "Flujo turístico",
 "turismo-receptivo": "Turismo receptivo", "energia": "Energía", "agua": "Agua",
 "pasturas": "Pasturas", "suelo": "Suelo", "reservas-forrajeras": "Reservas forrajeras",
 "granos-forrajeros": "Granos forrajeros", "raciones-balanceadas": "Raciones balanceadas",
 "genetica-animal": "Genética animal", "genetica-bovina": "Genética bovina",
 "genetica-lechera": "Genética lechera", "genetica-ovina": "Genética ovina",
 "genetica-aviar": "Genética aviar", "semillas": "Semillas", "fertilizantes": "Fertilizantes",
 "agroquimicos": "Agroquímicos", "agua-riego": "Agua de riego", "maquinaria-agricola": "Maquinaria agrícola",
 "normativa-promocion": "Regímenes de promoción de inversiones",
 "regimen-zonas-francas": "Régimen de zonas francas", "regimen-promocion-software": "Régimen de promoción del software",
 "regimen-vivienda-promovida": "Régimen de vivienda promovida", "regimen-automotriz": "Régimen automotriz",
 "regimen-puerto-libre": "Régimen de puerto libre", "regimen-aduanero": "Régimen aduanero",
 "impuestos-especificos": "Impuestos específicos (IMESI)", "subsidios": "Subsidios",
 "tarifa-regulada": "Tarifa regulada", "financiamiento": "Financiamiento", "credito": "Crédito",
 "credito-hipotecario": "Crédito hipotecario", "capital-trabajo": "Capital de trabajo",
 "oferta-ganado": "Oferta de ganado", "oferta-lana": "Oferta de lana", "oferta-cueros": "Oferta de cueros",
 "remision-leche": "Remisión de leche", "abastecimiento-madera": "Abastecimiento de madera",
 "abastecimiento-grano": "Abastecimiento de grano", "abastecimiento-cana": "Abastecimiento de caña",
 "abastecimiento-materia-prima": "Abastecimiento de materia prima", "cuotas-captura": "Cuotas de captura",
 "estado-recursos": "Estado de los recursos pesqueros", "estado-recursos-costeros": "Estado de los recursos costeros",
 "ley-mineral": "Ley del mineral", "reservas": "Reservas explotables", "licencia-ambiental": "Autorización ambiental",
 "represas-riego": "Represas de riego", "dragado": "Dragado", "calado-canales": "Calado de canales",
 "infraestructura-portuaria": "Infraestructura portuaria", "interconexiones": "Interconexiones eléctricas regionales",
 "capacidad-transmision": "Capacidad de transmisión", "caminos-rurales": "Caminos rurales",
 "estado-rutas": "Estado de las rutas", "peajes": "Peajes", "infraestructura-gasoducto": "Infraestructura de gasoducto",
 "adopcion-tecnologica": "Adopción tecnológica", "propiedad-intelectual": "Propiedad intelectual",
 "vinculacion-academia-empresa": "Vinculación academia-empresa", "competencia-importada": "Competencia de productos importados",
 "importaciones-competencia": "Competencia de importaciones", "competencia-regional-puertos": "Competencia regional de puertos",
 "actividad-economica": "Nivel de actividad económica", "ciclo-economico": "Ciclo económico",
 "ciclo-economico-regional": "Ciclo económico regional", "ciclo-politico": "Ciclo político y de inversión pública",
 "gasto-publico-salud": "Gasto público en salud", "informalidad": "Informalidad",
 "urbanizacion": "Urbanización", "volumen-forestal": "Volumen de cosecha forestal",
 "politica-agroenergetica": "Política agroenergética", "politica-energetica": "Política energética",
 "mandato-mezcla": "Mandato de mezcla de biocombustibles", "posicionamiento-marca-pais": "Posicionamiento de marca país",
 "estabilidad-macro": "Estabilidad macroeconómica", "estabilidad": "Estabilidad institucional",
 "diferencia-precios-frontera": "Diferencia de precios en frontera",
 "cana-azucar": "Caña de azúcar", "leche-cruda": "Leche cruda", "ganado-en-pie": "Ganado en pie",
 "energia-electrica": "Energía eléctrica", "recurso-hidrico": "Recurso hídrico",
 "combustibles-fosiles": "Combustibles fósiles", "gasoil": "Gasoil", "gas-natural": "Gas natural",
 "gas-importado": "Gas natural importado", "petroleo-crudo": "Petróleo crudo",
 "rolos-pulpa": "Rollos para pulpa", "rolos-aserrio": "Rollos para aserrío",
 "biomasa-forestal": "Biomasa forestal", "cascara-arroz": "Cáscara de arroz", "licor-negro": "Licor negro",
 "talento-ti": "Talento en tecnología", "talento-creativo": "Talento creativo",
 "infraestructura-cloud": "Infraestructura en la nube", "red-fibra": "Red de fibra óptica",
 "principios-activos": "Principios activos farmacéuticos", "resinas-plasticas": "Resinas plásticas",
 "acero": "Acero", "cobre": "Cobre", "aluminio": "Aluminio", "malta": "Malta cervecera",
 "lupulo": "Lúpulo", "levadura": "Levadura", "envases": "Envases", "botellas": "Botellas",
 "explosivos": "Explosivos", "reactivos": "Reactivos de proceso", "quimicos-blanqueo": "Químicos de blanqueo",
 "quimicos-curtido": "Químicos de curtido", "aerogeneradores": "Aerogeneradores",
 "paneles-fotovoltaicos": "Paneles fotovoltaicos", "electrolizadores": "Electrolizadores",
 "agua-industrial": "Agua industrial", "agua-desmineralizada": "Agua desmineralizada",
 "contratos-ppa": "Contratos de compraventa de energía (PPA)", "contratos-importacion": "Contratos de importación",
 "gestion-embalses": "Gestión de embalses", "demanda-electrica": "Demanda eléctrica",
 "hidrologia": "Hidrología", "cadena-frio": "Cadena de frío", "logistica-refrigerada": "Logística refrigerada",
 "logistica-granos": "Logística de granos", "acuerdo-argentina": "Acuerdo con Argentina (pesca)",
 "zafra-lana": "Zafra de lana", "remolque-portuario": "Remolque portuario",
}
ACCENTS = {
 "maiz":"maíz","energia":"energía","energetica":"energética","electrica":"eléctrica","electricas":"eléctricas",
 "electricos":"eléctricos","electronica":"electrónica","produccion":"producción","logistica":"logística",
 "logisticos":"logísticos","logisticas":"logísticas","quimica":"química","quimicos":"químicos","quimica-diversos":"química",
 "hidrico":"hídrico","hidrica":"hídrica","hidricos":"hídricos","deficit":"déficit","organica":"orgánica",
 "genetica":"genética","citricos":"cítricos","citrica":"cítrica","citricas":"cítricas","plastico":"plástico",
 "plasticos":"plásticos","mineria":"minería","metalica":"metálica","metalicos":"metálicos","metalurgica":"metalúrgica",
 "termica":"térmica","hidroelectrica":"hidroeléctrica","petroleo":"petróleo","maritimo":"marítimo","aereo":"aéreo",
 "aerea":"aérea","tecnica":"técnica","tecnico":"técnico","tecnicos":"técnicos","tecnologica":"tecnológica",
 "tecnologia":"tecnología","tecnologias":"tecnologías","farmaceutica":"farmacéutica","credito":"crédito",
 "regimen":"régimen","importacion":"importación","exportacion":"exportación","exportadora":"exportadora",
 "distribucion":"distribución","transmision":"transmisión","generacion":"generación","refinacion":"refinación",
 "fabricacion":"fabricación","elaboracion":"elaboración","extraccion":"extracción","construccion":"construcción",
 "reparacion":"reparación","operacion":"operación","promocion":"promoción","captacion":"captación",
 "potabilizacion":"potabilización","gestion":"gestión","agricola":"agrícola","agricolas":"agrícolas",
 "ganaderia":"ganadería","lecheria":"lechería","pais":"país","paises":"países","atlantico":"atlántico",
 "estandar":"estándar","indice":"índice","analisis":"análisis","cana":"caña","canamo":"cáñamo","diseno":"diseño",
 "ordene":"ordeñe","albanileria":"albañilería","campana":"campaña","caneria":"cañería","biologico":"biológico",
 "aduana":"aduana","fluvial":"fluvial","ferroviario":"ferroviario","portuaria":"portuaria","portuario":"portuario",
 "frio":"frío","organicos":"orgánicos","balanceadas":"balanceadas","carga":"carga","cria":"cría","recria":"recría",
 "sanitario":"sanitario","sanitaria":"sanitaria","climatico":"climático","climatica":"climática","publica":"pública",
 "publico":"público","publicos":"públicos","asistencia":"asistencia","asesoramiento":"asesoramiento",
 "acondicionamiento":"acondicionamiento","almacenamiento":"almacenamiento","comercializacion":"comercialización",
 "industrializacion":"industrialización","refrigerada":"refrigerada","refrigerado":"refrigerado",
}
def fix_name(tok):
    if tok in NAMES:
        return NAMES[tok]
    if tok in byid:
        return byid[tok]["name"]
    ws = [ACCENTS.get(w, w) for w in tok.split("-")]
    s = " ".join(ws)
    return s[:1].upper() + s[1:]

# ------------------------------------------------------------------ categorias
def cat_of(tok, field):
    t = tok
    def has(*xs): return any(x in t for x in xs)
    if has("normativa","regimen","licencia-ambiental","registro","marco-regulatorio","marco-normativo",
           "impuestos","trazabilidad","habilitaciones","acuerdos-comerciales","acuerdos-aerocomerciales",
           "subsidios","tarifa-regulada","mandato","cuotas-captura","propiedad-intelectual","proteccion-propiedad",
           "normativa-inase","normativa-pesos","exigencia-regulatoria","politica-agroenergetica","politica-energetica"):
        return "regulatory_factors"
    if has("clima","sequia","hidrico","hidrologia","incendios","frio-invernal","floracion","heladas","olas-de-calor"):
        return "climate_factors"
    if t in ("agua","disponibilidad-agua","suelo","recurso-hidrico","recurso-eolico","recurso-solar",
             "reservas","ley-mineral","estado-recursos","estado-recursos-costeros","suelos-prioridad-forestal",
             "fuentes-agua","disponibilidad-fuentes","recursos-naturales","pasturas","reservas-forrajeras"):
        return "resources"
    if has("sanid","sanitar"): return "sanitary_factors"
    if has("ambient","efluentes","carbono","residuos","vertidos"): return "environmental_factors"
    if has("costo","precio","flete","peajes","margenes","arancel"): return "cost_factors"
    if has("financ","credito","tasa-interes","capital","aval"): return "financial_factors"
    if has("inversion"): return "economic_factors"
    if has("demanda","consumo","flujo-turistico","turismo-receptivo","estacionalidad","preferencias"): return "demand_factors"
    if has("infra","puerto","gasoducto","interconex","transmision","caminos","rutas","dragado","calado","represas","red-"):
        return "infrastructure"
    if has("logistic","cadena-frio","cadena-suministro","almacenaje","transporte-cana","transporte-forestal"): return "logistics"
    if has("talento","mano-de-obra","idiomas","padron-profesionales","salario","laboral"): return "labor_factors"
    if has("tecnolog","adopcion-tecnologica","genetica","vinculacion-academia","electroliz"): return "technologies"
    if has("competencia","competidor"): return "competitive_factors"
    if has("tipo-de-cambio","inflacion","comercio-exterior","precios-internacionales","precios-commodities",
            "precios-chicago","situacion-argentina","ciclo-economico","actividad-economica","competitividad",
            "acceso-mercados","diferencia-precios-frontera","posicionamiento-marca-pais","estabilidad"):
        return "economic_factors"
    if has("abastecimiento","oferta-","remision-","zafra-","cosecha","campana-agricola"): return "inputs"
    return {"products":"products","inputs":"inputs","dependencies":"resources",
            "impact_factors":"economic_factors","markets":"markets"}.get(field,"economic_factors")

def rel_of(cat):
    return {"regulatory_factors":"regulation","cost_factors":"cost","financial_factors":"cost",
            "resources":"dependency","infrastructure":"infrastructure","logistics":"dependency",
            "climate_factors":"impact","sanitary_factors":"impact","environmental_factors":"impact",
            "demand_factors":"impact","competitive_factors":"competitor","technologies":"complement",
            "labor_factors":"dependency","economic_factors":"impact","inputs":"input",
            "products":"output","markets":"market"}.get(cat,"impact")

CRIT_DEP = {"clima","disponibilidad-agua","hidrologia","sanidad-animal","sanidad-vegetal","oferta-ganado",
 "remision-leche","cuotas-captura","estado-recursos","estado-recursos-costeros","acceso-mercados",
 "abastecimiento-madera","abastecimiento-grano","abastecimiento-cana","abastecimiento-materia-prima",
 "abastecimiento-rolos","abastecimiento-biomasa","abastecimiento-fibra","abastecimiento-combustibles",
 "habilitaciones-sanitarias","licencia-ambiental","ley-mineral","recurso-eolico","recurso-solar",
 "recurso-hidrico","precio-petroleo","represas-riego","planta-industrial-unica","dragado","trazabilidad",
 "energia-renovable","conectividad-internacional","regimen-zonas-francas","disponibilidad-talento",
 "mandato-mezcla","subsidios","tarifa-regulada","contratos-importacion","interconexiones"}

DIRECT_IMPACT = {"clima","sequia","hidrologia","tipo-de-cambio","precios-internacionales","demanda-china",
 "demanda-externa","consumo-interno","precio-petroleo","recurso-eolico","costo-energia","combustibles",
 "estacionalidad","situacion-argentina-brasil","normativa-sectorial","normativa-sanitaria","normativa-ambiental",
 "sanidad-animal","sanidad-vegetal","disponibilidad-agua","disponibilidad-talento","inversion-publica",
 "conectividad-aerea","demanda-construccion","impuestos-especificos"}

def reciprocal(a, b):
    x = byid.get(b)
    return bool(x) and a in x.get("related_activities", [])

# ------------------------------------------------------- roles entre actividades
PROCESSING_CHAINS = [
 ("ganaderia","frigorifica"),("ganaderia-bovina-carne","frigorifica"),("ganaderia-ovina","frigorifica"),
 ("ganaderia-ovina","lavaderos-tops-lana"),("ganaderia-ovina","industria-textil-vestimenta"),
 ("ganaderia","curtiembre"),("frigorifica","curtiembre"),
 ("lecheria","industria-lactea"),
 ("agricultura-secano","acopio-granos"),("agricultura-secano","elaboracion-aceites"),
 ("agricultura-secano","molineria"),("cultivo-soja","elaboracion-aceites"),
 ("cultivo-cereales-invierno","molineria"),("cultivo-cereales-invierno","bebidas"),
 ("cultivo-maiz-sorgo","molineria"),
 ("cultivo-cana-azucar","industria-azucarera"),("arroz","molineria"),
 ("silvicultura","industria-celulosa"),("silvicultura","industria-madera"),("silvicultura","industria-papel"),
 ("cosecha-forestal","industria-celulosa"),("plantaciones-forestales","cosecha-forestal"),
 ("aserraderos","muebles"),("industria-madera","muebles"),("tableros-madera","muebles"),
 ("industria-celulosa","industria-papel"),
 ("pesca-industrial","industria-pesquera"),("pesca-artesanal","industria-pesquera"),("acuicultura","industria-pesquera"),
 ("citricultura","industria-frutihorticola"),("fruticultura","industria-frutihorticola"),("horticultura","industria-frutihorticola"),
 ("viticultura","vinos"),
 ("extraccion-minerales-no-metalicos","productos-minerales-no-metalicos"),
 ("extraccion-piedra-arena-arcilla","productos-minerales-no-metalicos"),
 ("extraccion-piedra-arena-arcilla","construccion-edificios"),("extraccion-piedra-arena-arcilla","obras-infraestructura"),
 ("generacion-electrica","transmision-distribucion-electrica"),
 ("generacion-eolica","hidrogeno-verde"),("generacion-solar","hidrogeno-verde"),
 ("elaboracion-aceites","biocombustibles"),("cultivo-cana-azucar","biocombustibles"),("industria-azucarera","biocombustibles"),
 ("industria-metalica","maquinaria-equipo"),("industria-metalica","material-transporte"),
 ("industria-metalica","construccion-edificios"),
]
CUSTOMER_EDGES = set(PROCESSING_CHAINS)
SUPPLIER_EDGES = {(b, a) for a, b in PROCESSING_CHAINS}
CORE_CHAIN = set(PROCESSING_CHAINS) | SUPPLIER_EDGES

COMPETITOR_EDGES = {("ganaderia-porcina","avicultura"),("avicultura","ganaderia-porcina"),
 ("transporte-carga-carretera","transporte-ferroviario"),("transporte-ferroviario","transporte-carga-carretera"),
 ("aserraderos","industria-celulosa"),("pesca-artesanal","pesca-industrial"),
 ("industria-papel","gestion-residuos-reciclaje")}

INPUT_SUPPLIER_ACTS = {"comercio-mayorista-agroinsumos","industria-quimica","agroquimicos-fertilizantes",
 "maquinaria-equipo","produccion-semillas","farmaceutica","combustibles","industria-metalica","gas"}
SERVICE_ACTS = {"servicios-agropecuarios","servicios-tecnicos-agroveterinarios","servicios-logisticos",
 "servicios-profesionales","servicios-financieros","telecomunicaciones","software-ti","servicios-ambientales",
 "id-biotecnologia","data-centers","servicios-globales-exportacion","reparacion-mantenimiento-industrial-naval"}
CHANNEL_CUSTOMER_ACTS = {"comercio-exterior","acopio-granos","comercio-mayorista-general","comercio-minorista"}

def role(src, tgt):
    if src == tgt:
        return ("related_activities", "related_activity")
    if (src, tgt) in COMPETITOR_EDGES:
        return ("competitive_factors", "competitor")
    if (src, tgt) in CUSTOMER_EDGES:
        return ("customers", "customer")
    if (src, tgt) in SUPPLIER_EDGES:
        return ("suppliers", "supplier")
    if tgt in ("puertos-terminales", "almacenamiento-deposito"):
        return ("infrastructure", "infrastructure")
    tsec = byid[tgt]["sector_id"] if tgt in byid else None
    if tsec == "logistica-transporte":
        return ("logistics", "supplier")
    if tgt in INPUT_SUPPLIER_ACTS:
        return ("suppliers", "supplier")
    if tgt in SERVICE_ACTS:
        return ("services", "supplier")
    if tgt in CHANNEL_CUSTOMER_ACTS:
        return ("customers", "customer")
    return ("related_activities", "related_activity")

CRIT_PAIRS = {
 ("ganaderia","frigorifica"),("ganaderia-bovina-carne","frigorifica"),("ganaderia-ovina","frigorifica"),
 ("lecheria","industria-lactea"),("industria-lactea","lecheria"),
 ("cultivo-cana-azucar","industria-azucarera"),("industria-azucarera","cultivo-cana-azucar"),
 ("silvicultura","industria-celulosa"),("cosecha-forestal","industria-celulosa"),
 ("industria-celulosa","silvicultura"),("arroz","molineria"),("molineria","arroz"),
 ("frigorifica","ganaderia"),("agricultura-secano","acopio-granos"),("acopio-granos","agricultura-secano"),
 ("cultivo-soja","elaboracion-aceites"),("elaboracion-aceites","agricultura-secano"),
 ("pesca-industrial","industria-pesquera"),("industria-pesquera","pesca-industrial"),
 ("generacion-electrica","transmision-distribucion-electrica"),
 ("transmision-distribucion-electrica","generacion-electrica"),
 ("hidrogeno-verde","generacion-eolica"),("hidrogeno-verde","puertos-terminales"),
 ("silvicultura","transporte-carga-carretera"),("industria-celulosa","puertos-terminales"),
 ("frigorifica","puertos-terminales"),("acopio-granos","puertos-terminales"),
 ("comercio-exterior","puertos-terminales"),("citricultura","industria-frutihorticola"),
 ("viticultura","vinos"),("ganaderia-ovina","industria-textil-vestimenta"),
 ("lavaderos-tops-lana","ganaderia-ovina"),
}

def ram_from_token(tok, field, act):
    if tok in byid and tok != act["id"] and field in ("related_activities", "inputs", "dependencies"):
        cat, rel = role(act["id"], tok)
        if (act["id"], tok) in CRIT_PAIRS:
            rv = "critical"
        elif (act["id"], tok) in CORE_CHAIN or reciprocal(act["id"], tok):
            rv = "high"
        else:
            rv = "medium"
        return {"id": tok, "name": byid[tok]["name"], "category": cat, "relation": rel,
                "target_activity_id": tok, "direction": "direct", "relevance": rv,
                "depth": 1, "children": []}
    cat = cat_of(tok, field)
    rel = rel_of(cat)
    if field == "markets":
        cat, rel = "markets", "market"
    if field == "products":
        cat, rel = "products", "output"
    if field == "markets":
        rv = "critical" if (act.get("markets") and act["markets"][0] == "exportacion" and tok == "exportacion") else "high"
    elif field == "dependencies":
        rv = "critical" if tok in CRIT_DEP else "high"
    elif field == "inputs":
        rv = "high" if cat in ("resources", "infrastructure") else "medium"
    elif field == "products":
        rv = "low"
    else:
        rv = "high" if tok in DIRECT_IMPACT else "medium"
    direction = "direct"
    if field == "impact_factors":
        direction = "direct" if tok in DIRECT_IMPACT else "indirect"
    if cat == "climate_factors" and tok in ("sequia","deficit-hidrico","exceso-hidrico","heladas","olas-de-calor","incendios"):
        rel = "risk"
    return {"id": tok, "name": fix_name(tok), "category": cat, "relation": rel,
            "direction": direction, "relevance": rv, "depth": 1, "children": []}

# ------------------------------------------------------- riesgos / oportunidades por regla
def rules_risk_opp(act):
    out = []
    imp = set(act.get("impact_factors", [])); dep = set(act.get("dependencies", []))
    mk = set(act.get("markets", [])); sec = act["sector_id"]; both = imp | dep
    def add(i, n, c, r, rv, d="indirect"):
        out.append({"id": i, "name": n, "category": c, "relation": r,
                    "direction": d, "relevance": rv, "depth": 1, "children": []})
    if sec in ("agropecuario","forestal-celulosa","pesca-acuicultura") and both & {"clima","sequia","hidrologia","disponibilidad-agua"}:
        add("evento-climatico-adverso","Evento climático adverso","risks","risk","high","direct")
    if "exportacion" in mk:
        add("cierre-o-restriccion-de-mercados","Cierre o restricción de mercados de exportación","risks","risk","high")
        add("apertura-de-nuevos-mercados","Apertura de nuevos mercados","opportunities","opportunity","medium")
    if both & {"precios-internacionales","precios-commodities","precios-chicago"}:
        add("caida-de-precios-internacionales","Caída sostenida de precios internacionales","risks","risk","high")
        add("suba-sostenida-de-precios","Suba sostenida de precios internacionales","opportunities","opportunity","medium")
    if "demanda-china" in both:
        add("concentracion-de-la-demanda-en-china","Concentración de la demanda en China","risks","risk","high")
    if both & {"normativa-ambiental"}:
        add("endurecimiento-de-exigencias-ambientales","Endurecimiento de exigencias ambientales","risks","risk","medium")
    if both & {"acuerdos-comerciales"}:
        add("nuevos-acuerdos-comerciales","Nuevos acuerdos comerciales","opportunities","opportunity","medium")
    if both & {"inversion-extranjera","incentivos-inversion","normativa-promocion","regimen-zonas-francas"}:
        add("atraccion-de-inversion","Atracción de inversión y nuevos proyectos","opportunities","opportunity","medium")
    if both & {"disponibilidad-talento"}:
        add("escasez-de-talento-especializado","Escasez de talento especializado","risks","risk","high","direct")
    if both & {"precio-petroleo"} and sec != "energia":
        add("shock-de-precio-del-petroleo","Shock de precio del petróleo","risks","risk","medium")
    return out

# ------------------------------------------------------- expansiones curadas
PA = CUR.get("per_activity", {})
VC = CUR.get("value_chain", {})
MD = CUR.get("market_destinations", {})
SG = CUR.get("signals", {})
D2 = CUR.get("depth2", {})
MD_FACTORS = CUR.get("market_factor_template",
    [["demanda","Demanda","demand_factors","impact"],
     ["precios","Precios","cost_factors","impact"],
     ["requisitos-y-barreras","Requisitos y barreras de acceso","regulatory_factors","regulation"],
     ["competencia","Competencia de otros orígenes","competitive_factors","competitor"]])

def tup2ram(t, depth):
    # t = [id, name, category, relation, relevance?, direction?]
    return {"id": t[0], "name": t[1], "category": t[2], "relation": t[3],
            "direction": t[5] if len(t) > 5 else ("direct" if depth == 1 else "indirect"),
            "relevance": t[4] if len(t) > 4 else "medium", "depth": depth, "children": []}

def build_value_chain(aid):
    out = []
    for i, node in enumerate(VC.get(aid, []), 1):
        stage, tgt, name, rv = node[0], node[1], node[2], (node[3] if len(node) > 3 else "high")
        r = {"id": "vc-" + stage + ("-" + tgt if tgt else ""), "name": name,
             "category": "value_chain", "stage": stage,
             "relation": "related_activity" if tgt else "dependency",
             "direction": "direct", "relevance": rv, "depth": 1, "children": []}
        if tgt:
            r["target_activity_id"] = tgt
        out.append(r)
    return out

def build_market_destinations(aid):
    out = []
    for parent_id, dests in MD.get(aid, {}).items():
        node = {"id": parent_id, "name": "Mercados-destino",
                "category": "markets", "relation": "market", "direction": "indirect",
                "relevance": "high", "depth": 1, "children": []}
        for d in dests:  # d = [id, name, relevance]
            dram = {"id": d[0], "name": d[1], "category": "markets", "relation": "market",
                    "direction": "indirect", "relevance": d[2] if len(d) > 2 else "medium",
                    "depth": 2, "children": []}
            for f in MD_FACTORS:
                dram["children"].append({"id": d[0] + "-" + f[0], "name": f[1] + " — " + d[1],
                    "category": f[2], "relation": f[3], "direction": "indirect",
                    "relevance": "medium", "depth": 3, "children": []})
            node["children"].append(dram)
        out.append(node)
    return out

def build_signals(aid):
    out = []
    for s in SG.get(aid, []):  # s = [id, name, relation, relevance]
        out.append({"id": s[0], "name": s[1], "category": "strategic_signals",
                    "relation": s[2] if len(s) > 2 else "impact", "direction": "indirect",
                    "relevance": s[3] if len(s) > 3 else "medium", "depth": 1, "children": []})
    return out

# ------------------------------------------------------------------ build
index, edge_count = [], 0
for act in acts:
    aid = act["id"]
    rams, seen = [], set()
    for field in ["dependencies","inputs","related_activities","markets","products","impact_factors"]:
        for tok in act.get(field, []):
            if tok in seen or tok == aid:
                continue
            seen.add(tok)
            rams.append(ram_from_token(tok, field, act))
    for ro in rules_risk_opp(act):
        if ro["id"] not in seen:
            seen.add(ro["id"]); rams.append(ro)

    cur = PA.get(aid)
    if cur:
        for ov in cur.get("relevance_overrides", []):
            for r in rams:
                if r["id"] == ov["id"]:
                    r["relevance"] = ov["relevance"]
        for r in rams:
            ch = cur.get("children", {}).get(r["id"])
            if ch:
                r["children"] = [c for c in ch if c["id"] not in seen]
                for c in r["children"]:
                    seen.add(c["id"])
        for extra in cur.get("add", []):
            if extra["id"] not in seen:
                seen.add(extra["id"]); rams.append(extra)

    for pid, rows in D2.get(aid, {}).items():
        for r in rams:
            if r["id"] == pid:
                for t in rows:
                    if t[0] not in seen:
                        seen.add(t[0]); r["children"].append(tup2ram(t, 2))

    for r in build_value_chain(aid) + build_market_destinations(aid) + build_signals(aid):
        if r["id"] not in seen:
            seen.add(r["id"]); rams.append(r)

    edges = sorted({r["target_activity_id"] for r in rams if r.get("target_activity_id")})
    edge_count += len(edges)
    doc = {"activity_id": aid, "activity_name": act["name"], "sector_id": act["sector_id"],
           "level": act["level"], "parent_activity_id": act.get("parent_id"),
           "ramification_count": len(rams), "ramifications": rams}
    open(OUT + "/" + aid + ".json", "w", encoding="utf-8").write(
        json.dumps(doc, ensure_ascii=False, indent=2) + "\n")
    index.append({"activity_id": aid, "level": act["level"], "sector_id": act["sector_id"],
                  "file": aid + ".json", "ramification_count": len(rams),
                  "related_activities": edges})

idx = {"generated": "2026-09-10", "source": "knowledge/activities/activities.json",
       "counts": {"activity_files": len(index),
                  "activities": sum(1 for i in index if i["level"] == "activity"),
                  "subactivities": sum(1 for i in index if i["level"] == "subactivity"),
                  "ramifications_total": sum(i["ramification_count"] for i in index),
                  "cross_activity_edges": edge_count},
       "activities": index}
open(OUT + "/_index.json", "w", encoding="utf-8").write(json.dumps(idx, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(idx["counts"], indent=2))
