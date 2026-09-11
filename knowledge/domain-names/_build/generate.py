"""Genera knowledge/domain-names/ a partir de activities/ + ramifications/.

Uso:  python knowledge/domain-names/_build/generate.py

Un domain-name es un UNIVERSO DE INFORMACION monitoreable, no una actividad, ni una
ramificacion, ni un indicador, ni una fuente, ni una noticia. La capa privilegia
dominios TRANSVERSALES y reutilizables; los especificos existen solo cuando un
complejo productivo tiene un universo informativo propio.

Relaciones (related_activities / related_ramifications / related_signals) se DERIVAN
escaneando ramifications/: cada ramificacion se resuelve a un dominio por token,
tipo de senal, actividad destino o categoria.
"""
import json, os, collections

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
ACT = json.load(open(ROOT + "/knowledge/activities/activities.json", encoding="utf-8"))
acts = {a["id"]: a for a in ACT["activities"]}
RDIR = ROOT + "/knowledge/ramifications"
OUT = ROOT + "/knowledge/domain-names"
os.makedirs(OUT, exist_ok=True)

# =====================================================================  CATALOGO
# (id, name, type, parent_domain_id, description)
D = [
 # ---- clima y ambiente ------------------------------------------------------
 ("clima-y-agua", "Clima y agua", "transversal", None,
  "Condiciones y eventos climáticos y disponibilidad de agua que afectan producción, rendimientos, logística, costos y demanda."),
 ("precipitaciones-y-temperatura", "Precipitaciones y temperatura", "transversal", "clima-y-agua",
  "Régimen de lluvias, temperatura y humedad y su desvío respecto de lo normal."),
 ("sequia-y-deficit-hidrico", "Sequía y déficit hídrico", "transversal", "clima-y-agua",
  "Condición y evolución de la sequía agronómica e hidrológica y del déficit forrajero."),
 ("exceso-hidrico-e-inundaciones", "Exceso hídrico e inundaciones", "transversal", "clima-y-agua",
  "Excesos de precipitación, anegamientos e inundaciones que afectan producción y logística."),
 ("eventos-climaticos-extremos", "Eventos climáticos extremos", "transversal", "clima-y-agua",
  "Heladas, olas de calor, granizo, vientos y otros eventos extremos de impacto productivo."),
 ("pronostico-agroclimatico", "Pronóstico agroclimático", "transversal", "clima-y-agua",
  "Pronósticos estacionales, fenómeno ENSO (El Niño / La Niña) y perspectivas de campaña."),
 ("disponibilidad-de-agua", "Disponibilidad de agua", "transversal", "clima-y-agua",
  "Niveles de embalses, caudales, acuíferos y agua para riego, industria y consumo."),
 # ---- recursos naturales --------------------------------------------------
 ("recursos-naturales", "Recursos naturales", "ambiental", None,
  "Estado y sostenibilidad de los recursos naturales de base productiva."),
 ("estado-de-recursos-pesqueros", "Estado de los recursos pesqueros", "ambiental", "recursos-naturales",
  "Biomasa, cuotas, capturas y estado de los principales stocks del Atlántico Sur y aguas interiores."),
 ("recursos-forestales", "Recursos forestales", "ambiental", "recursos-naturales",
  "Superficie forestada, cosecha, incendios y sanidad del recurso forestal."),
 ("suelo-y-uso-del-suelo", "Suelo y uso del suelo", "ambiental", "recursos-naturales",
  "Estado del suelo, erosión, rotaciones y cambios de uso del suelo agrícola, ganadero y forestal."),
 ("recursos-mineros", "Recursos mineros", "ambiental", "recursos-naturales",
  "Reservas, leyes de mineral y disponibilidad de rocas de aplicación y minerales."),
 # ---- economía macro -----------------------------------------------------
 ("economia-macro", "Economía macro", "economico", None,
  "Variables macroeconómicas que afectan competitividad, costos y demanda de todas las actividades."),
 ("tipo-de-cambio", "Tipo de cambio", "economico", "economia-macro",
  "Tipo de cambio nominal y real, competitividad cambiaria y volatilidad."),
 ("inflacion-y-precios-internos", "Inflación y precios internos", "economico", "economia-macro",
  "Inflación, expectativas y evolución de precios internos."),
 ("tasas-de-interes", "Tasas de interés", "economico", "economia-macro",
  "Tasas de política monetaria, de mercado y de crédito."),
 ("nivel-de-actividad-y-ciclo", "Nivel de actividad y ciclo económico", "economico", "economia-macro",
  "PIB, actividad sectorial, empleo agregado y fase del ciclo."),
 ("situacion-regional", "Situación económica regional", "economico", "economia-macro",
  "Situación macroeconómica y cambiaria de Argentina y Brasil y su efecto sobre comercio, turismo y precios de frontera."),
 # ---- energía -----------------------------------------------------------
 ("energia", "Energía", "transversal", None,
  "Oferta, demanda, costo y política del sistema energético."),
 ("energia-electrica", "Energía eléctrica", "transversal", "energia",
  "Generación por fuente, demanda, despacho, precios y confiabilidad del suministro eléctrico."),
 ("hidrologia-energetica", "Hidrología energética", "transversal", "energia",
  "Aportes hídricos a las centrales, nivel de embalses y necesidad de respaldo térmico."),
 ("combustibles-liquidos", "Combustibles líquidos", "transversal", "energia",
  "Precio del petróleo, paridad de importación, precios de gasoil, nafta y fueloil y abastecimiento."),
 ("gas-natural", "Gas natural", "transversal", "energia",
  "Disponibilidad, contratos y precio del gas natural por red y del GNL."),
 ("transicion-energetica", "Transición energética", "tecnologico", "energia",
  "Recurso eólico y solar, almacenamiento, generación distribuida, hidrógeno y descarbonización."),
 ("tarifas-y-politica-energetica", "Tarifas y política energética", "regulatorio", "energia",
  "Tarifas reguladas, subsidios, mandatos de mezcla y política agroenergética."),
 # ---- comercio exterior -----------------------------------------------
 ("comercio-exterior", "Comercio exterior", "transversal", None,
  "Flujos, condiciones y reglas del intercambio internacional de bienes y servicios."),
 ("flujos-de-comercio-exterior", "Flujos de comercio exterior", "economico", "comercio-exterior",
  "Volúmenes y valores de exportación e importación por producto y destino."),
 ("fletes-y-logistica-internacional", "Fletes y logística internacional", "logistico", "comercio-exterior",
  "Fletes marítimos y aéreos, disponibilidad de bodega, contenedores y congestión de rutas."),
 ("acuerdos-comerciales-y-aranceles", "Acuerdos comerciales y aranceles", "regulatorio", "comercio-exterior",
  "Acuerdos, preferencias, aranceles y negociaciones comerciales (Mercosur, UE, otros)."),
 ("regimenes-aduaneros-y-zonas-francas", "Regímenes aduaneros y zonas francas", "regulatorio", "comercio-exterior",
  "Régimen aduanero, puerto y aeropuerto libre, zonas francas y admisión temporaria."),
 # ---- logística e infraestructura -----------------------------------
 ("logistica-e-infraestructura", "Logística e infraestructura", "logistico", None,
  "Capacidad, estado y costo de la infraestructura y los servicios logísticos internos."),
 ("transporte-carretero", "Transporte carretero", "logistico", "logistica-e-infraestructura",
  "Costos, capacidad y normativa del transporte de carga y pasajeros por carretera."),
 ("transporte-ferroviario", "Transporte ferroviario", "logistico", "logistica-e-infraestructura",
  "Estado, capacidad y contratos del ferrocarril de carga (Ferrocarril Central)."),
 ("puertos-y-terminales", "Puertos y terminales", "logistico", "logistica-e-infraestructura",
  "Movimiento, calado, dragado, inversión y competitividad de las terminales portuarias."),
 ("infraestructura-vial-y-camineria", "Infraestructura vial y caminería", "logistico", "logistica-e-infraestructura",
  "Estado de rutas nacionales, caminería rural, puentes y accesos, y su inversión."),
 ("almacenaje-y-cadena-de-frio", "Almacenaje y cadena de frío", "logistico", "logistica-e-infraestructura",
  "Capacidad de silos, depósitos, cámaras de frío y centros de distribución."),
 # ---- insumos y costos ------------------------------------------------
 ("insumos-y-costos-de-produccion", "Insumos y costos de producción", "transversal", None,
  "Precios y disponibilidad de los principales insumos de la producción."),
 ("precios-de-fertilizantes-y-agroquimicos", "Precios de fertilizantes y agroquímicos", "economico", "insumos-y-costos-de-produccion",
  "Precios internacionales y locales de fertilizantes, fitosanitarios y semillas."),
 ("precios-de-granos-y-raciones", "Precios de granos y raciones", "economico", "insumos-y-costos-de-produccion",
  "Precios de maíz, sorgo, harina de soja y raciones balanceadas para alimentación animal."),
 ("precios-de-metales-y-siderurgia", "Precios de metales y siderurgia", "economico", "insumos-y-costos-de-produccion",
  "Precios de acero, aluminio, cobre y chatarra."),
 ("precios-de-plasticos-y-quimicos", "Precios de plásticos y químicos", "economico", "insumos-y-costos-de-produccion",
  "Precios de resinas plásticas, químicos de proceso y principios activos importados."),
 ("costos-de-materiales-de-construccion", "Costos de materiales de construcción", "economico", "insumos-y-costos-de-produccion",
  "Precios de cemento, hierro, áridos, madera, tableros y aberturas."),
 # ---- laboral --------------------------------------------------------
 ("laboral", "Mercado laboral y talento", "transversal", None,
  "Disponibilidad, costo y formación de la mano de obra y del talento especializado."),
 ("empleo-y-mercado-de-trabajo", "Empleo y mercado de trabajo", "economico", "laboral",
  "Empleo, desempleo, informalidad y demanda de mano de obra por sector."),
 ("disponibilidad-de-talento-especializado", "Disponibilidad de talento especializado", "transversal", "laboral",
  "Oferta y rotación de talento técnico y profesional, especialmente en tecnología y servicios."),
 ("costos-laborales-y-negociacion-colectiva", "Costos laborales y negociación colectiva", "regulatorio", "laboral",
  "Salarios, consejos de salarios, cargas sociales y conflictividad."),
 # ---- financiamiento e inversión -----------------------------------
 ("financiamiento-e-inversion", "Financiamiento e inversión", "economico", None,
  "Condiciones de financiamiento y flujo de inversión pública y privada."),
 ("credito-y-condiciones-financieras", "Crédito y condiciones financieras", "economico", "financiamiento-e-inversion",
  "Acceso, costo y volumen del crédito productivo e hipotecario."),
 ("inversion-publica", "Inversión pública", "economico", "financiamiento-e-inversion",
  "Presupuesto, obra pública, contratos PPP y financiamiento multilateral."),
 ("inversion-privada-e-ied", "Inversión privada e IED", "economico", "financiamiento-e-inversion",
  "Proyectos anunciados, inversión extranjera directa y decisiones finales de inversión."),
 ("regimenes-de-promocion-de-inversiones", "Regímenes de promoción de inversiones", "regulatorio", "financiamiento-e-inversion",
  "Ley de inversiones, promoción de software, vivienda promovida, régimen audiovisual y automotriz."),
 # ---- regulación y políticas -------------------------------------
 ("regulacion-y-politicas", "Regulación y políticas públicas", "regulatorio", None,
  "Marco normativo y de políticas que condiciona a las actividades productivas."),
 ("normativa-sectorial-productiva", "Normativa sectorial productiva", "regulatorio", "regulacion-y-politicas",
  "Normas específicas de cada sector productivo y de sus organismos reguladores."),
 ("normativa-ambiental-y-territorial", "Normativa ambiental y territorial", "regulatorio", "regulacion-y-politicas",
  "Autorizaciones ambientales, ordenamiento territorial, vertidos y exigencias ambientales crecientes."),
 ("politica-tributaria", "Política tributaria", "regulatorio", "regulacion-y-politicas",
  "Impuestos generales y específicos (IMESI, IVA, IRAE), beneficios y devoluciones."),
 ("politica-comercial-y-de-acceso-a-mercados", "Política comercial y de acceso a mercados", "regulatorio", "regulacion-y-politicas",
  "Habilitaciones sanitarias, cuotas, barreras, acuerdos de precios y política comercial de socios."),
 # ---- sanidad -------------------------------------------------------
 ("sanidad", "Sanidad e inocuidad", "sanitario", None,
  "Estatus y eventos sanitarios y de inocuidad de la producción de alimentos."),
 ("sanidad-animal", "Sanidad animal", "sanitario", "sanidad",
  "Fiebre aftosa, peste porcina africana, influenza aviar, garrapata y otras enfermedades del ganado."),
 ("sanidad-vegetal", "Sanidad vegetal", "sanitario", "sanidad",
  "Plagas y enfermedades cuarentenarias de los cultivos y montes (HLB, chinches, malezas resistentes)."),
 ("sanidad-acuicola", "Sanidad acuícola", "sanitario", "sanidad",
  "Enfermedades y bioseguridad de la acuicultura."),
 ("estatus-sanitario-y-habilitaciones", "Estatus sanitario y habilitaciones", "sanitario", "sanidad",
  "Estatus sanitario del país, habilitaciones de plantas y reconocimiento de mercados."),
 ("inocuidad-alimentaria-y-residuos", "Inocuidad alimentaria y residuos", "sanitario", "sanidad",
  "Límites de residuos, trazabilidad, rechazos en destino y exigencias de inocuidad."),
 # ---- tecnología ---------------------------------------------------
 ("tecnologia-e-innovacion", "Tecnología e innovación", "tecnologico", None,
  "Cambios tecnológicos capaces de alterar procesos, productos o competitividad."),
 ("adopcion-tecnologica-y-digitalizacion", "Adopción tecnológica y digitalización", "tecnologico", "tecnologia-e-innovacion",
  "Digitalización, agricultura de precisión, automatización y trazabilidad electrónica."),
 ("genetica-y-biotecnologia", "Genética y biotecnología", "tecnologico", "tecnologia-e-innovacion",
  "Mejoramiento genético animal y vegetal, biotecnología y bioinsumos."),
 ("investigacion-y-desarrollo", "Investigación y desarrollo", "tecnologico", "tecnologia-e-innovacion",
  "Prioridades y financiamiento de I+D, vinculación academia-empresa y transferencia."),
 ("inteligencia-artificial-y-automatizacion", "Inteligencia artificial y automatización", "tecnologico", "tecnologia-e-innovacion",
  "Adopción de IA y automatización y su efecto sobre servicios, industria y empleo."),
 # ---- mercados --------------------------------------------------
 ("mercados", "Mercados", "mercado", None,
  "Universos de información sobre demanda, precios, competencia y condiciones de los mercados."),
 ("precios-internacionales-de-commodities", "Precios internacionales de commodities", "mercado", "mercados",
  "Precios de referencia internacionales de los principales productos exportables (carne, granos, celulosa, lácteos, lana)."),
 ("demanda-mundial-y-tendencias-de-consumo", "Demanda mundial y tendencias de consumo", "mercado", "mercados",
  "Evolución de la demanda internacional, preferencias de consumo y ciclos de los principales importadores."),
 ("mercados-destino", "Mercados-destino", "mercado", "mercados",
  "Condiciones por destino de exportación (país o bloque como dimensión): demanda, precios, requisitos, barreras y competencia."),
 ("barreras-y-requisitos-de-acceso", "Barreras y requisitos de acceso", "mercado", "mercados",
  "Aranceles, cuotas, medidas no arancelarias, requisitos sanitarios y de sostenibilidad por mercado."),
 ("competencia-internacional", "Competencia internacional", "mercado", "mercados",
  "Posición y movimientos de los países y empresas competidores en los mercados de destino."),
 ("mercado-interno-y-consumo-nacional", "Mercado interno y consumo nacional", "mercado", "mercados",
  "Consumo de los hogares, poder de compra, sustitución entre productos y competencia de importados."),
 ("comercializacion-y-canales", "Comercialización y canales", "mercado", "mercados",
  "Acopio, trading, distribución mayorista y minorista y márgenes de la cadena comercial."),
 ("mercado-de-carbono-y-sostenibilidad", "Mercado de carbono y sostenibilidad", "mercado", "mercados",
  "Bonos de carbono, primas por sostenibilidad y exigencias de huella en los mercados."),
 ("turismo-receptivo-regional", "Turismo receptivo regional", "mercado", "mercados",
  "Flujo de visitantes, gasto, conectividad aérea y competitividad turística frente a la región."),
]

