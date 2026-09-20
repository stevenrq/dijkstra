import type { EdgeWeights, Graph, GraphEdge, GraphNode } from "../graph/types";

/**
 * Red nacional de distribución de carga en Colombia.
 *
 * Las distancias y los tiempos son aproximaciones de los corredores viales
 * reales. El costo de flete NO es proporcional a la distancia: depende del
 * terreno (un paso de montaña como La Línea gasta mucho más combustible por
 * kilómetro que un tramo plano del Caribe), de los peajes y del acceso a
 * puerto. Esa es justamente la razón de ser de las tres métricas: sobre este
 * grafo, la ruta más barata, la más corta y la más rápida son rutas distintas.
 *
 * Cifras didácticas, no operativas.
 */

interface CityInput {
  id: string;
  label: string;
  kind: GraphNode["kind"];
  x: number;
  y: number;
  notes: string;
}

const CITIES: CityInput[] = [
  {
    id: "smr",
    label: "Santa Marta",
    kind: "port",
    x: 805,
    y: 101,
    notes: "Puerto marítimo sobre el Caribe.",
  },
  {
    id: "baq",
    label: "Barranquilla",
    kind: "hub",
    x: 660,
    y: 135,
    notes: "Centro de acopio del Caribe y puerto fluvial sobre el Magdalena.",
  },
  {
    id: "ctg",
    label: "Cartagena",
    kind: "port",
    x: 488,
    y: 203,
    notes: "Principal puerto de contenedores del país.",
  },
  {
    id: "vup",
    label: "Valledupar",
    kind: "delivery",
    x: 1034,
    y: 194,
    notes: "Punto de entrega del corredor Caribe-oriente.",
  },
  {
    id: "mtr",
    label: "Montería",
    kind: "warehouse",
    x: 399,
    y: 399,
    notes: "Bodega regional de Córdoba.",
  },
  {
    id: "cuc",
    label: "Cúcuta",
    kind: "delivery",
    x: 1216,
    y: 501,
    notes: "Frontera con Venezuela.",
  },
  {
    id: "bga",
    label: "Bucaramanga",
    kind: "warehouse",
    x: 1066,
    y: 593,
    notes: "Bodega del nororiente, cruce de la Troncal del Magdalena.",
  },
  {
    id: "mde",
    label: "Medellín",
    kind: "hub",
    x: 476,
    y: 697,
    notes: "Centro de acopio de Antioquia.",
  },
  {
    id: "tun",
    label: "Tunja",
    kind: "delivery",
    x: 1008,
    y: 782,
    notes: "Paso obligado del corredor Bogotá-Bucaramanga por Boyacá.",
  },
  {
    id: "bog",
    label: "Bogotá D.C.",
    kind: "hub",
    x: 836,
    y: 881,
    notes: "Centro de acopio principal y mayor mercado de consumo.",
  },
  {
    id: "mzl",
    label: "Manizales",
    kind: "delivery",
    x: 502,
    y: 826,
    notes: "Eje cafetero.",
  },
  {
    id: "per",
    label: "Pereira",
    kind: "warehouse",
    x: 421,
    y: 868,
    notes: "Bodega del eje cafetero.",
  },
  {
    id: "arm",
    label: "Armenia",
    kind: "delivery",
    x: 440,
    y: 940,
    notes: "Eje cafetero, entrada occidental a La Línea.",
  },
  {
    id: "ibg",
    label: "Ibagué",
    kind: "warehouse",
    x: 556,
    y: 913,
    notes: "Bodega del Tolima, entrada oriental a La Línea.",
  },
  {
    id: "vvc",
    label: "Villavicencio",
    kind: "warehouse",
    x: 975,
    y: 1010,
    notes: "Puerta de los Llanos Orientales.",
  },
  {
    id: "cli",
    label: "Cali",
    kind: "hub",
    x: 244,
    y: 1033,
    notes: "Centro de acopio del suroccidente.",
  },
  {
    id: "bun",
    label: "Buenaventura",
    kind: "port",
    x: 98,
    y: 1008,
    notes: "Principal puerto del Pacífico.",
  },
  {
    id: "nva",
    label: "Neiva",
    kind: "warehouse",
    x: 544,
    y: 1093,
    notes: "Bodega del Huila.",
  },
  {
    id: "ppn",
    label: "Popayán",
    kind: "delivery",
    x: 222,
    y: 1152,
    notes: "Corredor panamericano hacia el sur.",
  },
  {
    id: "pas",
    label: "Pasto",
    kind: "delivery",
    x: 60,
    y: 1299,
    notes: "Frontera sur con Ecuador.",
  },
];

interface CorridorInput {
  from: string;
  to: string;
  label: string;
  /** Kilómetros por carretera. */
  km: number;
  /** Horas de recorrido de un camión de carga. */
  hours: number;
  /** Costo de flete en COP. */
  cop: number;
}

