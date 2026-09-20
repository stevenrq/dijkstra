import type {
  AdjacencyList,
  Arc,
  Graph,
  GraphEdge,
  Metric,
  NodeId,
} from "./types";

/**
 * Proyecta el grafo sobre una métrica y devuelve la lista de adyacencia.
 *
 * - Una arista con `directed: false` genera los dos arcos (ida y vuelta).
 * - Los lazos (`from === to`) se descartan: con pesos no negativos nunca
 *   pueden mejorar una distancia, así que no aportan nada a Dijkstra.
 * - Las aristas paralelas se conservan tal cual. La relajación se queda con la
 *   más barata por sí sola, sin necesidad de filtrarlas antes.
 */
export function buildAdjacency(graph: Graph, metric: Metric): AdjacencyList {
  const adjacency = new Map<NodeId, Arc[]>();
  for (const node of graph.nodes) {
    adjacency.set(node.id, []);
  }

  for (const edge of graph.edges) {
    if (edge.from === edge.to) continue;
    const forward = adjacency.get(edge.from);
    if (!forward) continue;
    const weight = edge.weights[metric];
    forward.push({ edgeId: edge.id, to: edge.to, weight });

    if (!edge.directed) {
      const backward = adjacency.get(edge.to);
      if (backward) {
        backward.push({ edgeId: edge.id, to: edge.from, weight });
      }
    }
  }

  return adjacency;
}

/** Grado (salida + entrada no dirigida) de un nodo. */
export function degreeOf(graph: Graph, nodeId: NodeId): number {
  let degree = 0;
  for (const edge of graph.edges) {
    if (edge.from === nodeId) degree++;
    if (edge.to === nodeId && edge.from !== nodeId) degree++;
  }
  return degree;
}

/** Aristas incidentes a un nodo (en cualquier sentido). */
export function incidentEdges(graph: Graph, nodeId: NodeId): GraphEdge[] {
  return graph.edges.filter(
    (edge) => edge.from === nodeId || edge.to === nodeId,
  );
}

export interface AdjacencyMatrix {
  ids: NodeId[];
  labels: string[];
  /** `null` donde no hay arco. Con paralelas se conserva el peso menor. */
  cells: (number | null)[][];
}

/**
 * Matriz de adyacencia sobre una métrica. Si existen aristas paralelas entre
 * el mismo par, la celda muestra la de menor peso — que es la que Dijkstra
 * terminaría usando.
 */
export function buildAdjacencyMatrix(
  graph: Graph,
  metric: Metric,
): AdjacencyMatrix {
  const ids = graph.nodes.map((node) => node.id);
  const labels = graph.nodes.map((node) => node.label);
  const index = new Map<NodeId, number>();
  ids.forEach((id, i) => index.set(id, i));

  const cells: (number | null)[][] = ids.map(() => ids.map(() => null));

  const set = (from: NodeId, to: NodeId, weight: number) => {
    const i = index.get(from);
    const j = index.get(to);
    if (i === undefined || j === undefined) return;
    const current = cells[i][j];
    cells[i][j] = current === null ? weight : Math.min(current, weight);
  };

  for (const edge of graph.edges) {
    set(edge.from, edge.to, edge.weights[metric]);
    if (!edge.directed) set(edge.to, edge.from, edge.weights[metric]);
  }

  return { ids, labels, cells };
}

export interface AdjacencyListRow {
  id: NodeId;
  label: string;
  arcs: { to: NodeId; label: string; weight: number; edgeId: string }[];
}

/** Lista de adyacencia lista para mostrar en pantalla. */
export function buildAdjacencyRows(
  graph: Graph,
  metric: Metric,
): AdjacencyListRow[] {
  const adjacency = buildAdjacency(graph, metric);
  const labelOf = new Map(graph.nodes.map((node) => [node.id, node.label]));

  return graph.nodes.map((node) => ({
    id: node.id,
    label: node.label,
    arcs: (adjacency.get(node.id) ?? [])
      .map((arc: Arc) => ({
        to: arc.to,
        label: labelOf.get(arc.to) ?? arc.to,
        weight: arc.weight,
        edgeId: arc.edgeId,
      }))
      .sort((a, b) => a.weight - b.weight),
  }));
}

/** Conjunto de nodos alcanzables desde `origin` (recorrido en anchura). */
export function reachableFrom(
  graph: Graph,
  origin: NodeId,
  metric: Metric,
): Set<NodeId> {
  const adjacency = buildAdjacency(graph, metric);
  const seen = new Set<NodeId>([origin]);
  const queue: NodeId[] = [origin];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const arc of adjacency.get(current) ?? []) {
      if (!seen.has(arc.to)) {
        seen.add(arc.to);
        queue.push(arc.to);
      }
    }
  }
  return seen;
}