# --- dominios sectoriales (complejos productivos) ---
SECT = [
 ("complejo-carne-bovina", "Complejo de la carne bovina", "Cría, invernada, faena, industria frigorífica, cueros y su cadena exportadora."),
 ("complejo-ovino-lana", "Complejo ovino y lanero", "Producción ovina, lana, carne ovina y su primera industrialización."),
 ("complejo-lacteo", "Complejo lácteo", "Producción de leche en tambos e industria láctea y su cadena exportadora."),
 ("complejo-avicola-y-porcino", "Complejo avícola y porcino", "Producción avícola y porcina integrada a la industria de raciones, orientada al mercado interno."),
 ("apicultura", "Apicultura", "Producción de miel y productos de la colmena y su exportación."),
 ("complejo-agricola-granos-y-oleaginosos", "Complejo agrícola de granos y oleaginosos", "Agricultura de secano, oleaginosos, molienda, acopio y servicios agrícolas."),
 ("complejo-arrocero", "Complejo arrocero", "Cultivo de arroz bajo riego e industria molinera arrocera."),
 ("complejo-hortifruticola", "Complejo hortifrutícola", "Horticultura, fruticultura y su procesamiento industrial."),
 ("complejo-citricola", "Complejo citrícola", "Producción, packing y exportación de cítricos."),
 ("complejo-vitivinicola", "Complejo vitivinícola", "Viticultura y elaboración de vino, incluido el enoturismo."),
 ("complejo-sucroalcoholero", "Complejo sucroalcoholero", "Caña de azúcar, industria azucarera, alcohol y bioetanol."),
 ("cannabis", "Cannabis", "Cultivo y procesamiento de cáñamo industrial y cannabis medicinal."),
 ("complejo-forestal-celulosa", "Complejo forestal-celulosa", "Silvicultura, cosecha forestal, celulosa y papel."),
 ("complejo-maderero", "Complejo maderero", "Aserrado, tableros, remanufactura y muebles."),
 ("complejo-pesquero", "Complejo pesquero", "Pesca industrial y artesanal, acuicultura y procesamiento de productos pesqueros."),
 ("mineria-y-extractivas", "Minería y actividades extractivas", "Extracción de minerales metálicos y no metálicos, piedra, arena y arcilla."),
 ("generacion-y-transmision-electrica", "Generación y transmisión eléctrica", "Negocio de generación por fuente, transmisión y distribución de electricidad."),
 ("combustibles-y-gas", "Combustibles y gas", "Refinación, importación y distribución de combustibles líquidos y gas."),
 ("hidrogeno-verde-y-derivados", "Hidrógeno verde y derivados", "Producción de hidrógeno por electrólisis y de amoníaco y e-combustibles para exportación."),
 ("industria-de-alimentos-y-bebidas", "Industria de alimentos y bebidas", "Panificados, bebidas, otros alimentos y su abastecimiento y distribución."),
 ("industria-textil-y-vestimenta", "Industria textil y de la vestimenta", "Hilandería, tejeduría y confección."),
 ("industria-quimica-y-farmaceutica", "Industria química y farmacéutica", "Agroquímicos formulados, farmacéutica humana y veterinaria y químicos diversos."),
 ("industria-de-plasticos-y-caucho", "Industria de plásticos y caucho", "Envases, films, tuberías y piezas técnicas de plástico y caucho."),
 ("industria-metalmecanica", "Industria metalmecánica", "Metalurgia, maquinaria, material de transporte, electrónica y reparación industrial y naval."),
 ("industria-de-materiales-de-construccion", "Industria de materiales de construcción", "Cemento, cal, hormigón, prefabricados, cerámica y vidrio."),
 ("construccion-e-inmobiliario", "Construcción e inmobiliario", "Edificación, obra de infraestructura, instalaciones y desarrollo inmobiliario."),
 ("transporte-y-logistica", "Transporte y logística", "Negocio del transporte por todos los modos, operación portuaria, almacenaje y servicios logísticos."),
 ("comercio-y-distribucion", "Comercio y distribución", "Comercio mayorista de insumos y bienes, comercio exterior y comercio minorista."),
 ("turismo", "Turismo", "Alojamiento, gastronomía, operadores, transporte turístico y experiencias."),
 ("economia-del-conocimiento", "Economía del conocimiento", "Software, audiovisual, industrias creativas, biotecnología y data centers."),
 ("servicios-globales-de-exportacion", "Servicios globales de exportación", "Centros de servicios compartidos y tercerización de procesos de negocio y conocimiento."),
 ("telecomunicaciones-e-infraestructura-digital", "Telecomunicaciones e infraestructura digital", "Redes, conectividad, espectro y servicios de datos."),
 ("servicios-profesionales-y-financieros", "Servicios profesionales y financieros", "Ingeniería, consultoría, servicios jurídicos y contables, banca, seguros y fintech."),
 ("agua-potable-y-saneamiento", "Agua potable y saneamiento", "Captación, potabilización, distribución de agua y tratamiento de efluentes."),
 ("gestion-de-residuos-y-economia-circular", "Gestión de residuos y economía circular", "Recolección, reciclaje, valorización de residuos y servicios ambientales."),
]
for did, name, desc in SECT:
    D.append((did, name, "sectorial", None, desc))

