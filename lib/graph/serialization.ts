import { METRICS, type Graph, type GraphEdge, type GraphNode } from "./types";

/**
 * Exportación e importación del grafo en JSON.
 *
 * El JSON que se importa puede venir de cualquier parte, así que se valida
 * campo por campo en vez de confiar en un `as Graph`.
 */

export const GRAPH_FILE_VERSION = 1;

interface GraphFile {
  version: number;
  graph: Graph;
}

export function serializeGraph(graph: Graph): string {
  const payload: GraphFile = { version: GRAPH_FILE_VERSION, graph };
  return JSON.stringify(payload, null, 2);
}

export class GraphParseError extends Error {}

function expectString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new GraphParseError(`Falta el campo de texto "${field}".`);
  }
  return value;
}

function expectFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new GraphParseError(`El campo "${field}" debe ser un número finito.`);
  }
  return value;
}

function parseNode(raw: unknown, index: number): GraphNode {
  if (typeof raw !== "object" || raw === null) {
    throw new GraphParseError(`El nodo #${index + 1} no es un objeto.`);
  }
  const node = raw as Record<string, unknown>;
  return {
    id: expectString(node.id, `nodes[${index}].id`),
    label: expectString(node.label, `nodes[${index}].label`),
    kind: (typeof node.kind === "string"
      ? node.kind
      : "junction") as GraphNode["kind"],
    x: expectFiniteNumber(node.x, `nodes[${index}].x`),
    y: expectFiniteNumber(node.y, `nodes[${index}].y`),
    notes: typeof node.notes === "string" ? node.notes : undefined,
  };
}

function parseEdge(raw: unknown, index: number, nodeIds: Set<string>): GraphEdge {
  if (typeof raw !== "object" || raw === null) {
    throw new GraphParseError(`La arista #${index + 1} no es un objeto.`);
  }
  const edge = raw as Record<string, unknown>;
  const from = expectString(edge.from, `edges[${index}].from`);
  const to = expectString(edge.to, `edges[${index}].to`);

  if (!nodeIds.has(from) || !nodeIds.has(to)) {
    throw new GraphParseError(
      `La arista #${index + 1} conecta nodos que no existen en el archivo.`,
    );
  }

  const rawWeights = edge.weights;
  if (typeof rawWeights !== "object" || rawWeights === null) {
    throw new GraphParseError(`La arista #${index + 1} no tiene pesos.`);
  }
  const weightsRecord = rawWeights as Record<string, unknown>;
  const weights = { cost: 0, distance: 0, time: 0 };
  for (const metric of METRICS) {
    const value = expectFiniteNumber(
      weightsRecord[metric],
      `edges[${index}].weights.${metric}`,
    );
    if (value < 0) {
      throw new GraphParseError(
        `La arista #${index + 1} trae un peso negativo en "${metric}". Dijkstra exige pesos no negativos.`,
      );
    }
    weights[metric] = value;
  }

  return {
    id: expectString(edge.id, `edges[${index}].id`),
    from,
    to,
    directed: edge.directed === true,
    weights,
    label: typeof edge.label === "string" ? edge.label : undefined,
  };
}

export function parseGraph(text: string): Graph {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GraphParseError("El archivo no contiene JSON válido.");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new GraphParseError("El archivo no contiene un objeto JSON.");
  }

  // Se acepta tanto el envoltorio { version, graph } como un grafo suelto.
  const container = parsed as Record<string, unknown>;
  const rawGraph = (
    "graph" in container ? container.graph : container
  ) as Record<string, unknown> | null;

  if (typeof rawGraph !== "object" || rawGraph === null) {
    throw new GraphParseError("No se encontró el grafo dentro del archivo.");
  }

  if (!Array.isArray(rawGraph.nodes) || !Array.isArray(rawGraph.edges)) {
    throw new GraphParseError(
      'El grafo debe tener los arreglos "nodes" y "edges".',
    );
  }

  const nodes = rawGraph.nodes.map(parseNode);
  const ids = new Set(nodes.map((node) => node.id));
  if (ids.size !== nodes.length) {
    throw new GraphParseError("Hay identificadores de nodo repetidos.");
  }

  const edges = rawGraph.edges.map((raw, index) => parseEdge(raw, index, ids));
  const edgeIds = new Set(edges.map((edge) => edge.id));
  if (edgeIds.size !== edges.length) {
    throw new GraphParseError("Hay identificadores de arista repetidos.");
  }

  return {
    id: typeof rawGraph.id === "string" ? rawGraph.id : "importado",
    name: typeof rawGraph.name === "string" ? rawGraph.name : "Grafo importado",
    description:
      typeof rawGraph.description === "string" ? rawGraph.description : "",
    nodes,
    edges,
  };
}

/** Descarga el grafo como archivo .json desde el navegador. */
export function downloadGraph(graph: Graph, filename?: string): void {
  const blob = new Blob([serializeGraph(graph)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename ?? `${graph.id || "grafo"}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
