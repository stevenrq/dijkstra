import type { Graph, GraphEdge, NodeId } from "../graph/types";
import { colombiaGraph, COLOMBIA_DEMO } from "./colombia";

export interface Scenario {
  id: string;
  name: string;
  description: string;
  graph: Graph;
  /** Origen y destino sugeridos al cargar el escenario. */
  suggested?: { source: NodeId; target: NodeId };
  /** Resultado conocido de antemano, para verificar la implementación. */
  expected?: string;
}

/**
 * En los grafos académicos las tres métricas llevan el mismo número, de modo
 * que el resultado conocido se cumple sin importar cuál esté seleccionada.
 */
function uniformEdge(
  id: string,
  from: string,
  to: string,
  weight: number,
  directed = true,
): GraphEdge {
  return {
    id,
    from,
    to,
    directed,
    weights: { cost: weight, distance: weight, time: weight },
  };
}

/**
 * Dígrafo clásico de 5 nodos.
 *
 * Resultado conocido desde A: d(A)=0, d(B)=8, d(C)=9, d(D)=5, d(E)=7.
 * La ruta A→C es A→D→B→C = 5+3+1 = 9, y NO la tentadora A→B→C = 11.
 *
 * Es un buen caso de prueba porque D→B mejora a B de 10 a 8 *después* de que B
 * ya estaba en la cola: obliga a ejercitar el borrado perezoso del montículo.
 */
const clrsGraph: Graph = {
  id: "academico-clrs",
  name: "Dígrafo académico de 5 nodos",
  description:
    "Grafo dirigido de referencia con solución conocida a mano. Desde A: " +
    "d(B)=8, d(C)=9, d(D)=5, d(E)=7. La ruta mínima A→C es A→D→B→C con costo 9, " +
    "no la ruta directa A→B→C que costaría 11.",
  nodes: [
    { id: "A", label: "A", kind: "hub", x: 250, y: 200 },
    { id: "B", label: "B", kind: "junction", x: 550, y: 140 },
    { id: "C", label: "C", kind: "delivery", x: 820, y: 240 },
    { id: "D", label: "D", kind: "junction", x: 480, y: 430 },
    { id: "E", label: "E", kind: "delivery", x: 780, y: 520 },
  ],
  edges: [
    uniformEdge("A-B", "A", "B", 10),
    uniformEdge("A-D", "A", "D", 5),
    uniformEdge("B-C", "B", "C", 1),
    uniformEdge("B-D", "B", "D", 2),
    uniformEdge("C-E", "C", "E", 4),
    uniformEdge("D-B", "D", "B", 3),
    uniformEdge("D-C", "D", "C", 9),
    uniformEdge("D-E", "D", "E", 2),
    uniformEdge("E-A", "E", "A", 7),
    uniformEdge("E-C", "E", "C", 6),
  ],
};

/**
 * Prueba de aristas paralelas, empate y sentido único.
 *
 * d(S) = 7 por dos rutas igual de buenas (P→Q→S y P→R→S). La ruta elegida debe
 * usar la paralela P→Q de peso 4 y no la de peso 6: si la aplicación resalta la
 * arista equivocada, es que no está guardando qué arista concreta usó para
 * llegar a cada nodo.
 */
const parallelGraph: Graph = {
  id: "academico-paralelas",
  name: "Aristas paralelas y empate",
  description:
    "Dos rutas de costo 7 empatadas hacia S, dos aristas paralelas P→Q (de peso 4 y de peso 6) " +
    "y un tramo de sentido único S→P. Sirve para comprobar que se resalta la arista correcta " +
    "y que el desempate es determinista.",
  nodes: [
    { id: "P", label: "P", kind: "hub", x: 250, y: 320 },
    { id: "Q", label: "Q", kind: "junction", x: 550, y: 180 },
    { id: "R", label: "R", kind: "junction", x: 550, y: 470 },
    { id: "S", label: "S", kind: "delivery", x: 840, y: 320 },
  ],
  edges: [
    uniformEdge("P-Q-barata", "P", "Q", 4),
    uniformEdge("P-Q-cara", "P", "Q", 6),
    uniformEdge("P-R", "P", "R", 4),
    uniformEdge("Q-S", "Q", "S", 3),
    uniformEdge("R-S", "R", "S", 3),
    uniformEdge("S-P", "S", "P", 1),
  ],
};

/** Igual que el dígrafo de 5 nodos pero con un nodo aislado. */
const disconnectedGraph: Graph = {
  ...clrsGraph,
  id: "academico-desconectado",
  name: "Grafo desconectado",
  description:
    "El dígrafo de 5 nodos más un nodo F aislado. Al pedir la ruta A→F la aplicación debe " +
    "reportar que no existe ruta, con distancia infinita.",
  nodes: [
    ...clrsGraph.nodes,
    { id: "F", label: "F", kind: "delivery", x: 250, y: 560 },
  ],
};

const emptyGraph: Graph = {
  id: "vacio",
  name: "Lienzo en blanco",
  description:
    "Grafo vacío para construir una red desde cero: agrega nodos, conéctalos y define sus pesos.",
  nodes: [],
  edges: [],
};

export const SCENARIOS: Scenario[] = [
  {
    id: "colombia",
    name: colombiaGraph.name,
    description: colombiaGraph.description,
    graph: colombiaGraph,
    suggested: { source: COLOMBIA_DEMO.source, target: COLOMBIA_DEMO.target },
    expected:
      "Bogotá → Cartagena da una ruta distinta con cada métrica: la más corta pasa por " +
      "Medellín y Montería, la más barata por Bucaramanga y Barranquilla, y la más rápida " +
      "añade el paso por Tunja.",
  },
  {
    id: "academico-clrs",
    name: clrsGraph.name,
    description: clrsGraph.description,
    graph: clrsGraph,
    suggested: { source: "A", target: "C" },
    expected: "A → D → B → C con costo total 9.",
  },
  {
    id: "academico-paralelas",
    name: parallelGraph.name,
    description: parallelGraph.description,
    graph: parallelGraph,
    suggested: { source: "P", target: "S" },
    expected: "Costo total 7, usando la arista paralela de peso 4.",
  },
  {
    id: "academico-desconectado",
    name: disconnectedGraph.name,
    description: disconnectedGraph.description,
    graph: disconnectedGraph,
    suggested: { source: "A", target: "F" },
    expected: "No existe ruta: d(F) = ∞.",
  },
  {
    id: "vacio",
    name: emptyGraph.name,
    description: emptyGraph.description,
    graph: emptyGraph,
  },
];

export const DEFAULT_SCENARIO_ID = "colombia";

export function getScenario(id: string): Scenario {
  return (
    SCENARIOS.find((scenario) => scenario.id === id) ??
    SCENARIOS.find((scenario) => scenario.id === DEFAULT_SCENARIO_ID)!
  );
}

/** Copia profunda: el estado nunca debe mutar los escenarios del módulo. */
export function cloneGraph(graph: Graph): Graph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({ ...node })),
    edges: graph.edges.map((edge) => ({
      ...edge,
      weights: { ...edge.weights },
    })),
  };
}

export { colombiaGraph, COLOMBIA_DEMO };