DOMAIN_IDS = {d[0] for d in D}

# =====================================================================  MAPEOS
ACT2SEC = {
 "ganaderia": "complejo-carne-bovina", "ganaderia-bovina-carne": "complejo-carne-bovina",
 "frigorifica": "complejo-carne-bovina", "curtiembre": "complejo-carne-bovina",
 "ganaderia-ovina": "complejo-ovino-lana", "lavaderos-tops-lana": "complejo-ovino-lana",
 "lecheria": "complejo-lacteo", "industria-lactea": "complejo-lacteo",
 "ganaderia-porcina": "complejo-avicola-y-porcino", "avicultura": "complejo-avicola-y-porcino",
 "apicultura": "apicultura",
 "agricultura-secano": "complejo-agricola-granos-y-oleaginosos", "cultivo-soja": "complejo-agricola-granos-y-oleaginosos",
 "cultivo-cereales-invierno": "complejo-agricola-granos-y-oleaginosos", "cultivo-maiz-sorgo": "complejo-agricola-granos-y-oleaginosos",
 "elaboracion-aceites": "complejo-agricola-granos-y-oleaginosos", "produccion-semillas": "complejo-agricola-granos-y-oleaginosos",
 "servicios-agropecuarios": "complejo-agricola-granos-y-oleaginosos", "servicios-tecnicos-agroveterinarios": "complejo-agricola-granos-y-oleaginosos",
 "arroz": "complejo-arrocero", "molineria": "complejo-arrocero",
 "horticultura": "complejo-hortifruticola", "fruticultura": "complejo-hortifruticola", "industria-frutihorticola": "complejo-hortifruticola",
 "citricultura": "complejo-citricola",
 "viticultura": "complejo-vitivinicola", "vinos": "complejo-vitivinicola",
 "cultivo-cana-azucar": "complejo-sucroalcoholero", "industria-azucarera": "complejo-sucroalcoholero", "biocombustibles": "complejo-sucroalcoholero",
 "cannabis": "cannabis",
 "silvicultura": "complejo-forestal-celulosa", "plantaciones-forestales": "complejo-forestal-celulosa",
 "cosecha-forestal": "complejo-forestal-celulosa", "industria-celulosa": "complejo-forestal-celulosa", "industria-papel": "complejo-forestal-celulosa",
 "industria-madera": "complejo-maderero", "aserraderos": "complejo-maderero", "tableros-madera": "complejo-maderero", "muebles": "complejo-maderero",
 "pesca-industrial": "complejo-pesquero", "pesca-artesanal": "complejo-pesquero", "acuicultura": "complejo-pesquero", "industria-pesquera": "complejo-pesquero",
 "extraccion-minerales-metaliferos": "mineria-y-extractivas", "extraccion-minerales-no-metalicos": "mineria-y-extractivas",
 "extraccion-piedra-arena-arcilla": "mineria-y-extractivas",
 "generacion-electrica": "generacion-y-transmision-electrica", "hidroelectrica": "generacion-y-transmision-electrica",
 "generacion-eolica": "generacion-y-transmision-electrica", "generacion-solar": "generacion-y-transmision-electrica",
 "generacion-biomasa": "generacion-y-transmision-electrica", "generacion-termica": "generacion-y-transmision-electrica",
 "transmision-distribucion-electrica": "generacion-y-transmision-electrica",
 "combustibles": "combustibles-y-gas", "gas": "combustibles-y-gas",
 "hidrogeno-verde": "hidrogeno-verde-y-derivados",
 "panaderia-farinaceos": "industria-de-alimentos-y-bebidas", "bebidas": "industria-de-alimentos-y-bebidas",
 "bebidas-sin-alcohol": "industria-de-alimentos-y-bebidas", "cerveza": "industria-de-alimentos-y-bebidas",
 "bebidas-espirituosas": "industria-de-alimentos-y-bebidas", "otros-alimentos": "industria-de-alimentos-y-bebidas",
 "industria-textil-vestimenta": "industria-textil-y-vestimenta", "hilanderia-tejeduria": "industria-textil-y-vestimenta",
 "confeccion-prendas": "industria-textil-y-vestimenta",
 "industria-quimica": "industria-quimica-y-farmaceutica", "agroquimicos-fertilizantes": "industria-quimica-y-farmaceutica",
 "farmaceutica": "industria-quimica-y-farmaceutica", "productos-quimicos-diversos": "industria-quimica-y-farmaceutica",
 "plasticos-caucho": "industria-de-plasticos-y-caucho",
 "industria-metalica": "industria-metalmecanica", "maquinaria-equipo": "industria-metalmecanica",
 "material-transporte": "industria-metalmecanica", "industria-electrica-electronica": "industria-metalmecanica",
 "reparacion-mantenimiento-industrial-naval": "industria-metalmecanica",
 "productos-minerales-no-metalicos": "industria-de-materiales-de-construccion",
 "construccion-edificios": "construccion-e-inmobiliario", "obras-infraestructura": "construccion-e-inmobiliario",
 "instalaciones-terminaciones": "construccion-e-inmobiliario", "promocion-inmobiliaria": "construccion-e-inmobiliario",
 "transporte-carga-carretera": "transporte-y-logistica", "transporte-pasajeros": "transporte-y-logistica",
 "transporte-ferroviario": "transporte-y-logistica", "transporte-maritimo-fluvial": "transporte-y-logistica",
 "transporte-aereo": "transporte-y-logistica", "puertos-terminales": "transporte-y-logistica",
 "almacenamiento-deposito": "transporte-y-logistica", "servicios-logisticos": "transporte-y-logistica",
 "comercio-mayorista-agroinsumos": "comercio-y-distribucion", "acopio-granos": "comercio-y-distribucion",
 "comercio-exterior": "comercio-y-distribucion", "comercio-mayorista-general": "comercio-y-distribucion",
 "comercio-minorista": "comercio-y-distribucion",
 "turismo": "turismo", "alojamiento": "turismo", "gastronomia": "turismo", "agencias-operadores": "turismo",
 "turismo-rural-naturaleza": "turismo", "turismo-cultural": "turismo", "turismo-mice-eventos": "turismo", "transporte-turistico": "turismo",
 "software-ti": "economia-del-conocimiento", "servicios-audiovisuales": "economia-del-conocimiento",
 "industrias-creativas": "economia-del-conocimiento", "id-biotecnologia": "economia-del-conocimiento",
 "data-centers": "economia-del-conocimiento",
 "servicios-globales-exportacion": "servicios-globales-de-exportacion",
 "telecomunicaciones": "telecomunicaciones-e-infraestructura-digital",
 "servicios-profesionales": "servicios-profesionales-y-financieros", "servicios-financieros": "servicios-profesionales-y-financieros",
 "captacion-potabilizacion-agua": "agua-potable-y-saneamiento", "saneamiento-tratamiento": "agua-potable-y-saneamiento",
 "gestion-residuos-reciclaje": "gestion-de-residuos-y-economia-circular", "servicios-ambientales": "gestion-de-residuos-y-economia-circular",
}