const CORRIDORS: CorridorInput[] = [
  // --- Corredor Caribe: terreno plano, el flete por kilómetro más barato ---
  { from: "ctg", to: "baq", label: "Vía al Mar", km: 120, hours: 2.2, cop: 505_000 },
  { from: "baq", to: "smr", label: "Troncal del Caribe", km: 95, hours: 1.8, cop: 400_000 },
  { from: "smr", to: "vup", label: "Vía Bosconia", km: 210, hours: 3.8, cop: 925_000 },
  { from: "baq", to: "vup", label: "Ruta del Sol tramo Caribe", km: 280, hours: 5.0, cop: 1_205_000 },
  { from: "ctg", to: "mtr", label: "Troncal de Occidente", km: 245, hours: 4.8, cop: 1_130_000 },

  // --- Conexiones Caribe - interior ---
  { from: "mtr", to: "mde", label: "Vía Caucasia", km: 330, hours: 7.8, cop: 2_245_000 },
  { from: "baq", to: "bga", label: "Ruta del Sol - Troncal de Oriente", km: 570, hours: 10.5, cop: 2_565_000 },
  { from: "vup", to: "bga", label: "Troncal de Oriente", km: 460, hours: 8.5, cop: 2_160_000 },
  { from: "ctg", to: "mde", label: "Troncal de Occidente", km: 640, hours: 12.5, cop: 3_330_000 },

  // --- Nororiente ---
  { from: "bga", to: "cuc", label: "Vía Pamplona", km: 200, hours: 5.0, cop: 1_480_000 },
  { from: "bga", to: "tun", label: "Vía Barbosa", km: 265, hours: 5.5, cop: 1_645_000 },
  { from: "bog", to: "tun", label: "Autopista Norte", km: 145, hours: 3.0, cop: 785_000 },
  { from: "bog", to: "bga", label: "Vía Vélez (directa)", km: 400, hours: 9.0, cop: 2_360_000 },
  { from: "mde", to: "bga", label: "Vía Puerto Berrío", km: 390, hours: 8.0, cop: 2_495_000 },

  // --- Centro ---
  { from: "mde", to: "bog", label: "Autopista Medellín-Bogotá", km: 415, hours: 9.0, cop: 2_700_000 },
  { from: "bog", to: "vvc", label: "Vía al Llano", km: 120, hours: 3.0, cop: 960_000 },
  { from: "bog", to: "ibg", label: "Vía Girardot", km: 200, hours: 4.5, cop: 1_160_000 },
  { from: "bog", to: "nva", label: "Vía Neiva", km: 300, hours: 6.0, cop: 1_590_000 },

  // --- Eje cafetero: montaña, el flete por kilómetro más caro ---
  { from: "mde", to: "mzl", label: "Vía La Pintada", km: 195, hours: 4.5, cop: 1_600_000 },
  { from: "mzl", to: "per", label: "Vía Chinchiná", km: 50, hours: 1.2, cop: 300_000 },
  { from: "per", to: "arm", label: "Autopista del Café", km: 45, hours: 1.0, cop: 235_000 },
  { from: "arm", to: "ibg", label: "Cruce de La Línea", km: 95, hours: 2.8, cop: 905_000 },
  { from: "mde", to: "per", label: "Vía Anserma", km: 230, hours: 5.0, cop: 1_610_000 },
  { from: "per", to: "cli", label: "Vía Cartago", km: 215, hours: 4.0, cop: 1_030_000 },

  // --- Suroccidente ---
  { from: "cli", to: "bun", label: "Vía Buenaventura", km: 125, hours: 3.0, cop: 1_100_000 },
  { from: "cli", to: "ppn", label: "Panamericana", km: 140, hours: 2.8, cop: 700_000 },
  { from: "ppn", to: "pas", label: "Panamericana sur", km: 250, hours: 5.5, cop: 2_150_000 },
  { from: "nva", to: "ibg", label: "Vía Natagaima", km: 180, hours: 4.0, cop: 1_010_000 },
  { from: "nva", to: "ppn", label: "Vía La Plata", km: 270, hours: 6.5, cop: 2_105_000 },
];

const nodes: GraphNode[] = CITIES.map((city) => ({
  id: city.id,
  label: city.label,
  kind: city.kind,
  x: city.x,
  y: city.y,
  notes: city.notes,
}));

const edges: GraphEdge[] = CORRIDORS.map((corridor) => {
  const weights: EdgeWeights = {
    cost: corridor.cop,
    distance: corridor.km,
    time: corridor.hours,
  };
  return {
    id: `${corridor.from}-${corridor.to}`,
    from: corridor.from,
    to: corridor.to,
    directed: false,
    weights,
    label: corridor.label,
  };
});

export const colombiaGraph: Graph = {
  id: "colombia",
  name: "Red nacional de distribución (Colombia)",
  description:
    "20 ciudades y 29 corredores viales del país. Cada corredor guarda su costo de flete, " +
    "su distancia y su tiempo de recorrido. Como el costo depende del terreno y no solo de " +
    "los kilómetros, la ruta más barata no coincide con la más corta ni con la más rápida.",
  nodes,
  edges,
};

/**
 * Pareja recomendada para la demostración.
 *
 * Bogotá → Cartagena da tres rutas distintas según la métrica:
 *   - distancia: Bogotá → Medellín → Montería → Cartagena  (990 km)
 *   - costo:     Bogotá → Bucaramanga → Barranquilla → Cartagena  ($5.430.000)
 *   - tiempo:    Bogotá → Tunja → Bucaramanga → Barranquilla → Cartagena  (21,2 h)
 */
export const COLOMBIA_DEMO = { source: "bog", target: "ctg" } as const;