def sect_of(aid):
    a = acts.get(aid)
    if not a:
        return None
    if aid in ACT2SEC:
        return ACT2SEC[aid]
    if a.get("parent_id") in ACT2SEC:
        return ACT2SEC[a["parent_id"]]
    return None

# token de ramificacion -> dominio (los mas relevantes; el resto cae por categoria)
TOKENMAP = {
 "clima": "clima-y-agua", "eventos-clima-costa": "clima-y-agua",
 "sequia": "sequia-y-deficit-hidrico", "deficit-hidrico": "sequia-y-deficit-hidrico",
 "deficit-forrajero": "sequia-y-deficit-hidrico", "evento-climatico-adverso": "eventos-climaticos-extremos",
 "exceso-hidrico": "exceso-hidrico-e-inundaciones", "heladas": "eventos-climaticos-extremos",
 "olas-de-calor": "eventos-climaticos-extremos", "frio-invernal": "precipitaciones-y-temperatura",
 "floracion": "precipitaciones-y-temperatura",
 "hidrologia": "pronostico-agroclimatico", "fenomeno-enso": "pronostico-agroclimatico",
 "pronostico-hidrologico": "pronostico-agroclimatico", "campana-agricola": "pronostico-agroclimatico",
 "disponibilidad-agua": "disponibilidad-de-agua", "recurso-hidrico": "disponibilidad-de-agua",
 "represas-riego": "disponibilidad-de-agua", "gestion-embalses": "hidrologia-energetica",
 "fuentes-agua": "disponibilidad-de-agua", "disponibilidad-fuentes": "disponibilidad-de-agua",
 "calidad-agua": "disponibilidad-de-agua", "calidad-agua-bruta": "disponibilidad-de-agua",
 "incendios": "recursos-forestales", "temporada-de-incendios": "recursos-forestales",
 "suelos-prioridad-forestal": "suelo-y-uso-del-suelo", "uso-de-suelo-agricola": "suelo-y-uso-del-suelo",
 "monte-nativo": "recursos-forestales", "expansion-de-area-forestada": "recursos-forestales",
 "estado-recursos": "estado-de-recursos-pesqueros", "estado-recursos-costeros": "estado-de-recursos-pesqueros",
 "corvina-brotola": "estado-de-recursos-pesqueros", "sobrepesca": "estado-de-recursos-pesqueros",
 "cuotas-captura": "estado-de-recursos-pesqueros",
 "ley-mineral": "recursos-mineros", "reservas": "recursos-mineros",
 "tipo-de-cambio": "tipo-de-cambio", "tipo-cambio-real-bilateral": "tipo-de-cambio",
 "competitividad-cambiaria": "tipo-de-cambio", "brecha-cambiaria-regional": "situacion-regional",
 "inflacion": "inflacion-y-precios-internos", "tasa-interes": "tasas-de-interes",
 "actividad-economica": "nivel-de-actividad-y-ciclo", "ciclo-economico": "nivel-de-actividad-y-ciclo",
 "ciclo-economico-regional": "situacion-regional", "ciclo-politico": "inversion-publica",
 "situacion-argentina-brasil": "situacion-regional", "ingreso-disponible-regional": "situacion-regional",
 "estabilidad-macro": "nivel-de-actividad-y-ciclo", "estabilidad": "nivel-de-actividad-y-ciclo",
 "diferencia-precios-frontera": "mercado-interno-y-consumo-nacional",
 "costo-energia": "energia-electrica", "energia": "energia-electrica", "energia-renovable": "transicion-energetica",
 "demanda-electrica": "energia-electrica", "capacidad-transmision": "energia-electrica",
 "interconexiones": "energia-electrica", "inversion-red": "energia-electrica", "curtailment": "energia-electrica",
 "nueva-demanda-de-data-centers": "energia-electrica",
 "combustibles": "combustibles-liquidos", "combustible": "combustibles-liquidos", "precio-petroleo": "combustibles-liquidos",
 "precio-combustible": "combustibles-liquidos", "precio-gasoil": "combustibles-liquidos",
 "abastecimiento-combustibles": "combustibles-liquidos", "combustibles-fosiles": "combustibles-liquidos",
 "shock-de-precio-del-petroleo": "combustibles-liquidos",
 "gas-natural": "gas-natural", "gas-importado": "gas-natural", "gas-argentino": "gas-natural",
 "precio-regional-gas": "gas-natural", "contratos-importacion": "gas-natural", "infraestructura-gasoducto": "gas-natural",
 "recurso-eolico": "transicion-energetica", "recurso-solar": "transicion-energetica",
 "aerogeneradores": "transicion-energetica", "paneles-fotovoltaicos": "transicion-energetica",
 "precio-modulos": "transicion-energetica", "generacion-distribuida": "transicion-energetica",
 "repotenciacion": "transicion-energetica", "variabilidad-interanual-viento": "transicion-energetica",
 "contratos-ppa": "transicion-energetica", "subastas-y-contratos-ppa": "transicion-energetica",
 "demanda-hidrogeno-verde": "transicion-energetica", "politica-europea-de-hidrogeno": "acuerdos-comerciales-y-aranceles",
 "tarifa-regulada": "tarifas-y-politica-energetica", "politica-energetica": "tarifas-y-politica-energetica",
 "politica-agroenergetica": "tarifas-y-politica-energetica", "mandato-mezcla": "tarifas-y-politica-energetica",
 "cambio-en-mandato-de-mezcla": "tarifas-y-politica-energetica", "cambio-en-el-mandato-de-mezcla-de-etanol": "tarifas-y-politica-energetica",
 "subsidios": "tarifas-y-politica-energetica",
 "comercio-exterior": "flujos-de-comercio-exterior", "exportacion": "flujos-de-comercio-exterior",
 "movimiento-de-contenedores": "flujos-de-comercio-exterior",
 "flete-internacional": "fletes-y-logistica-internacional", "logistica-fluvial-hidrovia": "fletes-y-logistica-internacional",
 "acuerdos-comerciales": "acuerdos-comerciales-y-aranceles", "nuevos-acuerdos-comerciales": "acuerdos-comerciales-y-aranceles",
 "acuerdo-mercosur-union-europea": "acuerdos-comerciales-y-aranceles",
 "regimen-aduanero": "regimenes-aduaneros-y-zonas-francas", "regimen-zonas-francas": "regimenes-aduaneros-y-zonas-francas",
 "regimen-puerto-libre": "regimenes-aduaneros-y-zonas-francas",
 "estado-rutas": "infraestructura-vial-y-camineria", "peajes": "infraestructura-vial-y-camineria",
 "caminos-rurales": "infraestructura-vial-y-camineria", "accesos-viales": "infraestructura-vial-y-camineria",
 "normativa-pesos-dimensiones": "transporte-carretero",
 "ferrocarril-central": "transporte-ferroviario",
 "dragado": "puertos-y-terminales", "calado-canales": "puertos-y-terminales",
 "infraestructura-portuaria": "puertos-y-terminales", "inversion-infraestructura": "puertos-y-terminales",
 "conectividad-terrestre": "logistica-e-infraestructura", "competencia-regional-puertos": "puertos-y-terminales",
 "inversiones-portuarias-regionales": "puertos-y-terminales", "nueva-terminal-o-concesion": "puertos-y-terminales",
 "cadena-frio": "almacenaje-y-cadena-de-frio", "logistica-refrigerada": "almacenaje-y-cadena-de-frio",
 "logistica-granos": "almacenaje-y-cadena-de-frio", "infraestructura-desembarco": "almacenaje-y-cadena-de-frio",
 "capacidad-almacenaje": "almacenaje-y-cadena-de-frio", "costos-logisticos": "logistica-e-infraestructura",
 "fertilizantes": "precios-de-fertilizantes-y-agroquimicos", "precio-fertilizantes": "precios-de-fertilizantes-y-agroquimicos",
 "agroquimicos": "precios-de-fertilizantes-y-agroquimicos", "semillas": "precios-de-fertilizantes-y-agroquimicos",
 "precio-fertilizantes-y-agroquimicos": "precios-de-fertilizantes-y-agroquimicos", "insumos-importados": "insumos-y-costos-de-produccion",
 "precio-granos": "precios-de-granos-y-raciones", "granos-forrajeros": "precios-de-granos-y-raciones",
 "raciones-balanceadas": "precios-de-granos-y-raciones", "precio-raciones": "precios-de-granos-y-raciones",
 "relacion-maiz-cerdo": "precios-de-granos-y-raciones", "precio-maiz-soja": "precios-de-granos-y-raciones",
 "costo-raciones": "precios-de-granos-y-raciones",
 "acero": "precios-de-metales-y-siderurgia", "precio-acero": "precios-de-metales-y-siderurgia",
 "aluminio": "precios-de-metales-y-siderurgia", "cobre": "precios-de-metales-y-siderurgia",
 "resinas": "precios-de-plasticos-y-quimicos", "resinas-plasticas": "precios-de-plasticos-y-quimicos",
 "resinas-importadas": "precios-de-plasticos-y-quimicos", "principios-activos": "precios-de-plasticos-y-quimicos",
 "costo-materiales": "costos-de-materiales-de-construccion", "costo-tableros": "costos-de-materiales-de-construccion",
 "costo-envases": "insumos-y-costos-de-produccion", "costo-malta": "precios-de-granos-y-raciones",
 "costo-insumos": "insumos-y-costos-de-produccion", "costo-alimentos": "mercado-interno-y-consumo-nacional",
 "disponibilidad-talento": "disponibilidad-de-talento-especializado", "formacion-tic": "disponibilidad-de-talento-especializado",
 "competencia-salarial-global": "disponibilidad-de-talento-especializado", "escasez-de-talento-especializado": "disponibilidad-de-talento-especializado",
 "talento": "disponibilidad-de-talento-especializado", "idiomas": "disponibilidad-de-talento-especializado",
 "costos-laborales": "costos-laborales-y-negociacion-colectiva", "salario-real": "empleo-y-mercado-de-trabajo",
 "mano-de-obra": "empleo-y-mercado-de-trabajo", "mano-de-obra-especializada": "empleo-y-mercado-de-trabajo",
 "mano-de-obra-portuaria": "empleo-y-mercado-de-trabajo", "informalidad": "empleo-y-mercado-de-trabajo",
 "credito": "credito-y-condiciones-financieras", "credito-hipotecario": "credito-y-condiciones-financieras",
 "financiamiento": "credito-y-condiciones-financieras", "financiamiento-comercio": "credito-y-condiciones-financieras",
 "financiamiento-multilateral": "inversion-publica", "confianza": "credito-y-condiciones-financieras",
 "inversion-publica": "inversion-publica", "presupuesto-publico": "inversion-publica", "obra-publica": "inversion-publica",
 "inversion-infraestructura-agua": "inversion-publica",
 "inversion-privada": "inversion-privada-e-ied", "inversion-extranjera": "inversion-privada-e-ied",
 "inversion-argentina": "inversion-privada-e-ied", "incentivos-inversion": "inversion-privada-e-ied",
 "atraccion-de-inversion": "inversion-privada-e-ied", "decisiones-finales-de-inversion": "inversion-privada-e-ied",
 "anuncios-de-grandes-obras": "inversion-privada-e-ied", "decision-de-nueva-capacidad": "inversion-privada-e-ied",
 "normativa-promocion": "regimenes-de-promocion-de-inversiones", "regimen-promocion-software": "regimenes-de-promocion-de-inversiones",
 "regimen-vivienda-promovida": "regimenes-de-promocion-de-inversiones", "regimen-automotriz": "regimenes-de-promocion-de-inversiones",
 "incentivos-audiovisuales": "regimenes-de-promocion-de-inversiones", "cabina-produccion": "regimenes-de-promocion-de-inversiones",
 "cambios-en-topes-y-beneficios": "regimenes-de-promocion-de-inversiones", "nuevos-regimenes-de-talento": "regimenes-de-promocion-de-inversiones",
 "normativa-sectorial": "normativa-sectorial-productiva", "marco-regulatorio": "normativa-sectorial-productiva",
 "marco-normativo": "normativa-sectorial-productiva", "marco-regulatorio-bcu": "normativa-sectorial-productiva",
 "normativa-inase": "normativa-sectorial-productiva", "operador": "normativa-sectorial-productiva",
 "licencias-ircca": "normativa-sectorial-productiva", "marco-regulatorio-cannabis": "normativa-sectorial-productiva",
 "normativa-ambiental": "normativa-ambiental-y-territorial", "normativa-territorial": "normativa-ambiental-y-territorial",
 "normativa-vertidos": "normativa-ambiental-y-territorial", "licencia-ambiental": "normativa-ambiental-y-territorial",
 "exigencia-regulatoria": "normativa-ambiental-y-territorial", "endurecimiento-de-exigencias-ambientales": "normativa-ambiental-y-territorial",
 "tratamiento-efluentes": "normativa-ambiental-y-territorial", "conflicto-ambiental-rio": "normativa-ambiental-y-territorial",
 "cambios-en-la-zonificacion": "normativa-ambiental-y-territorial",
 "impuestos-especificos": "politica-tributaria", "cambios-imesi": "politica-tributaria",
 "acceso-mercados": "politica-comercial-y-de-acceso-a-mercados", "acuerdo-de-precio-convenio": "politica-comercial-y-de-acceso-a-mercados",
 "politica-comercial-de-socios": "politica-comercial-y-de-acceso-a-mercados", "apertura-o-cierre-fitosanitario": "politica-comercial-y-de-acceso-a-mercados",
 "reapertura-o-cierre-de-china": "politica-comercial-y-de-acceso-a-mercados", "politica-lactea-de-brasil": "politica-comercial-y-de-acceso-a-mercados",
 "habilitacion-de-nuevos-mercados": "politica-comercial-y-de-acceso-a-mercados", "cierre-o-restriccion-de-mercados": "politica-comercial-y-de-acceso-a-mercados",
 "apertura-de-nuevos-mercados": "politica-comercial-y-de-acceso-a-mercados",
 "sanidad-animal": "sanidad-animal", "brote-aftosa": "sanidad-animal", "peste-porcina-africana": "sanidad-animal",
 "influenza-aviar": "sanidad-animal", "brotes-sanitarios-regionales": "sanidad-animal", "sanidad-apicola": "sanidad-animal",
 "sanidad-vegetal": "sanidad-vegetal", "mortandad-por-agroquimicos": "sanidad-vegetal", "uso-agroquimicos": "sanidad-vegetal",
 "sanidad-acuicola": "sanidad-acuicola",
 "habilitaciones-sanitarias": "estatus-sanitario-y-habilitaciones", "estatus-sanitario-pais": "estatus-sanitario-y-habilitaciones",
 "estatus-sanitario-pais-y-habilitaciones": "estatus-sanitario-y-habilitaciones", "trazabilidad": "inocuidad-alimentaria-y-residuos",
 "registro-sanitario": "estatus-sanitario-y-habilitaciones", "registro": "estatus-sanitario-y-habilitaciones",
 "residuos-y-rechazos-en-destino": "inocuidad-alimentaria-y-residuos", "normativa-sanitaria": "normativa-sectorial-productiva",
 "adopcion-tecnologica": "adopcion-tecnologica-y-digitalizacion",
 "genetica-animal": "genetica-y-biotecnologia", "genetica-bovina": "genetica-y-biotecnologia",
 "genetica-lechera": "genetica-y-biotecnologia", "genetica-ovina": "genetica-y-biotecnologia",
 "genetica-aviar": "genetica-y-biotecnologia", "genetica-aplicada": "genetica-y-biotecnologia",
 "material-genetico": "genetica-y-biotecnologia", "inoculantes": "genetica-y-biotecnologia",
 "vinculacion-academia-empresa": "investigacion-y-desarrollo", "financiamiento-anii": "investigacion-y-desarrollo",
 "financiamiento-id": "investigacion-y-desarrollo",
 "adopcion-ia": "inteligencia-artificial-y-automatizacion",
 "precios-internacionales": "precios-internacionales-de-commodities", "precios-commodities": "precios-internacionales-de-commodities",
 "precios-chicago": "precios-internacionales-de-commodities", "precio-leche-polvo-gdt": "precios-internacionales-de-commodities",
 "tendencia-precio-gdt": "precios-internacionales-de-commodities", "precio-celulosa-bhkp": "precios-internacionales-de-commodities",
 "precio-fibra-corta-china": "precios-internacionales-de-commodities", "precio-lana-en-australia": "precios-internacionales-de-commodities",
 "suba-sostenida-de-precios": "precios-internacionales-de-commodities", "caida-de-precios-internacionales": "precios-internacionales-de-commodities",
 "precios-referencia": "precios-internacionales-de-commodities", "precios-commodities-agricolas": "precios-internacionales-de-commodities",
 "demanda-china": "demanda-mundial-y-tendencias-de-consumo", "demanda-china-soja": "demanda-mundial-y-tendencias-de-consumo",
 "demanda-externa": "demanda-mundial-y-tendencias-de-consumo", "demanda-regional": "demanda-mundial-y-tendencias-de-consumo",
 "demanda-internacional": "demanda-mundial-y-tendencias-de-consumo", "concentracion-de-la-demanda-en-china": "demanda-mundial-y-tendencias-de-consumo",
 "consumo-mundial-de-vino": "demanda-mundial-y-tendencias-de-consumo", "ciclo-de-la-construccion-en-estados-unidos": "demanda-mundial-y-tendencias-de-consumo",
 "ciclo-de-inversion-tecnologica-global": "demanda-mundial-y-tendencias-de-consumo", "ciclo-de-inversion-tecnologica-eeuu": "demanda-mundial-y-tendencias-de-consumo",
 "relocalizacion-de-servicios": "demanda-mundial-y-tendencias-de-consumo", "demanda-automotriz": "demanda-mundial-y-tendencias-de-consumo",
 "demanda-construccion": "mercado-interno-y-consumo-nacional", "demanda-agro": "mercado-interno-y-consumo-nacional",
 "demanda-industrial": "nivel-de-actividad-y-ciclo", "demanda-forrajera": "precios-de-granos-y-raciones",
 "demanda-logistica": "transporte-y-logistica", "demanda-turistica": "turismo-receptivo-regional", "demanda-datos": "telecomunicaciones-e-infraestructura-digital",
 "consumo-interno": "mercado-interno-y-consumo-nacional", "habitos-de-consumo": "mercado-interno-y-consumo-nacional",
 "sustitucion-entre-carnes": "mercado-interno-y-consumo-nacional", "cerveza-artesanal": "mercado-interno-y-consumo-nacional",
 "carne-baja-emisiones": "mercado-de-carbono-y-sostenibilidad", "mercado-bonos-carbono": "mercado-de-carbono-y-sostenibilidad",
 "certificacion-fsc": "mercado-de-carbono-y-sostenibilidad", "certificacion-forestal": "mercado-de-carbono-y-sostenibilidad",
 "creditos-carbono": "mercado-de-carbono-y-sostenibilidad", "mercados-carbono": "mercado-de-carbono-y-sostenibilidad",
 "posicionamiento-marca-pais": "competencia-internacional",
 "competencia-importada": "mercado-interno-y-consumo-nacional", "importaciones-competencia": "mercado-interno-y-consumo-nacional",
 "competencia-importacion-brasil": "mercado-interno-y-consumo-nacional", "competencia-exportacion-pie": "competencia-internacional",
 "competencia-con-celulosa": "complejo-forestal-celulosa", "competencia-global-de-proyectos": "competencia-internacional",
 "turismo-receptivo": "turismo-receptivo-regional", "flujo-turistico": "turismo-receptivo-regional",
 "conectividad-aerea": "turismo-receptivo-regional", "nueva-conectividad-aerea": "turismo-receptivo-regional",
 "estacionalidad": "turismo-receptivo-regional", "reservas-aereas-y-hoteleras-anticipadas": "turismo-receptivo-regional",
 "regional-mercosur": "demanda-mundial-y-tendencias-de-consumo", "mercado-global": "demanda-mundial-y-tendencias-de-consumo",
 "mercado-interno": "mercado-interno-y-consumo-nacional",
 "acopio-granos": "comercializacion-y-canales", "margenes": "comercializacion-y-canales", "cadena-suministro": "comercializacion-y-canales",
 "diferencia-precios-frontera-comercio": "comercializacion-y-canales",
 "conectividad-internacional": "telecomunicaciones-e-infraestructura-digital", "conectividad": "telecomunicaciones-e-infraestructura-digital",
 "conectividad-fibra": "telecomunicaciones-e-infraestructura-digital", "espectro": "telecomunicaciones-e-infraestructura-digital",
 "espectro-asignado": "telecomunicaciones-e-infraestructura-digital",
 "oferta-ganado": "complejo-carne-bovina", "ciclo-ganadero": "complejo-carne-bovina", "ciclo-ganadero-regional": "complejo-carne-bovina",
 "intencion-de-retencion-o-liquidacion": "complejo-carne-bovina", "trazabilidad-ganadera": "complejo-carne-bovina",
 "oferta-lana": "complejo-ovino-lana", "zafra-lana": "complejo-ovino-lana",
 "oferta-cueros": "complejo-carne-bovina", "remision-leche": "complejo-lacteo", "estacionalidad-produccion-leche": "complejo-lacteo",
 "remision-leche-tendencia": "complejo-lacteo",
 "abastecimiento-madera": "complejo-forestal-celulosa", "abastecimiento-rolos": "complejo-forestal-celulosa",
 "volumen-forestal": "complejo-forestal-celulosa", "certificacion-forestal-fsc": "mercado-de-carbono-y-sostenibilidad",
 "abastecimiento-grano": "complejo-agricola-granos-y-oleaginosos", "cosecha": "complejo-agricola-granos-y-oleaginosos",
 "cosecha-uva": "complejo-vitivinicola", "bodegas": "complejo-vitivinicola",
 "abastecimiento-cana": "complejo-sucroalcoholero", "planta-industrial-unica": "complejo-sucroalcoholero",
 "abastecimiento-materia-prima": "insumos-y-costos-de-produccion", "abastecimiento-fibra": "complejo-forestal-celulosa",
 "abastecimiento-biomasa": "complejo-forestal-celulosa",
 "intencion-de-siembra": "complejo-agricola-granos-y-oleaginosos", "stocks-mundiales-de-granos": "precios-internacionales-de-commodities",
 "acuerdo-argentina": "acuerdos-comerciales-y-aranceles", "zona-comun-pesca": "acuerdos-comerciales-y-aranceles",
 "areas-de-exclusion": "normativa-sectorial-productiva",
 "trazabilidad-y-bienestar-animal": "inocuidad-alimentaria-y-residuos",
}

# categoria de ramificacion -> dominio (fallback)
CATMAP = {
 "climate_factors": "clima-y-agua", "sanitary_factors": "sanidad", "environmental_factors": "normativa-ambiental-y-territorial",
 "regulatory_factors": "regulacion-y-politicas", "cost_factors": "insumos-y-costos-de-produccion",
 "financial_factors": "financiamiento-e-inversion", "labor_factors": "laboral", "infrastructure": "logistica-e-infraestructura",
 "logistics": "logistica-e-infraestructura", "economic_factors": "economia-macro", "demand_factors": "demanda-mundial-y-tendencias-de-consumo",
 "markets": "mercados", "technologies": "tecnologia-e-innovacion", "competitive_factors": "competencia-internacional",
 "resources": "recursos-naturales",
}
SIGMAP = {
 "demanda": "demanda-mundial-y-tendencias-de-consumo", "consumo": "mercado-interno-y-consumo-nacional",
 "precios": "precios-internacionales-de-commodities", "costos": "insumos-y-costos-de-produccion",
 "oferta": None, "capacidad-productiva": None, "inversion": "inversion-privada-e-ied",
 "comercio-exterior": "flujos-de-comercio-exterior", "acceso-a-mercados": "politica-comercial-y-de-acceso-a-mercados",
 "regulacion": "regulacion-y-politicas", "tecnologia": "tecnologia-e-innovacion", "sustitucion": "mercado-interno-y-consumo-nacional",
 "competencia": "competencia-internacional", "infraestructura-logistica": "logistica-e-infraestructura",
 "clima-agua": "clima-y-agua", "recursos-naturales": "recursos-naturales", "sanidad": "sanidad",
 "financiamiento": "financiamiento-e-inversion", "empleo-talento": "laboral",
}

def resolve(r, aid):
    tid = r["id"]
    if tid in TOKENMAP:
        return TOKENMAP[tid]
    if r["category"] == "strategic_signals":
        st = r.get("signal_type")
        return SIGMAP.get(st) or sect_of(aid)
    if r["category"] == "value_chain":
        return sect_of(r.get("target_activity_id") or aid)
    if r.get("target_activity_id"):
        return sect_of(r["target_activity_id"])
    if tid.endswith("-requisitos-y-barreras"):
        return "barreras-y-requisitos-de-acceso"
    if tid.endswith("-competencia"):
        return "competencia-internacional"
    if tid.endswith("-precios"):
        return "precios-internacionales-de-commodities"
    if tid.endswith("-demanda"):
        return "demanda-mundial-y-tendencias-de-consumo"
    if tid.startswith("mercados-destino"):
        return "mercados-destino"
    if r["category"] in ("products", "inputs"):
        return sect_of(aid)
    if r["category"] in CATMAP:
        return CATMAP[r["category"]]
    return sect_of(aid)

# =====================================================================  SCAN
dom = {d[0]: {"id": d[0], "name": d[1], "type": d[2], "parent_domain_id": d[3],
              "description": d[4], "children": [],
              "related_activities": set(), "related_ramifications": set(), "related_signals": set()}
       for d in D}
for d in D:
    if d[3]:
        dom[d[3]]["children"].append(d[0])

unmapped = collections.Counter()

def visit(r, aid):
    did = resolve(r, aid)
    if did and did in dom:
        dom[did]["related_activities"].add(aid)
        dom[did]["related_ramifications"].add(r["id"])
        if r.get("signal_type"):
            dom[did]["related_signals"].add(r["signal_type"])
    else:
        unmapped[r["id"]] += 1
    for c in r.get("children", []):
        visit(c, aid)

import glob
for f in glob.glob(RDIR + "/*.json"):
    b = os.path.basename(f)
    if b.startswith("_"):
        continue
    d = json.load(open(f, encoding="utf-8"))
    aid = d["activity_id"]
    rs = d.get("ramifications")
    if d["level"] == "subactivity":
        rs = d["ramification_deltas"]["add"]
        # la subactividad hereda los dominios del padre salvo los quitados
        removed = {x["id"] for x in d["ramification_deltas"]["remove"]}
        pf = json.load(open(RDIR + "/" + d["inherits_from"] + ".json", encoding="utf-8"))
        for pr in pf["ramifications"]:
            if pr["id"] in removed:
                continue
            did = resolve(pr, d["inherits_from"])
            if did in dom:
                dom[did]["related_activities"].add(aid)
    for r in rs:
        visit(r, aid)

# cada actividad se asocia siempre a su dominio sectorial
for aid, a in acts.items():
    s = sect_of(aid)
    if s in dom:
        dom[s]["related_activities"].add(aid)

# los dominios padre agregan la cobertura de sus hijos
for d in D:
    if d[3] and d[3] in dom:
        for k in ("related_activities", "related_ramifications", "related_signals"):
            dom[d[3]][k] |= dom[d[0]][k]

# relaciones entre dominios (curadas, minimas)
REL_DOMAINS = {
 "hidrologia-energetica": ["pronostico-agroclimatico", "disponibilidad-de-agua", "energia-electrica"],
 "disponibilidad-de-agua": ["pronostico-agroclimatico", "hidrologia-energetica", "agua-potable-y-saneamiento"],
 "transicion-energetica": ["energia-electrica", "hidrogeno-verde-y-derivados", "inversion-privada-e-ied"],
 "combustibles-liquidos": ["transporte-carretero", "combustibles-y-gas", "economia-macro"],
 "precios-internacionales-de-commodities": ["demanda-mundial-y-tendencias-de-consumo", "tipo-de-cambio"],
 "mercados-destino": ["barreras-y-requisitos-de-acceso", "competencia-internacional", "demanda-mundial-y-tendencias-de-consumo",
                      "politica-comercial-y-de-acceso-a-mercados"],
 "sanidad-animal": ["estatus-sanitario-y-habilitaciones", "politica-comercial-y-de-acceso-a-mercados"],
 "situacion-regional": ["tipo-de-cambio", "turismo-receptivo-regional", "mercado-interno-y-consumo-nacional"],
 "puertos-y-terminales": ["fletes-y-logistica-internacional", "flujos-de-comercio-exterior"],
 "regimenes-de-promocion-de-inversiones": ["inversion-privada-e-ied", "politica-tributaria"],
}
for a, bs in REL_DOMAINS.items():
    dom[a]["related_domains"] = bs

# dimensiones de mercados-destino (paises/bloques como dimension, no como dominio)
dims = set()
for f in glob.glob(RDIR + "/*.json"):
    b = os.path.basename(f)
    if b.startswith("_"):
        continue
    d = json.load(open(f, encoding="utf-8"))
    rs = d.get("ramifications") or d.get("ramification_deltas", {}).get("add", [])
    def dd(r):
        if r["id"].startswith("mercados-destino"):
            for c in r.get("children", []):
                dims.add(c["id"])
        for c in r.get("children", []):
            dd(c)
    for r in rs:
        dd(r)
dom["mercados-destino"]["market_dimensions"] = sorted(dims)

# =====================================================================  OUTPUT
def finish(d):
    o = {"id": d["id"], "name": d["name"], "type": d["type"],
         "parent_domain_id": d["parent_domain_id"], "description": d["description"],
         "children": sorted(d["children"])}
    if d.get("related_domains"):
        o["related_domains"] = d["related_domains"]
    if d.get("market_dimensions"):
        o["market_dimensions"] = d["market_dimensions"]
    o["related_activities"] = sorted(d["related_activities"])
    o["related_ramifications"] = sorted(d["related_ramifications"])
    o["related_signals"] = sorted(d["related_signals"])
    return o

groups = {"transversal.json": [], "mercados.json": [], "sectoriales.json": []}
for d in D:
    o = finish(dom[d[0]])
    if d[2] == "sectorial":
        groups["sectoriales.json"].append(o)
    elif d[2] == "mercado":
        groups["mercados.json"].append(o)
    else:
        groups["transversal.json"].append(o)
for fn, items in groups.items():
    open(OUT + "/" + fn, "w", encoding="utf-8").write(
        json.dumps({"generated": "2026-09-10", "domains": items}, ensure_ascii=False, indent=2) + "\n")

alld = [finish(dom[d[0]]) for d in D]
by_type = collections.Counter(x["type"] for x in alld)
idx = {"generated": "2026-09-10",
       "sources": ["knowledge/activities/activities.json", "knowledge/ramifications/"],
       "counts": {
         "domains_total": len(alld),
         "by_type": dict(by_type),
         "transversal": sum(1 for x in alld if x["type"] not in ("sectorial", "mercado")),
         "sectorial": by_type["sectorial"],
         "market": by_type["mercado"],
         "with_activities": sum(1 for x in alld if x["related_activities"]),
         "rel_activities_total": sum(len(x["related_activities"]) for x in alld),
         "rel_ramifications_total": sum(len(x["related_ramifications"]) for x in alld),
         "rel_signals_total": sum(len(x["related_signals"]) for x in alld),
       },
       "domains": [{"id": x["id"], "name": x["name"], "type": x["type"],
                    "parent_domain_id": x["parent_domain_id"], "file": (
                       "sectoriales.json" if x["type"] == "sectorial" else
                       "mercados.json" if x["type"] == "mercado" else "transversal.json"),
                    "related_activities": len(x["related_activities"]),
                    "related_ramifications": len(x["related_ramifications"])}
                   for x in alld]}
open(OUT + "/_index.json", "w", encoding="utf-8").write(json.dumps(idx, ensure_ascii=False, indent=2) + "\n")

print(json.dumps(idx["counts"], indent=2, ensure_ascii=False))
print("\ndominios sin actividades:", [x["id"] for x in alld if not x["related_activities"]])
print("\ntokens de ramificacion sin dominio (%d distintos):" % len(unmapped))
for t, n in unmapped.most_common(40):
    print("  ", t, n)
